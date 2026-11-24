import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DuckDBInstance,
  type DuckDBConnection,
  type Json,
} from "@duckdb/node-api";
import type { Client } from "pg";
import { leerManifest, mesesPublicados } from "./manifest.js";
import { mesesDelRango, type Mes } from "./meses.js";
import { MESES_CONSERVADOS, podarYActualizarBuyers } from "./poda.js";
import { conectar, enTransaccion } from "./postgres.js";
import { directorioOcds, rutaManifest, rutaParquet } from "./rutas.js";

const TABLAS_CARGA = ["tenders", "items", "awards"] as const;
type TablaCarga = (typeof TABLAS_CARGA)[number];

const LOTE = 2000;

export interface OpcionesCarga {
  raiz: string;
  databaseUrl: string;
  desde?: string;
  hasta?: string;
  conservarMeses?: number;
  log?: (mensaje: string) => void;
}

export interface ResultadoMes {
  mes: string;
  tenders: number;
  items: number;
  awards: number;
}

export interface ResultadoCarga {
  meses: ResultadoMes[];
  mesesBorrados: string[];
  buyers: number;
}

type Fila = Record<string, string | null>;

export async function cargarOcds(
  opciones: OpcionesCarga,
): Promise<ResultadoCarga> {
  if ((opciones.desde === undefined) !== (opciones.hasta === undefined)) {
    throw new Error("desde y hasta van juntos");
  }
  const log = opciones.log ?? ((mensaje: string) => console.log(mensaje));
  const meses = await mesesParaCargar(
    opciones.raiz,
    opciones.desde,
    opciones.hasta,
  );
  const client = await conectar(opciones.databaseUrl);
  try {
    await exigirEsquema(client);
    const manifest = await leerManifest(rutaManifest(opciones.raiz));
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();
    const resultados: ResultadoMes[] = [];
    try {
      await connection.run("SET TimeZone = 'UTC'");
      for (const mes of meses) {
        const inicio = new Date();
        const resultado = await enTransaccion(client, () =>
          cargarMes(
            client,
            connection,
            opciones.raiz,
            mes,
            manifest.meses[mes.clave]?.sha256 ?? null,
            inicio,
          ),
        );
        resultados.push(resultado);
        log(
          `${resultado.mes} cargado: tenders=${resultado.tenders} items=${resultado.items} awards=${resultado.awards}`,
        );
      }
    } finally {
      connection.closeSync();
      instance.closeSync();
    }

    const poda = await podarYActualizarBuyers(
      client,
      opciones.conservarMeses ?? MESES_CONSERVADOS,
    );
    const detalle =
      poda.mesesBorrados.length === 0
        ? "ninguno"
        : poda.mesesBorrados.join(", ");
    log(`Poda: meses borrados ${detalle}. Buyers: ${poda.buyers}`);
    return {
      meses: resultados,
      mesesBorrados: poda.mesesBorrados,
      buyers: poda.buyers,
    };
  } finally {
    await client.end();
  }
}

/**
 * Llena `tenders.search` con el título y las descripciones de los ítems ya
 * insertados. `unaccent` va dentro del vector; la consulta recomendada también
 * lo aplica. No toca `embedding` (queda NULL hasta la fase 5).
 */
export async function actualizarBusqueda(
  client: Client,
  nogs: readonly string[],
): Promise<void> {
  if (nogs.length === 0) {
    return;
  }
  await client.query(
    `
      UPDATE tenders AS t
      SET search = to_tsvector(
        'spanish',
        unaccent(coalesce(t.title, '') || ' ' || coalesce(s.texto, ''))
      )
      FROM (
        SELECT n.nog,
               string_agg(i.description, ' ' ORDER BY i.item_id) AS texto
        FROM jsonb_array_elements_text($1::jsonb) AS n(nog)
        LEFT JOIN items AS i
          ON i.nog = n.nog::bigint
         AND i.description IS NOT NULL
        GROUP BY n.nog
      ) AS s
      WHERE t.nog = s.nog::bigint
    `,
    [JSON.stringify(nogs)],
  );
}

/**
 * Los meses salen de `data/manifest.json`. La ruta es
 * `data/ocds/anio=YYYY/mes=MM/<tabla>.parquet`. No se listan directorios:
 * un ETL interrumpido puede dejar `mes=MM.tmp-*` y `mes=MM.old-*`.
 */
export async function mesesParaCargar(
  raiz: string,
  desde?: string,
  hasta?: string,
): Promise<Mes[]> {
  if ((desde === undefined) !== (hasta === undefined)) {
    throw new Error("desde y hasta van juntos");
  }
  const ruta = rutaManifest(raiz);
  if (!existsSync(ruta)) {
    throw new Error("No existe data/manifest.json. Corre pnpm etl primero.");
  }
  const manifest = await leerManifest(ruta);
  const publicados = mesesPublicados(manifest);
  const presentes = new Set(publicados.map((mes) => mes.clave));
  const meses =
    desde !== undefined && hasta !== undefined
      ? mesesDelRango(desde, hasta)
      : publicados;
  if (meses.length === 0) {
    throw new Error(
      "data/manifest.json no tiene meses. Corre pnpm etl primero.",
    );
  }
  for (const mes of meses) {
    if (!presentes.has(mes.clave)) {
      throw new Error(
        `${mes.clave}: no está en data/manifest.json. Corre pnpm etl --desde ${mes.clave} --hasta ${mes.clave}.`,
      );
    }
    for (const tabla of TABLAS_CARGA) {
      const archivo = rutaParquet(raiz, mes, tabla);
      if (!existsSync(archivo)) {
        throw new Error(`${mes.clave}: falta ${archivo}`);
      }
    }
  }
  return meses;
}

async function exigirEsquema(client: Client): Promise<void> {
  const esquema = await client.query<{
    tenders: string | null;
    unaccent: string | null;
  }>(`
    SELECT
      to_regclass('public.tenders')::text AS tenders,
      (SELECT extname FROM pg_extension WHERE extname = 'unaccent') AS unaccent
  `);
  const fila = esquema.rows[0];
  if (fila === undefined || fila.tenders === null) {
    throw new Error("Falta el esquema. Corre pnpm migrate.");
  }
  if (fila.unaccent === null) {
    throw new Error("Falta la extensión unaccent. Corre pnpm migrate.");
  }
}

async function cargarMes(
  client: Client,
  connection: DuckDBConnection,
  raiz: string,
  mes: Mes,
  sha: string | null,
  inicio: Date,
): Promise<ResultadoMes> {
  const dir = directorioOcds(raiz, mes);
  const tenders = await leerTabla(
    connection,
    "tenders",
    join(dir, "tenders.parquet"),
  );
  const items = await leerTabla(
    connection,
    "items",
    join(dir, "items.parquet"),
  );
  const awards = await leerTabla(
    connection,
    "awards",
    join(dir, "awards.parquet"),
  );
  await exigirNogsUnicos(connection, join(dir, "tenders.parquet"), mes.clave);

  const mesesDistintos = new Set(
    tenders.map((fila) => fila.source_month).filter(esTexto),
  );
  if (
    tenders.length > 0 &&
    (mesesDistintos.size !== 1 || !mesesDistintos.has(mes.clave))
  ) {
    throw new Error(
      `${mes.clave}: source_month del Parquet no coincide con la carpeta`,
    );
  }
  if (tenders.some((fila) => !esTexto(fila.nog) || !esTexto(fila.ocid))) {
    throw new Error(`${mes.clave}: hay tenders sin nog u ocid`);
  }
  const nogSet = new Set(tenders.map((fila) => fila.nog).filter(esTexto));
  exigirNogsConocidos(mes.clave, "items", items, nogSet);
  exigirNogsConocidos(mes.clave, "awards", awards, nogSet);

  const lista = [...nogSet];
  await insertarLotes(client, SQL_UPSERT_TENDERS, tenders);
  await borrarPorNog(client, "items", lista);
  await insertarLotes(client, SQL_INSERT_ITEMS, items);
  await borrarPorNog(client, "awards", lista);
  await insertarLotes(client, SQL_INSERT_AWARDS, awards);
  await actualizarBusqueda(client, lista);
  await client.query(
    `
      DELETE FROM tenders
      WHERE source_month = $1
        AND nog NOT IN (
          SELECT value::bigint FROM jsonb_array_elements_text($2::jsonb)
        )
    `,
    [mes.clave, JSON.stringify(lista)],
  );
  await client.query("DELETE FROM etl_runs WHERE month = $1", [mes.clave]);
  await client.query(
    `
      INSERT INTO etl_runs (month, sha, rows, status, started_at, finished_at)
      VALUES ($1, $2, $3, 'ok', $4, now())
    `,
    [mes.clave, sha, tenders.length, inicio],
  );
  return {
    mes: mes.clave,
    tenders: tenders.length,
    items: items.length,
    awards: awards.length,
  };
}

async function exigirNogsUnicos(
  connection: DuckDBConnection,
  ruta: string,
  mes: string,
): Promise<void> {
  const reader = await connection.runAndReadAll(`
    SELECT nog::VARCHAR AS nog
    FROM read_parquet(${sqlLiteral(ruta)})
    WHERE nog IS NOT NULL
    GROUP BY nog
    HAVING count(*) > 1
    LIMIT 5
  `);
  const duplicados = reader.getRowObjectsJson().map((fila) => String(fila.nog));
  if (duplicados.length > 0) {
    throw new Error(
      `${mes}: NOG duplicados en tenders: ${duplicados.join(", ")}`,
    );
  }
}

function esTexto(valor: string | null | undefined): valor is string {
  return typeof valor === "string";
}

function exigirNogsConocidos(
  mes: string,
  tabla: string,
  filas: Fila[],
  validos: Set<string>,
): void {
  for (const fila of filas) {
    if (!esTexto(fila.nog) || !validos.has(fila.nog)) {
      throw new Error(
        `${mes}: ${tabla} tiene un NOG que no está en tenders (${fila.nog ?? "null"})`,
      );
    }
  }
}

async function borrarPorNog(
  client: Client,
  tabla: "items" | "awards",
  nogs: readonly string[],
): Promise<void> {
  if (nogs.length === 0) {
    return;
  }
  const sql =
    tabla === "items"
      ? `DELETE FROM items WHERE nog IN (SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb))`
      : `DELETE FROM awards WHERE nog IN (SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb))`;
  await client.query(sql, [JSON.stringify(nogs)]);
}

async function insertarLotes(
  client: Client,
  sql: string,
  filas: Fila[],
): Promise<void> {
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    if (lote.length === 0) {
      continue;
    }
    await client.query(sql, [JSON.stringify(lote)]);
  }
}

async function leerTabla(
  connection: DuckDBConnection,
  tabla: TablaCarga,
  ruta: string,
): Promise<Fila[]> {
  const reader = await connection.runAndReadAll(consulta(tabla, ruta));
  return reader.getRowObjectsJson().map((fila) => {
    const salida: Fila = {};
    for (const [clave, valor] of Object.entries(fila)) {
      salida[clave] = valorTexto(clave, valor);
    }
    return salida;
  });
}

function valorTexto(clave: string, valor: Json): string | null {
  if (valor === null) {
    return null;
  }
  if (typeof valor === "string") {
    return valor;
  }
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  throw new Error(`${clave}: valor no esperado en el Parquet`);
}

function consulta(tabla: TablaCarga, ruta: string): string {
  const archivo = sqlLiteral(ruta);
  switch (tabla) {
    case "tenders":
      return `
        SELECT
          nog::VARCHAR AS nog,
          ocid,
          title,
          status_detail,
          method_detail,
          category,
          ${marcaTiempo("date_published")} AS date_published,
          ${marcaTiempo("tender_end")} AS tender_end,
          buyer_nit,
          buyer_name,
          unit_gcuc,
          unit_name,
          department,
          n_tenderers::VARCHAR AS n_tenderers,
          source_month
        FROM read_parquet(${archivo})
        ORDER BY nog
      `;
    case "items":
      return `
        SELECT
          nog::VARCHAR AS nog,
          item_id,
          description,
          unspsc,
          quantity::VARCHAR AS quantity,
          unit_name
        FROM read_parquet(${archivo})
        ORDER BY nog, item_id
      `;
    case "awards":
      return `
        SELECT
          nog::VARCHAR AS nog,
          award_id,
          supplier_id,
          supplier_name,
          amount::VARCHAR AS amount_gtq,
          ${marcaTiempo("award_date")} AS award_date,
          status_detail
        FROM read_parquet(${archivo})
        ORDER BY nog, award_id, supplier_id
      `;
    default: {
      const agotado: never = tabla;
      throw new Error(`Tabla no contemplada: ${String(agotado)}`);
    }
  }
}

function marcaTiempo(columna: string): string {
  return `CASE WHEN ${columna} IS NULL THEN NULL ELSE strftime(${columna}, '%Y-%m-%d %H:%M:%S%z') END`;
}

function sqlLiteral(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

const SQL_UPSERT_TENDERS = `
  INSERT INTO tenders (
    nog, ocid, title, status_detail, method_detail, category,
    date_published, tender_end, buyer_nit, buyer_name,
    unit_gcuc, unit_name, department, n_tenderers, source_month, updated_at
  )
  SELECT
    nog::bigint,
    ocid,
    title,
    status_detail,
    method_detail,
    category,
    NULLIF(date_published, '')::timestamptz,
    NULLIF(tender_end, '')::timestamptz,
    buyer_nit,
    buyer_name,
    unit_gcuc,
    unit_name,
    department,
    NULLIF(n_tenderers, '')::integer,
    source_month,
    now()
  FROM jsonb_to_recordset($1::jsonb) AS x(
    nog text,
    ocid text,
    title text,
    status_detail text,
    method_detail text,
    category text,
    date_published text,
    tender_end text,
    buyer_nit text,
    buyer_name text,
    unit_gcuc text,
    unit_name text,
    department text,
    n_tenderers text,
    source_month text
  )
  ON CONFLICT (nog) DO UPDATE SET
    ocid = EXCLUDED.ocid,
    title = EXCLUDED.title,
    status_detail = EXCLUDED.status_detail,
    method_detail = EXCLUDED.method_detail,
    category = EXCLUDED.category,
    date_published = EXCLUDED.date_published,
    tender_end = EXCLUDED.tender_end,
    buyer_nit = EXCLUDED.buyer_nit,
    buyer_name = EXCLUDED.buyer_name,
    unit_gcuc = EXCLUDED.unit_gcuc,
    unit_name = EXCLUDED.unit_name,
    department = EXCLUDED.department,
    n_tenderers = EXCLUDED.n_tenderers,
    source_month = EXCLUDED.source_month,
    updated_at = now()
`;

const SQL_INSERT_ITEMS = `
  INSERT INTO items (nog, item_id, description, unspsc, quantity, unit_name)
  SELECT
    nog::bigint,
    item_id,
    description,
    unspsc,
    NULLIF(quantity, '')::numeric(18, 4),
    unit_name
  FROM jsonb_to_recordset($1::jsonb) AS x(
    nog text,
    item_id text,
    description text,
    unspsc text,
    quantity text,
    unit_name text
  )
`;

const SQL_INSERT_AWARDS = `
  INSERT INTO awards (
    nog, award_id, supplier_id, supplier_name, amount_gtq, award_date, status_detail
  )
  SELECT
    nog::bigint,
    award_id,
    supplier_id,
    supplier_name,
    NULLIF(amount_gtq, '')::numeric(14, 2),
    NULLIF(award_date, '')::timestamptz,
    status_detail
  FROM jsonb_to_recordset($1::jsonb) AS x(
    nog text,
    award_id text,
    supplier_id text,
    supplier_name text,
    amount_gtq text,
    award_date text,
    status_detail text
  )
`;

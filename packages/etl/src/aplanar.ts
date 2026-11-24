import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export const TABLAS = [
  "tenders",
  "items",
  "awards",
  "bids",
  "parties",
] as const;
export type Tabla = (typeof TABLAS)[number];

export interface Filas {
  tenders: number;
  items: number;
  awards: number;
  bids: number;
  parties: number;
}

export interface DetalleFechas {
  date_published: number;
  tender_end: number;
  award_date: number;
  bid_date: number;
}

export interface MetricasCalidad {
  records: number;
  filas: Filas;
  nog_duplicados: number;
  /** Records cuyo `tender.id` falta o no es un NOG entero. */
  nog_nulos: number;
  fechas_no_parsean: number;
  fechas_no_parsean_detalle: DetalleFechas;
  sin_departamento: number;
  sin_items: number;
  vigentes_sin_fecha_cierre: number;
}

export interface ReporteCalidad extends MetricasCalidad {
  mes: string;
  sha256: string;
}

export interface OpcionesAplanar {
  jsonPath: string;
  salidaDir: string;
  /** `YYYY-MM` del archivo de publicación. */
  sourceMonth: string;
  /** Se llama después de cada tabla. Las pruebas lo usan para fallar a mitad. */
  despuesDeTabla?: (tabla: Tabla) => void;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const VACIO: string = "CAST([] AS JSON[])";

/**
 * Lee un record package OCDS y escribe las cinco tablas Parquet.
 * Usa solo `compiledRelease`. El departamento sale de la entidad GT-CISP
 * con rol buyer: la unidad GT-GCUC también trae ese rol y a veces otra región.
 */
export async function aplanarOcds(
  opciones: OpcionesAplanar,
): Promise<MetricasCalidad> {
  if (!MES.test(opciones.sourceMonth)) {
    throw new Error(`source_month inválido: ${opciones.sourceMonth}`);
  }
  await mkdir(opciones.salidaDir, { recursive: true });

  const instance = await DuckDBInstance.create();
  const connection = await instance.connect();
  try {
    await connection.run("SET TimeZone = 'America/Guatemala'");
    await connection.run(sqlBase(opciones.jsonPath));
    const fechas = await detalleFechas(connection);
    for (const tabla of TABLAS) {
      await connection.run(
        sqlCopia(
          tabla,
          opciones.sourceMonth,
          join(opciones.salidaDir, `${tabla}.parquet`),
        ),
      );
      opciones.despuesDeTabla?.(tabla);
    }
    return armarMetricas(
      await entero(connection, "SELECT count(*)::INTEGER FROM base"),
      await filasEscritas(connection, opciones.salidaDir),
      await indicadores(connection, opciones.salidaDir),
      fechas,
    );
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function armarMetricas(
  records: number,
  filas: Filas,
  indicadoresParquet: {
    nog_duplicados: number;
    nog_nulos: number;
    sin_departamento: number;
    sin_items: number;
    vigentes_sin_fecha_cierre: number;
  },
  fechas: DetalleFechas,
): MetricasCalidad {
  return {
    records,
    filas,
    nog_duplicados: indicadoresParquet.nog_duplicados,
    nog_nulos: indicadoresParquet.nog_nulos,
    fechas_no_parsean:
      fechas.date_published +
      fechas.tender_end +
      fechas.award_date +
      fechas.bid_date,
    fechas_no_parsean_detalle: fechas,
    sin_departamento: indicadoresParquet.sin_departamento,
    sin_items: indicadoresParquet.sin_items,
    vigentes_sin_fecha_cierre: indicadoresParquet.vigentes_sin_fecha_cierre,
  };
}

function sqlBase(jsonPath: string): string {
  return `
    CREATE TEMP TABLE base AS
    SELECT
      TRY_CAST(
        regexp_extract(
          json_extract_string(cr, '$.tender.id'),
          '^GT-NOG-([0-9]+)$',
          1
        ) AS BIGINT
      ) AS nog,
      json_extract_string(cr, '$.ocid') AS ocid,
      cr
    FROM (
      SELECT json_extract(rec, '$.compiledRelease') AS cr
      FROM read_json(
        ${sqlLiteral(jsonPath)},
        columns = {records: 'JSON[]'},
        maximum_object_size = 2000000000
      ),
      UNNEST(records) AS t(rec)
    )
  `;
}

function sqlCopia(tabla: Tabla, sourceMonth: string, destino: string): string {
  const mes = sqlLiteral(sourceMonth);
  const consulta = consultaTabla(tabla, mes);
  return `COPY (${consulta}) TO ${sqlLiteral(destino)} (FORMAT PARQUET)`;
}

function consultaTabla(tabla: Tabla, mes: string): string {
  switch (tabla) {
    case "tenders":
      return `
        SELECT
          nog,
          ocid,
          json_extract_string(cr, '$.tender.title') AS title,
          json_extract_string(cr, '$.tender.statusDetails') AS status_detail,
          json_extract_string(cr, '$.tender.procurementMethodDetails') AS method_detail,
          json_extract_string(cr, '$.tender.mainProcurementCategory') AS category,
          TRY_CAST(json_extract_string(cr, '$.tender.datePublished') AS TIMESTAMPTZ) AS date_published,
          TRY_CAST(json_extract_string(cr, '$.tender.tenderPeriod.endDate') AS TIMESTAMPTZ) AS tender_end,
          NULLIF(regexp_extract(json_extract_string(cr, '$.buyer.id'), '^GT-NIT-(.*)$', 1), '') AS buyer_nit,
          json_extract_string(cr, '$.buyer.name') AS buyer_name,
          u.unit_gcuc,
          u.unit_name,
          d.department,
          TRY_CAST(json_extract(cr, '$.tender.numberOfTenderers') AS INTEGER) AS n_tenderers,
          ${mes} AS source_month
        FROM base
        LEFT JOIN LATERAL (${sqlUnidad()}) u ON true
        LEFT JOIN LATERAL (${sqlDepartamento()}) d ON true
        ORDER BY nog
      `;
    case "items":
      return `
        SELECT
          nog,
          ocid,
          ${mes} AS source_month,
          json_extract_string(item, '$.id') AS item_id,
          json_extract_string(item, '$.description') AS description,
          json_extract_string(item, '$.classification.scheme') AS classification_scheme,
          json_extract_string(item, '$.classification.id') AS unspsc,
          TRY_CAST(json_extract(item, '$.quantity') AS DECIMAL(18, 4)) AS quantity,
          json_extract_string(item, '$.unit.name') AS unit_name
        FROM base,
        UNNEST(${lista("$.tender.items")}) AS t(item)
        ORDER BY nog, item_id
      `;
    case "awards":
      return `
        SELECT
          nog,
          ocid,
          ${mes} AS source_month,
          json_extract_string(a, '$.id') AS award_id,
          json_extract_string(a, '$.title') AS title,
          json_extract_string(a, '$.status') AS status,
          json_extract_string(a, '$.statusDetails') AS status_detail,
          TRY_CAST(json_extract_string(a, '$.date') AS TIMESTAMPTZ) AS award_date,
          TRY_CAST(json_extract(a, '$.value.amount') AS DECIMAL(18, 2)) AS amount,
          json_extract_string(a, '$.value.currency') AS currency,
          s.supplier_id,
          s.supplier_name
        FROM base
        CROSS JOIN UNNEST(${lista("$.awards")}) AS t(a)
        LEFT JOIN LATERAL (
          SELECT
            json_extract_string(sup, '$.id') AS supplier_id,
            json_extract_string(sup, '$.name') AS supplier_name
          FROM UNNEST(COALESCE(TRY_CAST(json_extract(a, '$.suppliers') AS JSON[]), ${VACIO})) AS u(sup)
        ) s ON true
        ORDER BY nog, award_id, supplier_id
      `;
    case "bids":
      return `
        SELECT
          nog,
          ocid,
          ${mes} AS source_month,
          json_extract_string(b, '$.id') AS bid_id,
          json_extract_string(b, '$.status') AS status,
          TRY_CAST(json_extract_string(b, '$.date') AS TIMESTAMPTZ) AS bid_date,
          TRY_CAST(json_extract(b, '$.value.amount') AS DECIMAL(18, 2)) AS amount,
          json_extract_string(b, '$.value.currency') AS currency,
          o.tenderer_id,
          o.tenderer_name
        FROM base
        CROSS JOIN UNNEST(${lista("$.bids.details")}) AS t(b)
        LEFT JOIN LATERAL (
          SELECT
            json_extract_string(ten, '$.id') AS tenderer_id,
            json_extract_string(ten, '$.name') AS tenderer_name
          FROM UNNEST(COALESCE(TRY_CAST(json_extract(b, '$.tenderers') AS JSON[]), ${VACIO})) AS u(ten)
        ) o ON true
        ORDER BY nog, bid_id, tenderer_id
      `;
    case "parties":
      return `
        SELECT
          nog,
          ocid,
          ${mes} AS source_month,
          json_extract_string(p, '$.id') AS party_id,
          json_extract_string(p, '$.identifier.scheme') AS scheme,
          json_extract_string(p, '$.name') AS name,
          array_to_string(
            list_sort(TRY_CAST(json_extract(p, '$.roles') AS VARCHAR[])),
            ','
          ) AS roles,
          json_extract_string(p, '$.memberOf[0].id') AS member_of_id,
          json_extract_string(p, '$.address.region') AS region,
          json_extract_string(p, '$.address.locality') AS locality
        FROM base,
        UNNEST(${lista("$.parties")}) AS t(p)
        ORDER BY nog, party_id
      `;
    default: {
      const agotado: never = tabla;
      throw new Error(`Tabla no contemplada: ${String(agotado)}`);
    }
  }
}

function sqlUnidad(): string {
  return `
    SELECT
      NULLIF(regexp_extract(json_extract_string(p, '$.id'), '^GT-GCUC-(.*)$', 1), '') AS unit_gcuc,
      json_extract_string(p, '$.name') AS unit_name
    FROM UNNEST(${lista("$.parties")}) AS t(p)
    WHERE json_extract_string(p, '$.id') LIKE 'GT-GCUC-%'
      AND json_contains(json_extract(p, '$.roles'), '"buyer"')
    ORDER BY json_extract_string(p, '$.id')
    LIMIT 1
  `;
}

function sqlDepartamento(): string {
  return `
    SELECT NULLIF(trim(json_extract_string(p, '$.address.region')), '') AS department
    FROM UNNEST(${lista("$.parties")}) AS t(p)
    WHERE json_extract_string(p, '$.id') LIKE 'GT-CISP-%'
      AND json_contains(json_extract(p, '$.roles'), '"buyer"')
    ORDER BY json_extract_string(p, '$.id')
    LIMIT 1
  `;
}

function lista(ruta: string): string {
  return `COALESCE(TRY_CAST(json_extract(cr, '${ruta}') AS JSON[]), ${VACIO})`;
}

async function detalleFechas(
  connection: DuckDBConnection,
): Promise<DetalleFechas> {
  const propias = await enteros(
    connection,
    `
      SELECT
        count(*) FILTER (WHERE ${fechaMala("$.tender.datePublished")})::INTEGER AS date_published,
        count(*) FILTER (WHERE ${fechaMala("$.tender.tenderPeriod.endDate")})::INTEGER AS tender_end
      FROM base
    `,
  );
  const awardDate = await entero(
    connection,
    `
      SELECT count(*) FILTER (WHERE ${fechaMala("$.date", "a")})::INTEGER
      FROM base
      CROSS JOIN UNNEST(${lista("$.awards")}) AS t(a)
    `,
  );
  const bidDate = await entero(
    connection,
    `
      SELECT count(*) FILTER (WHERE ${fechaMala("$.date", "b")})::INTEGER
      FROM base
      CROSS JOIN UNNEST(${lista("$.bids.details")}) AS t(b)
    `,
  );
  return {
    date_published: exigir(propias, "date_published"),
    tender_end: exigir(propias, "tender_end"),
    award_date: awardDate,
    bid_date: bidDate,
  };
}

function fechaMala(ruta: string, alias = "cr"): string {
  const texto = `json_extract_string(${alias}, '${ruta}')`;
  return `${texto} IS NOT NULL AND length(trim(${texto})) > 0 AND TRY_CAST(${texto} AS TIMESTAMPTZ) IS NULL`;
}

async function filasEscritas(
  connection: DuckDBConnection,
  salidaDir: string,
): Promise<Filas> {
  const conteos = await enteros(
    connection,
    `
      SELECT
        (SELECT count(*) FROM ${tabla(salidaDir, "tenders")})::INTEGER AS tenders,
        (SELECT count(*) FROM ${tabla(salidaDir, "items")})::INTEGER AS items,
        (SELECT count(*) FROM ${tabla(salidaDir, "awards")})::INTEGER AS awards,
        (SELECT count(*) FROM ${tabla(salidaDir, "bids")})::INTEGER AS bids,
        (SELECT count(*) FROM ${tabla(salidaDir, "parties")})::INTEGER AS parties
    `,
  );
  return {
    tenders: exigir(conteos, "tenders"),
    items: exigir(conteos, "items"),
    awards: exigir(conteos, "awards"),
    bids: exigir(conteos, "bids"),
    parties: exigir(conteos, "parties"),
  };
}

async function indicadores(
  connection: DuckDBConnection,
  salidaDir: string,
): Promise<{
  nog_duplicados: number;
  nog_nulos: number;
  sin_departamento: number;
  sin_items: number;
  vigentes_sin_fecha_cierre: number;
}> {
  const tenders = tabla(salidaDir, "tenders");
  const items = tabla(salidaDir, "items");
  const conteos = await enteros(
    connection,
    `
      SELECT
        (
          SELECT count(*) FROM (
            SELECT nog FROM ${tenders}
            WHERE nog IS NOT NULL
            GROUP BY nog
            HAVING count(*) > 1
          )
        )::INTEGER AS nog_duplicados,
        (SELECT count(*) FROM ${tenders} WHERE nog IS NULL)::INTEGER AS nog_nulos,
        (SELECT count(*) FROM ${tenders} WHERE department IS NULL)::INTEGER AS sin_departamento,
        (
          SELECT count(*) FROM ${tenders} t
          WHERE NOT EXISTS (
            SELECT 1 FROM ${items} i WHERE i.ocid = t.ocid
          )
        )::INTEGER AS sin_items,
        (
          SELECT count(*) FROM ${tenders}
          WHERE status_detail = 'Vigente' AND tender_end IS NULL
        )::INTEGER AS vigentes_sin_fecha_cierre
    `,
  );
  return {
    nog_duplicados: exigir(conteos, "nog_duplicados"),
    nog_nulos: exigir(conteos, "nog_nulos"),
    sin_departamento: exigir(conteos, "sin_departamento"),
    sin_items: exigir(conteos, "sin_items"),
    vigentes_sin_fecha_cierre: exigir(conteos, "vigentes_sin_fecha_cierre"),
  };
}

function tabla(salidaDir: string, nombre: Tabla): string {
  return sqlLiteral(join(salidaDir, `${nombre}.parquet`));
}

function sqlLiteral(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

async function entero(
  connection: DuckDBConnection,
  sql: string,
): Promise<number> {
  const fila = await unaFila(connection, sql);
  const valor = Object.values(fila)[0];
  return comoEntero(valor);
}

async function enteros(
  connection: DuckDBConnection,
  sql: string,
): Promise<Record<string, number>> {
  const fila = await unaFila(connection, sql);
  const salida: Record<string, number> = {};
  for (const [clave, valor] of Object.entries(fila)) {
    salida[clave] = comoEntero(valor);
  }
  return salida;
}

async function unaFila(
  connection: DuckDBConnection,
  sql: string,
): Promise<Record<string, unknown>> {
  const reader = await connection.runAndReadAll(sql);
  const fila = reader.getRowObjectsJson()[0];
  if (fila === undefined) {
    throw new Error("La consulta no devolvió filas");
  }
  return fila;
}

function comoEntero(valor: unknown): number {
  if (typeof valor === "boolean" || valor === null || valor === undefined) {
    throw new Error(`Se esperaba un entero y llegó ${String(valor)}`);
  }
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isSafeInteger(numero)) {
    throw new Error(`Se esperaba un entero y llegó ${String(valor)}`);
  }
  return numero;
}

function exigir(mapa: Record<string, number>, clave: string): number {
  const valor = mapa[clave];
  if (valor === undefined) {
    throw new Error(`La consulta no devolvió ${clave}`);
  }
  return valor;
}

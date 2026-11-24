import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplanarOcds } from "./aplanar.js";
import { actualizarBusqueda, cargarOcds, mesesParaCargar } from "./cargar.js";
import { guardarManifest } from "./manifest.js";
import {
  aplicarMigraciones,
  directorioMigracionesPorDefecto,
} from "./migrar.js";
import { podarYActualizarBuyers } from "./poda.js";
import { crearCliente } from "./postgres.js";
import { directorioOcds, rutaManifest } from "./rutas.js";

if (process.env.CI === "true" && (process.env.DATABASE_URL ?? "") === "") {
  throw new Error(
    "En CI hace falta DATABASE_URL para probar la carga contra Postgres",
  );
}

const databaseUrl = process.env.DATABASE_URL;
const fixture = fileURLToPath(
  new URL("../test/fixtures/2026-11-muestra.json", import.meta.url),
);

describe.skipIf(databaseUrl === undefined)("carga contra Postgres", () => {
  let url = "";
  let raiz = "";
  let client: Client | undefined;

  beforeAll(async () => {
    if (databaseUrl === undefined) {
      return;
    }
    url = await urlDePrueba(databaseUrl);
    await aplicarMigraciones({
      databaseUrl: url,
      directorio: directorioMigracionesPorDefecto(),
    });
    client = crearCliente(url);
    await client.connect();
    await client.query(`
      TRUNCATE TABLE
        tenders,
        items,
        awards,
        buyers,
        subscriptions,
        alerts_sent,
        etl_runs
      RESTART IDENTITY CASCADE
    `);

    raiz = await mkdtemp(join(tmpdir(), "radar-carga-"));
    await aplanarOcds({
      jsonPath: fixture,
      salidaDir: directorioOcds(raiz, {
        anio: 2026,
        mes: 11,
        clave: "2026-11",
      }),
      sourceMonth: "2026-11",
    });
    await guardarManifest(rutaManifest(raiz), {
      meses: {
        "2026-11": {
          sha256: "ab".repeat(32),
          records: 200,
          procesado_en: "2026-11-24T00:00:00.000Z",
        },
      },
    });
    await escribirParquetBasura(raiz);
    await cargarOcds({
      raiz,
      databaseUrl: url,
      desde: "2026-11",
      hasta: "2026-11",
      log: () => undefined,
    });
  }, 120_000);

  afterAll(async () => {
    if (client !== undefined) {
      await client.end();
    }
    if (raiz !== "") {
      await rm(raiz, { recursive: true, force: true });
    }
  });

  function db(): Client {
    if (client === undefined) {
      throw new Error("Postgres de prueba no conectado");
    }
    return client;
  }

  it("ignora el Parquet basura de mes=11.tmp-x y mes=11.old-x", async () => {
    const conteo = await conteos(db());
    expect(conteo.tenders).toBe(200);
    expect(conteo.items).toBe(546);
    expect(conteo.awards).toBe(44);
    await cargarOcds({
      raiz,
      databaseUrl: url,
      desde: "2026-11",
      hasta: "2026-11",
      log: () => undefined,
    });
    expect(await conteos(db())).toMatchObject({
      tenders: 200,
      items: 546,
      awards: 44,
    });
  });

  it("aplica cada migración una sola vez", async () => {
    const segunda = await aplicarMigraciones({
      databaseUrl: url,
      directorio: directorioMigracionesPorDefecto(),
    });
    expect(segunda).toEqual([]);
    const versiones = await db().query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(versiones.rows.map((fila) => fila.version)).toEqual([
      "0001_inicial.sql",
      "0002_unaccent.sql",
    ]);
  });

  it("carga la muestra real y la segunda pasada deja los mismos conteos", async () => {
    const primero = await conteos(db());
    expect(primero).toMatchObject({
      tenders: 200,
      items: 546,
      awards: 44,
      subscriptions: 0,
      alerts_sent: 0,
      etl_runs: 1,
    });
    expect(primero.buyers).toBeGreaterThan(0);

    const corrida = await db().query<{
      month: string;
      sha: string;
      rows: number;
      status: string;
    }>("SELECT month, sha, rows, status FROM etl_runs");
    expect(corrida.rows).toEqual([
      {
        month: "2026-11",
        sha: "ab".repeat(32),
        rows: 200,
        status: "ok",
      },
    ]);

    await db().query(
      `INSERT INTO items (nog, item_id, description) VALUES (32366973, 'extra', 'huérfano')`,
    );
    await cargarOcds({
      raiz,
      databaseUrl: url,
      desde: "2026-11",
      hasta: "2026-11",
      log: () => undefined,
    });

    expect(await conteos(db())).toEqual(primero);
    const huerfano = await db().query(
      "SELECT 1 FROM items WHERE item_id = 'extra'",
    );
    expect(huerfano.rowCount).toBe(0);
  });

  it("conserva monto, fecha, segmento y deja embedding en null", async () => {
    const tender = await db().query<{
      publicado_ok: boolean;
      buyer_nit: string;
      buyer_name: string;
      department: string;
      sin_cierre: boolean;
    }>(`
      SELECT
        date_published = TIMESTAMPTZ '2026-11-02T18:19:50-06:00' AS publicado_ok,
        buyer_nit,
        buyer_name,
        department,
        tender_end IS NULL AS sin_cierre
      FROM tenders
      WHERE nog = 32366973
    `);
    expect(tender.rows[0]).toEqual({
      publicado_ok: true,
      buyer_nit: "6295355",
      buyer_name: "MUNICIPALIDAD DE PURULHA, BAJA VERAPAZ",
      department: "BAJA VERAPAZ",
      sin_cierre: true,
    });

    const item = await db().query<{
      unspsc: string;
      segment: string;
      family: string;
      quantity: string;
    }>(`
      SELECT unspsc,
             unspsc_segment AS segment,
             unspsc_family AS family,
             quantity::text AS quantity
      FROM items
      WHERE nog = 32366973
    `);
    expect(item.rows[0]).toEqual({
      unspsc: "72141103",
      segment: "72",
      family: "7214",
      quantity: "2940.0000",
    });

    const award = await db().query<{ amount: string }>(
      "SELECT amount_gtq::text AS amount FROM awards WHERE nog = 32552718",
    );
    expect(award.rows[0]?.amount).toBe("2031.68");

    const embedding = await db().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM tenders WHERE embedding IS NOT NULL",
    );
    expect(embedding.rows[0]?.n).toBe(0);
    const tipo = await db().query<{ tipo: string }>(`
      SELECT format_type(a.atttypid, a.atttypmod) AS tipo
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'tenders' AND a.attname = 'embedding'
    `);
    expect(tipo.rows[0]?.tipo).toBe("halfvec(512)");
    const hnsw = await db().query(
      "SELECT 1 FROM pg_indexes WHERE tablename = 'tenders' AND indexdef ILIKE '%hnsw%'",
    );
    expect(hnsw.rowCount).toBe(0);
    const bids = await db().query("SELECT to_regclass('public.bids') AS bids");
    expect(bids.rows[0]?.bids).toBeNull();
  });

  it("busca por el título y, con unaccent, por diésel acentuado", async () => {
    const camino = await db().query<{ n: number }>(`
      SELECT count(*)::int AS n
      FROM tenders
      WHERE nog = 32366973
        AND search @@ websearch_to_tsquery('spanish', unaccent('camino'))
    `);
    expect(camino.rows[0]?.n).toBe(1);

    const sinVector = await db().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM tenders WHERE search IS NULL",
    );
    expect(sinVector.rows[0]?.n).toBe(0);

    await db().query(
      "UPDATE tenders SET title = 'Compra de diésel para la planta' WHERE nog = 32366973",
    );
    await actualizarBusqueda(db(), ["32366973"]);
    const diesel = await db().query<{ title: string }>(`
      SELECT title
      FROM tenders
      WHERE nog = 32366973
        AND search @@ websearch_to_tsquery('spanish', unaccent('diésel'))
        AND search @@ websearch_to_tsquery('spanish', 'diesel')
    `);
    expect(diesel.rows).toHaveLength(1);
  });

  it("de un NIT con dos nombres se queda el de fecha más reciente", async () => {
    await db().query(`
      INSERT INTO tenders (nog, ocid, source_month, buyer_nit, buyer_name, department, date_published)
      VALUES
        (9100000000001, 'ocds-test-viejo', '2026-11', 'NIT-TEST', 'Nombre viejo', 'ANTIGUO', TIMESTAMPTZ '2026-11-01T00:00:00Z'),
        (9100000000002, 'ocds-test-nuevo', '2026-11', 'NIT-TEST', 'Nombre nuevo', 'RECIENTE', TIMESTAMPTZ '2026-11-20T00:00:00Z')
    `);
    await podarYActualizarBuyers(db());
    const buyer = await db().query(
      "SELECT name, department FROM buyers WHERE nit = 'NIT-TEST'",
    );
    expect(buyer.rows).toEqual([
      { name: "Nombre nuevo", department: "RECIENTE" },
    ]);
  });

  it("conserva 12 meses y borra el más viejo con sus ítems", async () => {
    for (let mes = 1; mes <= 12; mes += 1) {
      const clave = `2014-${String(mes).padStart(2, "0")}`;
      const nog = 9100000000100 + mes;
      await db().query(
        `INSERT INTO tenders (nog, ocid, source_month, buyer_nit, buyer_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          nog,
          `ocds-test-${clave}`,
          clave,
          mes === 1 ? "NIT-VIEJO" : null,
          mes === 1 ? "Entidad vieja" : null,
        ],
      );
      await db().query(
        "INSERT INTO etl_runs (month, rows, status) VALUES ($1, 1, 'ok')",
        [clave],
      );
    }
    await db().query(
      "INSERT INTO items (nog, item_id, description) VALUES (9100000000101, 'viejo', 'se borra')",
    );

    const poda = await podarYActualizarBuyers(db());
    expect(poda.mesesBorrados).toEqual(["2014-01"]);

    const queda = await db().query<{ source_month: string }>(
      "SELECT DISTINCT source_month FROM tenders ORDER BY source_month",
    );
    const meses = queda.rows.map((fila) => fila.source_month);
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe("2014-02");
    expect(meses).toContain("2026-11");
    expect(meses).not.toContain("2014-01");

    const itemViejo = await db().query(
      "SELECT 1 FROM items WHERE nog = 9100000000101",
    );
    expect(itemViejo.rowCount).toBe(0);
    const corridaVieja = await db().query(
      "SELECT 1 FROM etl_runs WHERE month = '2014-01'",
    );
    expect(corridaVieja.rowCount).toBe(0);
    const buyerViejo = await db().query(
      "SELECT 1 FROM buyers WHERE nit = 'NIT-VIEJO'",
    );
    expect(buyerViejo.rowCount).toBe(0);
    const reciente = await db().query(
      "SELECT name FROM buyers WHERE nit = 'NIT-TEST'",
    );
    expect(reciente.rows[0]?.name).toBe("Nombre nuevo");
  });
});

it("arma la ruta del manifest y no lista carpetas temporales", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "radar-manifest-"));
  try {
    const mes = { anio: 2026, mes: 11, clave: "2026-11" };
    await mkdir(directorioOcds(raiz, mes), { recursive: true });
    for (const tabla of ["tenders", "items", "awards"]) {
      await writeFile(
        join(directorioOcds(raiz, mes), `${tabla}.parquet`),
        "ok",
      );
    }
    await escribirParquetBasura(raiz);
    await guardarManifest(rutaManifest(raiz), {
      meses: {
        "2026-11": {
          sha256: "ab".repeat(32),
          records: 1,
          procesado_en: "2026-11-24T00:00:00.000Z",
        },
      },
    });

    const meses = await mesesParaCargar(raiz);
    expect(meses.map((entrada) => entrada.clave)).toEqual(["2026-11"]);
    await expect(mesesParaCargar(raiz, "2026-10", "2026-10")).rejects.toThrow(
      /no está en data\/manifest.json/,
    );
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

async function escribirParquetBasura(raiz: string): Promise<void> {
  const anio = join(raiz, "data", "ocds", "anio=2026");
  for (const nombre of ["mes=11.tmp-x", "mes=11.old-x"]) {
    const dir = join(anio, nombre);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "tenders.parquet"), `basura ${nombre}`);
    await writeFile(join(dir, "items.parquet"), `basura ${nombre}`);
    await writeFile(join(dir, "awards.parquet"), `basura ${nombre}`);
  }
}

async function urlDePrueba(databaseUrl: string): Promise<string> {
  const admin = new URL(databaseUrl);
  admin.pathname = "/postgres";
  const client = crearCliente(admin.toString());
  await client.connect();
  try {
    const existe = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'radar_test'",
    );
    if ((existe.rowCount ?? 0) === 0) {
      await client.query("CREATE DATABASE radar_test");
    }
  } finally {
    await client.end();
  }
  const destino = new URL(databaseUrl);
  destino.pathname = "/radar_test";
  return destino.toString();
}

const TABLAS = [
  "tenders",
  "items",
  "awards",
  "buyers",
  "subscriptions",
  "alerts_sent",
  "etl_runs",
] as const;

async function conteos(client: Client): Promise<Record<string, number>> {
  const salida: Record<string, number> = {};
  for (const tabla of TABLAS) {
    const resultado = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${tabla}`,
    );
    const n = resultado.rows[0]?.n;
    if (n === undefined) {
      throw new Error(`No se pudo contar ${tabla}`);
    }
    salida[tabla] = n;
  }
  return salida;
}

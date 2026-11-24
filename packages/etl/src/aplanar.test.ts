import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance, type Json } from "@duckdb/node-api";
import { afterAll, beforeAll, expect, it } from "vitest";
import { aplanarOcds, type MetricasCalidad } from "./aplanar.js";

const fixture = fileURLToPath(
  new URL("../test/fixtures/2026-11-muestra.json", import.meta.url),
);

interface Paquete {
  records: {
    compiledRelease: {
      tender: {
        statusDetails?: string;
        procurementMethodDetails?: string;
      };
    };
  }[];
}

let salida = "";
let metricas: MetricasCalidad;

beforeAll(async () => {
  salida = await mkdtemp(join(tmpdir(), "radar-etl-muestra-"));
  metricas = await aplanarOcds({
    jsonPath: fixture,
    salidaDir: salida,
    sourceMonth: "2026-11",
  });
}, 60_000);

afterAll(async () => {
  if (salida !== "") {
    await rm(salida, { recursive: true, force: true });
  }
});

it("la muestra real mezcla estados y modalidades", async () => {
  const paquete = JSON.parse(await readFile(fixture, "utf8")) as Paquete;
  const estados = new Set(
    paquete.records.map(
      (record) => record.compiledRelease.tender.statusDetails,
    ),
  );
  const modalidades = new Set(
    paquete.records.map(
      (record) => record.compiledRelease.tender.procurementMethodDetails,
    ),
  );

  expect(paquete.records).toHaveLength(200);
  expect(estados).toEqual(
    new Set([
      "Adjudicado",
      "Desierto",
      "Evaluación",
      "No adjudicado",
      "Prescindido",
      "Vigente",
    ]),
  );
  expect(modalidades.size).toBe(12);
  expect(
    modalidades.has(
      "Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)",
    ),
  ).toBe(true);
  expect(modalidades.has("Licitación Pública (Art. 17 LCE)")).toBe(true);
});

it("cuenta una fila de tender por record y reporta la calidad de la muestra", () => {
  expect(metricas.records).toBe(200);
  expect(metricas.filas).toEqual({
    tenders: 200,
    items: 546,
    awards: 44,
    bids: 231,
    parties: 752,
  });
  expect(metricas.nog_duplicados).toBe(0);
  expect(metricas.nog_nulos).toBe(0);
  expect(metricas.fechas_no_parsean).toBe(0);
  expect(metricas.fechas_no_parsean_detalle).toEqual({
    date_published: 0,
    tender_end: 0,
    award_date: 0,
    bid_date: 0,
  });
  expect(metricas.sin_departamento).toBe(5);
  expect(metricas.sin_items).toBe(0);
  expect(metricas.vigentes_sin_fecha_cierre).toBe(37);
});

it("cuenta los records cuyo tender.id no produce un NOG entero", async () => {
  const dir = await mkdtemp(join(tmpdir(), "radar-etl-nog-"));
  const jsonPath = join(dir, "muestra.json");
  await writeFile(
    jsonPath,
    JSON.stringify({
      records: [
        {
          ocid: "ocds-a",
          compiledRelease: {
            ocid: "ocds-a",
            tender: { id: "GT-NOG-10", title: "válido" },
          },
        },
        {
          ocid: "ocds-b",
          compiledRelease: {
            ocid: "ocds-b",
            tender: { title: "sin id" },
          },
        },
        {
          ocid: "ocds-c",
          compiledRelease: {
            ocid: "ocds-c",
            tender: { id: "GT-NOG-xx", title: "no entero" },
          },
        },
      ],
    }),
  );

  try {
    const resultado = await aplanarOcds({
      jsonPath,
      salidaDir: join(dir, "out"),
      sourceMonth: "2026-11",
    });

    expect(resultado.records).toBe(3);
    expect(resultado.filas.tenders).toBe(3);
    expect(resultado.nog_nulos).toBe(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("aplana el NOG 32366973 con departamento, unidad y fecha -06:00", async () => {
  const fila = await una(`
    SELECT
      nog::VARCHAR AS nog,
      ocid,
      title,
      status_detail,
      method_detail,
      category,
      date_published = TIMESTAMPTZ '2026-11-02T18:19:50-06:00' AS publicado_ok,
      strftime(date_published, '%z') AS zona,
      tender_end IS NULL AS sin_cierre,
      buyer_nit,
      buyer_name,
      unit_gcuc,
      unit_name,
      department,
      n_tenderers,
      source_month
    FROM ${parquet("tenders")}
    WHERE nog = 32366973
  `);
  const item = await una(`
    SELECT item_id, classification_scheme, unspsc, quantity::VARCHAR AS quantity, unit_name
    FROM ${parquet("items")}
    WHERE nog = 32366973
  `);

  expect(fila).toMatchObject({
    nog: "32366973",
    ocid: "ocds-xqjsxa-32366973",
    title:
      "MEJORAMIENTO CAMINO RURAL CASERIO HEREDEROS PANZAL CRUCE SANTA ANITA A CRUCE SANTA RITA PURULHA, BAJA VERAPAZ",
    status_detail: "Vigente",
    method_detail: "Licitación Pública (Art. 17 LCE)",
    category: "works",
    publicado_ok: true,
    sin_cierre: true,
    buyer_nit: "6295355",
    buyer_name: "MUNICIPALIDAD DE PURULHA, BAJA VERAPAZ",
    unit_gcuc: "313-1",
    unit_name: "TESORERÍA MUNI. PURULHA",
    department: "BAJA VERAPAZ",
    n_tenderers: 0,
    source_month: "2026-11",
  });
  expect(String(fila.zona)).toMatch(/^-06/);
  expect(item).toMatchObject({
    item_id: "1C0EA6FC8B272F19D4CB57EF620AC8F4",
    classification_scheme: "UNSPSC",
    unspsc: "72141103",
    quantity: "2940.0000",
    unit_name: "Metro Cuadrado",
  });
});

it("conserva el centavo del monto y el departamento de la entidad, no el de la unidad", async () => {
  const tender = await una(`
    SELECT department, unit_gcuc, unit_name, buyer_nit
    FROM ${parquet("tenders")}
    WHERE nog = 32552718
  `);
  const award = await una(`
    SELECT amount::VARCHAR AS amount, currency, supplier_id,
           award_date = TIMESTAMPTZ '2026-11-03T17:20:40-06:00' AS fecha_ok
    FROM ${parquet("awards")}
    WHERE nog = 32552718
  `);
  const unidad = await una(`
    SELECT region, locality, member_of_id, roles
    FROM ${parquet("parties")}
    WHERE nog = 32552718 AND party_id = 'GT-GCUC-62-16'
  `);

  expect(tender).toMatchObject({
    department: "GUATEMALA",
    unit_gcuc: "62-16",
    unit_name: "EMPRESA ETCEE SISTEMA OCCIDENTAL",
    buyer_nit: "2455404",
  });
  expect(award).toEqual({
    amount: "2031.68",
    currency: "GTQ",
    supplier_id: "GT-NIT-332917",
    fecha_ok: true,
  });
  expect(unidad).toMatchObject({
    region: "QUETZALTENANGO",
    locality: "QUETZALTENANGO",
    member_of_id: "GT-CISP-21100080",
    roles: "buyer",
  });
});

it("guarda el NIT con dígito K y deja sin departamento a quien no trae entidad", async () => {
  const conK = await una(`
    SELECT buyer_nit, department, status_detail, tender_end IS NULL AS sin_cierre
    FROM ${parquet("tenders")}
    WHERE nog = 32411480
  `);
  const sinEntidad = await una(`
    SELECT buyer_nit, buyer_name, department, unit_gcuc, status_detail,
           tender_end IS NULL AS sin_cierre,
           (SELECT count(*) FROM ${parquet("items")} i WHERE i.nog = 32483694)::INTEGER AS n_items,
           (SELECT count(*) FROM ${parquet("parties")} p WHERE p.nog = 32483694)::INTEGER AS n_parties
    FROM ${parquet("tenders")}
    WHERE nog = 32483694
  `);

  expect(conK).toMatchObject({
    buyer_nit: "669876K",
    department: "SAN MARCOS",
    status_detail: "Vigente",
    sin_cierre: true,
  });
  expect(sinEntidad).toMatchObject({
    buyer_nit: "57280436",
    buyer_name: "ASOCIACION DE MUJERES EN ACCION SOLIDARIA",
    department: null,
    unit_gcuc: null,
    status_detail: "Vigente",
    sin_cierre: true,
    n_items: 49,
    n_parties: 0,
  });
});

it("separa cada adjudicación y ordena los roles del oferente", async () => {
  const awards = await varias(`
    SELECT award_id, amount::VARCHAR AS amount, currency, supplier_name
    FROM ${parquet("awards")}
    WHERE nog = 32555628
    ORDER BY award_id
  `);
  const oferente = await una(`
    SELECT roles, scheme
    FROM ${parquet("parties")}
    WHERE nog = 32567537 AND party_id = 'GT-NIT-372528538'
  `);
  const oferta = await una(`
    SELECT amount::VARCHAR AS amount, currency, tenderer_id, status
    FROM ${parquet("bids")}
    WHERE nog = 32567537
  `);

  expect(awards).toEqual([
    {
      award_id: "GT-ADJ-32555628-14940450",
      amount: "1409.50",
      currency: "GTQ",
      supplier_name: "PRICESMART (GUATEMALA), SOCIEDAD ANONIMA",
    },
    {
      award_id: "GT-ADJ-32555628-3306224",
      amount: "771.00",
      currency: "GTQ",
      supplier_name: "DISTRIBUIDORA JALAPEÑA, SOCIEDAD ANONIMA",
    },
    {
      award_id: "GT-ADJ-32555628-7378106",
      amount: "217.80",
      currency: "GTQ",
      supplier_name: "OPERADORA DE TIENDAS, SOCIEDAD ANONIMA",
    },
  ]);
  expect(oferente).toEqual({
    roles: "supplier,tenderer",
    scheme: "GT-NIT",
  });
  expect(oferta).toMatchObject({
    amount: "17500.00",
    currency: "GTQ",
    tenderer_id: "GT-NIT-372528538",
    status: "valid",
  });
});

it("escribe nog entero, timestamptz y montos con escala fija", async () => {
  const tenders = await tipos("tenders");
  const items = await tipos("items");
  const awards = await tipos("awards");

  expect(tenders.nog).toBe("BIGINT");
  expect(tenders.date_published).toBe("TIMESTAMP WITH TIME ZONE");
  expect(tenders.tender_end).toBe("TIMESTAMP WITH TIME ZONE");
  expect(tenders.n_tenderers).toBe("INTEGER");
  expect(items.quantity).toBe("DECIMAL(18,4)");
  expect(items.unspsc).toBe("VARCHAR");
  expect(awards.amount).toBe("DECIMAL(18,2)");
  expect(awards.award_date).toBe("TIMESTAMP WITH TIME ZONE");
});

function parquet(nombre: string): string {
  return sqlLiteral(join(salida, `${nombre}.parquet`));
}

function sqlLiteral(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

async function tipos(nombre: string): Promise<Record<string, string>> {
  const filas = await varias(`DESCRIBE SELECT * FROM ${parquet(nombre)}`);
  const mapa: Record<string, string> = {};
  for (const fila of filas) {
    mapa[String(fila.column_name)] = String(fila.column_type);
  }
  return mapa;
}

async function una(sql: string): Promise<Record<string, Json>> {
  const filas = await varias(sql);
  const fila = filas[0];
  if (fila === undefined) {
    throw new Error("La consulta no devolvió filas");
  }
  return fila;
}

async function varias(sql: string): Promise<Record<string, Json>[]> {
  const instance = await DuckDBInstance.create();
  const connection = await instance.connect();
  try {
    await connection.run("SET TimeZone = 'America/Guatemala'");
    const reader = await connection.runAndReadAll(sql);
    return reader.getRowObjectsJson();
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as buscarApi } from "../app/api/search/route";
import { GET as fichaApi } from "../app/api/tenders/[nog]/route";
import {
  SQL_LISTADO,
  buscarProcesos,
  leerActualizacion,
  obtenerFicha,
} from "./consultas";
import { cerrarPool, obtenerPool } from "./db";
import type { BusquedaValida } from "./parametros";

if (process.env.CI === "true" && (process.env.DATABASE_URL ?? "") === "") {
  throw new Error(
    "En CI hace falta DATABASE_URL para probar la búsqueda contra Postgres",
  );
}

const databaseUrl = process.env.DATABASE_URL;

it("ordena por ts_rank y no deja que la categoría tape el texto", () => {
  expect(SQL_LISTADO).toContain(
    "websearch_to_tsquery('spanish', unaccent($1))",
  );
  expect(SQL_LISTADO).toContain("ts_rank(t.search, c.ts)");
  expect(SQL_LISTADO).toContain("OR $1::text IS NOT NULL");
});

describe.skipIf(databaseUrl === undefined)(
  "consultas contra Postgres de ejemplo",
  () => {
    let url = "";

    beforeAll(async () => {
      if (databaseUrl === undefined) {
        return;
      }
      url = await urlDePrueba(databaseUrl);
      expect(new URL(url).pathname).toBe("/radar_web_test");
      process.env.DATABASE_URL = url;
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query(
          "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
        );
        await aplicarSql(client);
        await sembrar(client);
        const base = await client.query<{ nombre: string }>(
          "SELECT current_database() AS nombre",
        );
        expect(base.rows[0]?.nombre).toBe("radar_web_test");
      } finally {
        await client.end();
      }
    }, 60_000);

    afterAll(async () => {
      await cerrarPool();
      if (databaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = databaseUrl;
      }
    });

    it("sin texto ordena por fecha de publicación y respeta la zona de Guatemala", async () => {
      const pagina = await buscarProcesos(obtenerPool(), busqueda({}));
      expect(pagina.total).toBe(7);
      expect(pagina.resultados.map((fila) => fila.nog)).toEqual([
        "900000002",
        "900000006",
        "900000007",
        "900000001",
        "900000005",
        "900000003",
        "900000004",
      ]);

      const desde = await buscarProcesos(
        obtenerPool(),
        busqueda({ desde: "2026-11-16" }),
      );
      expect(desde.resultados.map((fila) => fila.nog)).toEqual(["900000002"]);
    });

    it("encuentra diésel sin tilde y no descarta por categoría", async () => {
      const diesel = await buscarProcesos(
        obtenerPool(),
        busqueda({ q: "diesel" }),
      );
      expect(diesel.total).toBe(3);
      expect(diesel.resultados.map((fila) => fila.nog).sort()).toEqual([
        "900000001",
        "900000003",
        "900000004",
      ]);

      const conCategoria = await buscarProcesos(
        obtenerPool(),
        busqueda({ q: "diesel", categoria: "goods" }),
      );
      const nogs = conCategoria.resultados.map((fila) => fila.nog);
      expect(nogs).toContain("900000003");
      expect(nogs.indexOf("900000004")).toBeLessThan(nogs.indexOf("900000003"));

      const soloServicios = await buscarProcesos(
        obtenerPool(),
        busqueda({ categoria: "services" }),
      );
      expect(soloServicios.resultados.map((fila) => fila.nog)).toEqual([
        "900000003",
      ]);
    });

    it("filtra departamento, estado, modalidad, fechas y adjudicación", async () => {
      const costa = await buscarProcesos(
        obtenerPool(),
        busqueda({ departamento: "ESCUINTLA" }),
      );
      expect(costa.resultados.map((fila) => fila.nog).sort()).toEqual([
        "900000003",
        "900000005",
      ]);

      const evaluacion = await buscarProcesos(
        obtenerPool(),
        busqueda({ estado: "Evaluación" }),
      );
      expect(evaluacion.resultados.map((fila) => fila.nog)).toEqual([
        "900000002",
      ]);

      const directa = await buscarProcesos(
        obtenerPool(),
        busqueda({ modalidad: "Compra directa" }),
      );
      expect(directa.resultados.map((fila) => fila.nog).sort()).toEqual([
        "900000004",
        "900000005",
      ]);

      const conAdjudicacion = await buscarProcesos(
        obtenerPool(),
        busqueda({ soloAdjudicacion: true }),
      );
      expect(conAdjudicacion.total).toBe(5);
      expect(conAdjudicacion.resultados.map((fila) => fila.nog)).not.toContain(
        "900000002",
      );

      const suma = conAdjudicacion.resultados.find(
        (fila) => fila.nog === "900000007",
      );
      expect(Number(suma?.montoAdjudicadoGtq)).toBeCloseTo(150.75, 2);
    });

    it("arma la ficha, el umbral y la proporción de compra directa", async () => {
      const ficha = await obtenerFicha(obtenerPool(), "900000001");
      expect(ficha?.fechaCierre).toBeNull();
      expect(ficha?.items[0]?.unspsc).toBe("15101505");
      expect(ficha?.adjudicaciones[0]?.proveedor).toBe("Proveedor Uno");
      expect(ficha?.indicadores[1]?.texto).toContain("2 de 3");
      expect(ficha?.indicadores[2]?.texto).toContain(
        "cercano al umbral de Q90,000 de compra directa",
      );
      expect(JSON.stringify(ficha)).not.toMatch(/corrup/i);

      const bajo = await obtenerFicha(obtenerPool(), "900000005");
      expect(bajo?.indicadores[2]?.texto).toBe(
        "Ningún monto adjudicado queda entre Q85,000 y Q90,000.",
      );
      expect(await obtenerFicha(obtenerPool(), "900000099")).toBeNull();

      const actualizacion = await leerActualizacion(obtenerPool());
      expect(actualizacion).toBe("2026-11-24T18:05:00.000Z");
    });

    it("la API valida limit, pagina y devuelve el NOG", async () => {
      const alto = await buscarApi(peticion("/api/search?limit=500"));
      expect(alto.status).toBe(400);
      expect(await alto.json()).toEqual({
        error: "limit debe ser un entero entre 1 y 50",
      });

      const diesel = await buscarApi(peticion("/api/search?q=diesel&limit=5"));
      expect(diesel.status).toBe(200);
      const cuerpo = (await diesel.json()) as {
        total: number;
        limit: number;
        resultados: { nog: string; monto_adjudicado_gtq: string | null }[];
      };
      expect(cuerpo.limit).toBe(5);
      expect(cuerpo.total).toBe(3);
      expect(cuerpo.resultados).toHaveLength(3);

      const segunda = await buscarApi(peticion("/api/search?limit=1&pagina=2"));
      const pagina = (await segunda.json()) as {
        resultados: { nog: string }[];
      };
      expect(pagina.resultados.map((fila) => fila.nog)).toEqual(["900000006"]);

      const mala = await fichaApi(peticion("/api/tenders/abc"), {
        params: Promise.resolve({ nog: "abc" }),
      });
      expect(mala.status).toBe(400);

      const ausente = await fichaApi(peticion("/api/tenders/900000099"), {
        params: Promise.resolve({ nog: "900000099" }),
      });
      expect(ausente.status).toBe(404);

      const ok = await fichaApi(peticion("/api/tenders/900000001"), {
        params: Promise.resolve({ nog: "900000001" }),
      });
      expect(ok.status).toBe(200);
      const detalle = (await ok.json()) as {
        nog: string;
        fecha_cierre: string | null;
        indicadores: { aviso: string }[];
      };
      expect(detalle.nog).toBe("900000001");
      expect(detalle.fecha_cierre).toBeNull();
      expect(detalle.indicadores[0]?.aviso).toContain("no una acusación");
    });
  },
);

function peticion(ruta: string): Request {
  return new Request(`http://localhost${ruta}`);
}

function busqueda(parcial: Partial<BusquedaValida>): BusquedaValida {
  return {
    q: null,
    departamento: null,
    estado: null,
    modalidad: null,
    categoria: null,
    desde: null,
    hasta: null,
    soloAdjudicacion: false,
    pagina: 1,
    limit: 20,
    ...parcial,
  };
}

async function urlDePrueba(origen: string): Promise<string> {
  const admin = new URL(origen);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const existe = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'radar_web_test'",
    );
    if ((existe.rowCount ?? 0) === 0) {
      await client.query("CREATE DATABASE radar_web_test");
    }
  } finally {
    await client.end();
  }
  const destino = new URL(origen);
  destino.pathname = "/radar_web_test";
  return destino.toString();
}

async function aplicarSql(client: Client): Promise<void> {
  const directorio = fileURLToPath(
    new URL("../../../packages/etl/migrations", import.meta.url),
  );
  const archivos = (await readdir(directorio))
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort();
  for (const archivo of archivos) {
    await client.query(await readFile(join(directorio, archivo), "utf8"));
  }
}

interface TenderSemilla {
  nog: string;
  title: string;
  status: string;
  method: string;
  category: string;
  published: string;
  end: string | null;
  nit: string;
  buyer: string;
  department: string | null;
}

async function sembrar(client: Client): Promise<void> {
  const tenders: TenderSemilla[] = [
    {
      nog: "900000001",
      title: "Suministro de diésel para generadores",
      status: "Vigente",
      method: "Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)",
      category: "goods",
      published: "2026-11-10T18:00:00Z",
      end: null,
      nit: "NIT-A",
      buyer: "Municipalidad de Ejemplo",
      department: "GUATEMALA",
    },
    {
      nog: "900000002",
      title: "Papel bond carta",
      status: "Evaluación",
      method: "Licitación Pública (Art. 17 LCE)",
      category: "goods",
      published: "2026-11-20T18:00:00Z",
      end: null,
      nit: "NIT-A",
      buyer: "Municipalidad de Ejemplo",
      department: "GUATEMALA",
    },
    {
      nog: "900000003",
      title: "Diesel de prueba",
      status: "Vigente",
      method: "Cotización (Art. 38 LCE)",
      category: "services",
      published: "2026-11-05T18:00:00Z",
      end: "2026-11-18T18:00:00Z",
      nit: "NIT-B",
      buyer: "Consejo de Ejemplo",
      department: "ESCUINTLA",
    },
    {
      nog: "900000004",
      title: "Diesel de prueba",
      status: "Adjudicado",
      method: "Compra directa",
      category: "goods",
      published: "2026-11-01T18:00:00Z",
      end: null,
      nit: "NIT-A",
      buyer: "Municipalidad de Ejemplo",
      department: "GUATEMALA",
    },
    {
      nog: "900000005",
      title: "Compra menor de tintas",
      status: "Adjudicado",
      method: "Compra directa",
      category: "goods",
      published: "2026-11-08T18:00:00Z",
      end: null,
      nit: "NIT-B",
      buyer: "Consejo de Ejemplo",
      department: "ESCUINTLA",
    },
    {
      nog: "900000006",
      title: "Filtro de zona horaria",
      status: "Vigente",
      method: "Cotización (Art. 38 LCE)",
      category: "works",
      published: "2026-11-16T02:00:00Z",
      end: null,
      nit: "NIT-C",
      buyer: "Entidad de Ejemplo",
      department: "PETEN",
    },
    {
      nog: "900000007",
      title: "Repuestos varios",
      status: "Adjudicado",
      method: "Cotización (Art. 38 LCE)",
      category: "goods",
      published: "2026-11-11T18:00:00Z",
      end: null,
      nit: "NIT-C",
      buyer: "Entidad de Ejemplo",
      department: "PETEN",
    },
  ];

  for (const tender of tenders) {
    await client.query(
      `INSERT INTO tenders (
        nog, ocid, title, status_detail, method_detail, category,
        date_published, tender_end, buyer_nit, buyer_name,
        unit_gcuc, unit_name, department, n_tenderers, source_month, search
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, '2026-11',
        to_tsvector('spanish', unaccent($3))
      )`,
      [
        tender.nog,
        `ocds-test-${tender.nog}`,
        tender.title,
        tender.status,
        tender.method,
        tender.category,
        tender.published,
        tender.end,
        tender.nit,
        tender.buyer,
        tender.nog === "900000001" ? "U-1" : null,
        tender.nog === "900000001" ? "Bodega central" : null,
        tender.department,
        tender.nog === "900000001" ? 2 : 0,
      ],
    );
  }

  await client.query(
    `INSERT INTO items (nog, item_id, description, unspsc, quantity, unit_name)
     VALUES (900000001, '1', 'Diesel', '15101505', 100.5, 'Galón')`,
  );
  await client.query(
    `INSERT INTO awards (
      nog, award_id, supplier_id, supplier_name, amount_gtq, award_date, status_detail
    ) VALUES
      (900000001, 'A-1', 'GT-NIT-111', 'Proveedor Uno', 89000.00, '2026-11-12T18:00:00Z', 'Adjudicado'),
      (900000003, 'A-3', 'GT-NIT-333', 'Proveedor Tres', 1500.50, '2026-11-06T18:00:00Z', 'Adjudicado'),
      (900000004, 'A-4', 'GT-NIT-444', 'Proveedor Cuatro', 90000.00, '2026-11-02T18:00:00Z', 'Adjudicado'),
      (900000005, 'A-5', 'GT-NIT-555', 'Proveedor Cinco', 84999.99, '2026-11-09T18:00:00Z', 'Adjudicado'),
      (900000007, 'A-7a', 'GT-NIT-771', 'Proveedor Siete', 100.50, '2026-11-12T18:00:00Z', 'Adjudicado'),
      (900000007, 'A-7b', 'GT-NIT-772', 'Proveedor Ocho', 50.25, '2026-11-12T18:00:00Z', 'Adjudicado')`,
  );
  await client.query(
    `INSERT INTO etl_runs (month, sha, rows, status, started_at, finished_at)
     VALUES ('2026-11', 'abc', 7, 'ok', '2026-11-24T18:00:00Z', '2026-11-24T18:05:00Z')`,
  );
}

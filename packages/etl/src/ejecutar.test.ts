import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
import { TABLAS } from "./aplanar.js";
import { urlOcds } from "./descarga.js";
import type { FuenteOcds } from "./ejecutar.js";
import { ejecutarEtl } from "./ejecutar.js";
import { parsearMes, ultimosMeses, type Mes } from "./meses.js";

const fixture = fileURLToPath(
  new URL("../test/fixtures/2026-11-muestra.json", import.meta.url),
);

let raiz = "";
const fetchOriginal = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = fetchOriginal;
  if (raiz !== "") {
    await rm(raiz, { recursive: true, force: true });
    raiz = "";
  }
});

it("no vuelve a descargar ni aplanar si el SHA publicado no cambió", async () => {
  raiz = await mkdtemp(join(tmpdir(), "radar-etl-run-"));
  const json = new Uint8Array(await readFile(fixture));
  const sha = createHash("sha256").update(json).digest("hex");
  const zip = zipSync({ "muestra.json": json });
  let zips = 0;
  const fuente = fuenteDe(sha, zip, () => {
    zips += 1;
  });
  const log: string[] = [];

  const primera = await ejecutarEtl({
    desde: "2026-11",
    hasta: "2026-11",
    raiz,
    fuente,
    log: (mensaje) => log.push(mensaje),
  });
  const manifest = await readFile(join(raiz, "data", "manifest.json"), "utf8");
  const calidad = JSON.parse(
    await readFile(join(raiz, "data", "quality", "2026-11.json"), "utf8"),
  ) as {
    sha256: string;
    filas: { tenders: number };
    records: number;
    nog_nulos: number;
  };

  expect(primera).toEqual({ procesados: ["2026-11"], omitidos: [] });
  expect(zips).toBe(1);
  expect(calidad.sha256).toBe(sha);
  expect(calidad.records).toBe(200);
  expect(calidad.filas.tenders).toBe(200);
  expect(calidad.nog_nulos).toBe(0);

  const segunda = await ejecutarEtl({
    desde: "2026-11",
    hasta: "2026-11",
    raiz,
    fuente,
    log: (mensaje) => log.push(mensaje),
  });

  expect(segunda).toEqual({ procesados: [], omitidos: ["2026-11"] });
  expect(zips).toBe(1);
  expect(await readFile(join(raiz, "data", "manifest.json"), "utf8")).toBe(
    manifest,
  );
  expect(log.some((linea) => linea.includes("sin cambios"))).toBe(true);
});

it("no escribe el manifest si el JSON no coincide con el SHA publicado", async () => {
  raiz = await mkdtemp(join(tmpdir(), "radar-etl-sha-"));
  const json = new Uint8Array(await readFile(fixture));
  const zip = zipSync({ "muestra.json": json });
  const fuente = fuenteDe("0".repeat(64), zip, () => undefined);

  await expect(
    ejecutarEtl({
      desde: "2026-11",
      hasta: "2026-11",
      raiz,
      fuente,
      log: () => undefined,
    }),
  ).rejects.toThrow(/no coincide/);
  await expect(
    readFile(join(raiz, "data", "manifest.json"), "utf8"),
  ).rejects.toThrow();
});

it("si la escritura falla a mitad, el mes anterior queda intacto y no deja temporales", async () => {
  raiz = await mkdtemp(join(tmpdir(), "radar-etl-atomico-"));
  const json = new Uint8Array(await readFile(fixture));
  const sha = createHash("sha256").update(json).digest("hex");
  const zip = zipSync({ "muestra.json": json });
  const fuente = fuenteDe(sha, zip, () => undefined);
  const mesDir = join(raiz, "data", "ocds", "anio=2026", "mes=11");

  await ejecutarEtl({
    desde: "2026-11",
    hasta: "2026-11",
    raiz,
    fuente,
    log: () => undefined,
  });

  const antes = new Map<string, string>();
  for (const tabla of TABLAS) {
    const bytes = await readFile(join(mesDir, `${tabla}.parquet`));
    antes.set(tabla, createHash("sha256").update(bytes).digest("hex"));
  }
  const calidad = await readFile(
    join(raiz, "data", "quality", "2026-11.json"),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(join(raiz, "data", "manifest.json"), "utf8"),
  ) as { meses: { "2026-11": { sha256: string } } };
  manifest.meses["2026-11"].sha256 = "f".repeat(64);
  const manifestAlterado = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(raiz, "data", "manifest.json"), manifestAlterado);

  await expect(
    ejecutarEtl({
      desde: "2026-11",
      hasta: "2026-11",
      raiz,
      fuente,
      log: () => undefined,
      despuesDeTabla(tabla) {
        if (tabla === "awards") {
          throw new Error("falla simulada");
        }
      },
    }),
  ).rejects.toThrow(/falla simulada/);

  for (const [tabla, hash] of antes) {
    const bytes = await readFile(join(mesDir, `${tabla}.parquet`));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
  }
  expect(
    await readFile(join(raiz, "data", "quality", "2026-11.json"), "utf8"),
  ).toBe(calidad);
  expect(await readFile(join(raiz, "data", "manifest.json"), "utf8")).toBe(
    manifestAlterado,
  );

  const hermanos = await readdir(join(raiz, "data", "ocds", "anio=2026"));
  expect(hermanos.filter((nombre) => nombre.includes(".tmp-"))).toEqual([]);
  expect(hermanos.filter((nombre) => nombre.includes(".old-"))).toEqual([]);
  expect(await readdir(join(raiz, "data", "tmp"))).toEqual([]);
});

it("omite el mes nuevo si la descarga responde 404 y sigue con el anterior", async () => {
  const corrida = await correrMesNuevo(404);

  expect(corrida.procesados).toEqual([corrida.desde]);
  expect(corrida.omitidos).toEqual([corrida.hasta]);
  expect(
    corrida.log.some((linea) =>
      linea.includes(`Aviso: ${corrida.hasta} aún no publicado, se omite`),
    ),
  ).toBe(true);
});

it("omite el mes nuevo si Guatecompras responde 204 sin cuerpo", async () => {
  const corrida = await correrMesNuevo(204);

  expect(corrida.procesados).toEqual([corrida.desde]);
  expect(corrida.omitidos).toEqual([corrida.hasta]);
  expect(corrida.log.some((linea) => linea.includes("aún no publicado"))).toBe(
    true,
  );
});

it("un 404 de un mes ya vencido sigue rompiendo la corrida", async () => {
  raiz = await mkdtemp(join(tmpdir(), "radar-etl-404-viejo-"));
  globalThis.fetch = () => Promise.resolve(new Response("no", { status: 404 }));

  await expect(
    ejecutarEtl({
      desde: "2020-01",
      hasta: "2020-01",
      raiz,
      log: () => undefined,
    }),
  ).rejects.toThrow(/HTTP 404/);
});

it("un 500 del mes nuevo sigue rompiendo la corrida", async () => {
  raiz = await mkdtemp(join(tmpdir(), "radar-etl-500-"));
  const mes = ultimosMeses(1, new Date()).hasta;
  globalThis.fetch = () =>
    Promise.resolve(new Response("fallo", { status: 500 }));

  await expect(
    ejecutarEtl({
      desde: mes,
      hasta: mes,
      raiz,
      log: () => undefined,
    }),
  ).rejects.toThrow(/HTTP 500/);
}, 15_000);

async function correrMesNuevo(estado: 404 | 204): Promise<{
  desde: string;
  hasta: string;
  procesados: string[];
  omitidos: string[];
  log: string[];
}> {
  raiz = await mkdtemp(join(tmpdir(), "radar-etl-ausente-"));
  const json = new Uint8Array(await readFile(fixture));
  const sha = createHash("sha256").update(json).digest("hex");
  const zip = zipSync({ "muestra.json": json });
  const { desde, hasta } = ultimosMeses(2, new Date());
  const mesAnterior = parsearMes(desde);
  const mesNuevo = parsearMes(hasta);
  const log: string[] = [];
  globalThis.fetch = (input) => {
    const url = urlDeFetch(input);
    if (url === urlOcds("sha", mesNuevo) || url === urlOcds("json", mesNuevo)) {
      const cuerpo = estado === 204 ? null : "no publicado";
      return Promise.resolve(new Response(cuerpo, { status: estado }));
    }
    if (url === urlOcds("sha", mesAnterior)) {
      return Promise.resolve(new Response(`${sha}\n`, { status: 200 }));
    }
    if (url === urlOcds("json", mesAnterior)) {
      return Promise.resolve(new Response(zip, { status: 200 }));
    }
    return Promise.resolve(new Response(`inesperado ${url}`, { status: 500 }));
  };

  const resultado = await ejecutarEtl({
    desde,
    hasta,
    raiz,
    log: (mensaje) => log.push(mensaje),
  });
  return {
    desde,
    hasta,
    procesados: resultado.procesados,
    omitidos: resultado.omitidos,
    log,
  };
}

function urlDeFetch(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function fuenteDe(
  sha: string,
  zip: Uint8Array,
  alDescargarZip: () => void,
): FuenteOcds {
  return {
    descargarSha(mes: Mes): Promise<string> {
      if (mes.clave !== "2026-11") {
        return Promise.reject(new Error(`mes inesperado: ${mes.clave}`));
      }
      return Promise.resolve(sha);
    },
    async descargarZip(mes: Mes, destino: string): Promise<void> {
      if (mes.clave !== "2026-11") {
        throw new Error(`mes inesperado: ${mes.clave}`);
      }
      alDescargarZip();
      await writeFile(destino, zip);
    },
  };
}

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
import { TABLAS } from "./aplanar.js";
import type { FuenteOcds } from "./ejecutar.js";
import { ejecutarEtl } from "./ejecutar.js";
import type { Mes } from "./meses.js";

const fixture = fileURLToPath(
  new URL("../test/fixtures/2026-11-muestra.json", import.meta.url),
);

let raiz = "";

afterEach(async () => {
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

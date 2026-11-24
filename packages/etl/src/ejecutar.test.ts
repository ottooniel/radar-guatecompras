import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
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
  ) as { sha256: string; filas: { tenders: number }; records: number };

  expect(primera).toEqual({ procesados: ["2026-11"], omitidos: [] });
  expect(zips).toBe(1);
  expect(calidad.sha256).toBe(sha);
  expect(calidad.records).toBe(200);
  expect(calidad.filas.tenders).toBe(200);

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

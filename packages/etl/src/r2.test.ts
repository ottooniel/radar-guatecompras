import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { expect, it } from "vitest";
import { guardarManifest } from "./manifest.js";
import { directorioOcds, rutaManifest } from "./rutas.js";
import { mensajeR2Omitido, parquetDelManifest, secretosR2 } from "./r2.js";

it("omite R2 si falta cualquier secreto", () => {
  expect(secretosR2({})).toBeNull();
  expect(
    secretosR2({
      R2_ACCOUNT_ID: "cuenta",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "  ",
    }),
  ).toBeNull();
  expect(mensajeR2Omitido()).toMatch(/se omite la subida/);
});

it("solo apunta a los Parquet del manifest, no a tmp ni old", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "radar-r2-"));
  try {
    const mes = { anio: 2026, mes: 11, clave: "2026-11" };
    const dir = directorioOcds(raiz, mes);
    await mkdir(dir, { recursive: true });
    for (const tabla of ["tenders", "items", "awards", "bids", "parties"]) {
      await writeFile(join(dir, `${tabla}.parquet`), "ok");
    }
    for (const nombre of ["mes=11.tmp-x", "mes=11.old-x"]) {
      const basura = join(raiz, "data", "ocds", "anio=2026", nombre);
      await mkdir(basura, { recursive: true });
      await writeFile(join(basura, "tenders.parquet"), "basura");
    }
    await guardarManifest(rutaManifest(raiz), {
      meses: {
        "2026-11": {
          sha256: "ab".repeat(32),
          records: 1,
          procesado_en: "2026-11-24T00:00:00.000Z",
        },
      },
    });

    const rutas = await parquetDelManifest(raiz);
    expect(rutas).toHaveLength(5);
    expect(rutas.some((ruta) => ruta.includes(".tmp-"))).toBe(false);
    expect(rutas.some((ruta) => ruta.includes(".old-"))).toBe(false);
    expect(rutas.every((ruta) => ruta.includes(`${sep}mes=11${sep}`))).toBe(
      true,
    );
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

it("arma los secretos cuando están los cuatro", () => {
  expect(
    secretosR2({
      R2_ACCOUNT_ID: " cuenta ",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "radar",
    }),
  ).toEqual({
    accountId: "cuenta",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "radar",
  });
});

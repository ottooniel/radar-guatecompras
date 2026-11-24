import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface EntradaManifest {
  sha256: string;
  records: number;
  procesado_en: string;
}

export interface Manifest {
  meses: Record<string, EntradaManifest>;
}

export async function leerManifest(ruta: string): Promise<Manifest> {
  let texto: string;
  try {
    texto = await readFile(ruta, "utf8");
  } catch (error) {
    if (esEnoent(error)) {
      return { meses: {} };
    }
    throw error;
  }

  const dato: unknown = JSON.parse(texto);
  if (!esManifest(dato)) {
    throw new Error(`${ruta} no tiene la forma { meses: { ... } }`);
  }
  return dato;
}

export async function guardarManifest(
  ruta: string,
  manifest: Manifest,
): Promise<void> {
  const meses = Object.fromEntries(
    Object.entries(manifest.meses).sort(([a], [b]) => a.localeCompare(b)),
  );
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, `${JSON.stringify({ meses }, null, 2)}\n`, "utf8");
}

function esManifest(valor: unknown): valor is Manifest {
  if (typeof valor !== "object" || valor === null || !("meses" in valor)) {
    return false;
  }
  return typeof valor.meses === "object" && valor.meses !== null;
}

function esEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

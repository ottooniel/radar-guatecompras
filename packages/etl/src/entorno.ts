import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Lee `KEY=VALUE`. No expande variables. Ignora vacíos y comentarios. */
export function parsearEntorno(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (limpia === "" || limpia.startsWith("#")) {
      continue;
    }
    const igual = limpia.indexOf("=");
    if (igual <= 0) {
      continue;
    }
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    salida[clave] = valor;
  }
  return salida;
}

/** Copia `.env` al proceso sin pisar variables que ya existen. */
export async function aplicarEntorno(raiz: string): Promise<void> {
  let texto: string;
  try {
    texto = await readFile(join(raiz, ".env"), "utf8");
  } catch (error) {
    if (esEnoent(error)) {
      return;
    }
    throw error;
  }
  for (const [clave, valor] of Object.entries(parsearEntorno(texto))) {
    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
    }
  }
}

export function exigirDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url === undefined || url === "") {
    throw new Error(
      "Falta DATABASE_URL. En local: docker compose up -d y copia .env.example a .env (postgres://radar:radar@localhost:5432/radar).",
    );
  }
  return url;
}

function esEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

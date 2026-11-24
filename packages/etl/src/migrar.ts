import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { conectar, enTransaccion } from "./postgres.js";

export function directorioMigracionesPorDefecto(): string {
  return fileURLToPath(new URL("../migrations", import.meta.url));
}

export async function aplicarMigraciones(opciones: {
  databaseUrl: string;
  directorio: string;
}): Promise<string[]> {
  const client = await conectar(opciones.databaseUrl);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const hechas = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const aplicadas = new Set(hechas.rows.map((fila) => fila.version));
    const archivos = (await readdir(opciones.directorio))
      .filter((nombre) => nombre.endsWith(".sql"))
      .sort();
    const nuevas: string[] = [];
    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) {
        continue;
      }
      const sql = await readFile(join(opciones.directorio, archivo), "utf8");
      await enTransaccion(client, async () => {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [archivo],
        );
      });
      nuevas.push(archivo);
    }
    return nuevas;
  } finally {
    await client.end();
  }
}

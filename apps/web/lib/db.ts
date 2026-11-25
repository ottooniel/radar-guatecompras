import { Pool, type PoolConfig } from "pg";

/**
 * Tope por instancia fuera del Transaction pooler.
 * En el puerto 6543 (transaction mode) el tope baja a 1.
 */
export const MAX_CONEXIONES = 3;

const APLICACION = "radar-guatecompras-web";

let pool: Pool | undefined;

/**
 * Pasa `DATABASE_URL` tal cual. `pg` 8 entiende `sslmode=no-verify`
 * y deja `rejectUnauthorized` en false. La cadena no se escribe en logs.
 *
 * Las consultas de la web usan `query(texto, valores)` sin `name`.
 * El Transaction pooler (puerto 6543) no conserva sentencias preparadas
 * con nombre; las consultas sin nombre sí pasan.
 */
export function opcionesDeConexion(databaseUrl: string): PoolConfig {
  return {
    connectionString: databaseUrl,
    max: maxConexionesDe(databaseUrl),
    application_name: APLICACION,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
}

export function maxConexionesDe(databaseUrl: string): number {
  if (puertoDe(databaseUrl) === "6543") {
    return 1;
  }
  return MAX_CONEXIONES;
}

function puertoDe(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).port;
  } catch {
    const coincidencia = /:(\d+)(?:\/|\?|$)/.exec(databaseUrl);
    return coincidencia?.[1] ?? "";
  }
}

export function obtenerPool(): Pool {
  if (pool !== undefined) {
    return pool;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error(
      "Falta DATABASE_URL. En local, copia apps/web/.env.example a apps/web/.env.local.",
    );
  }
  pool = new Pool(opcionesDeConexion(databaseUrl));
  pool.on("error", () => {
    console.error("Error en una conexión inactiva del pool de Postgres");
  });
  return pool;
}

export async function cerrarPool(): Promise<void> {
  if (pool === undefined) {
    return;
  }
  const actual = pool;
  pool = undefined;
  await actual.end();
}

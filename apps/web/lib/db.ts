import { Pool, type PoolConfig } from "pg";

/** Tope por instancia. En Vercel cada instancia es corta; 3 alcanza para buscar, contar y armar filtros a la vez. */
export const MAX_CONEXIONES = 3;

const APLICACION = "radar-guatecompras-web";

let pool: Pool | undefined;

/**
 * Pasa `DATABASE_URL` tal cual. `pg` 8 entiende `sslmode=no-verify`
 * (Session pooler de Supabase) y deja `rejectUnauthorized` en false.
 * La cadena no se escribe en logs.
 */
export function opcionesDeConexion(databaseUrl: string): PoolConfig {
  return {
    connectionString: databaseUrl,
    max: MAX_CONEXIONES,
    application_name: APLICACION,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
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

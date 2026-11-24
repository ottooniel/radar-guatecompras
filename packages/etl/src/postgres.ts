import { Client } from "pg";

export function crearCliente(databaseUrl: string): Client {
  return new Client({
    connectionString: databaseUrl,
    application_name: "radar-guatecompras",
  });
}

export async function conectar(databaseUrl: string): Promise<Client> {
  const client = crearCliente(databaseUrl);
  try {
    await client.connect();
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No se pudo conectar a Postgres. Revisa DATABASE_URL y que el servicio esté arriba. ${detalle}`,
    );
  }
  return client;
}

export async function enTransaccion<T>(
  client: Client,
  trabajo: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const resultado = await trabajo();
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

import type { Client } from "pg";
import { enTransaccion } from "./postgres.js";

/** Tope de `source_month` distintos. 5 por el límite de 500 MB del plan gratis de Supabase. */
export const MESES_CONSERVADOS = 5;

export interface ResultadoPoda {
  mesesBorrados: string[];
  buyers: number;
}

const SQL_PODAR_TENDERS = `
  WITH conservar AS (
    SELECT source_month
    FROM (
      SELECT DISTINCT source_month
      FROM tenders
      ORDER BY source_month DESC
      LIMIT $1
    ) AS recientes
  ),
  borrados AS (
    DELETE FROM tenders
    WHERE EXISTS (SELECT 1 FROM conservar)
      AND source_month NOT IN (SELECT source_month FROM conservar)
    RETURNING source_month
  )
  SELECT DISTINCT source_month
  FROM borrados
  ORDER BY source_month
`;

const SQL_PODAR_RUNS = `
  WITH conservar AS (
    SELECT source_month
    FROM (
      SELECT DISTINCT source_month
      FROM tenders
      ORDER BY source_month DESC
      LIMIT $1
    ) AS recientes
  )
  DELETE FROM etl_runs
  WHERE EXISTS (SELECT 1 FROM conservar)
    AND month NOT IN (SELECT source_month FROM conservar)
`;

/**
 * Un NIT, una fila. Si hay varios nombres o departamentos, gana el tender
 * con `date_published` más reciente. Empate: el NOG mayor.
 */
const SQL_BUYERS = `
  INSERT INTO buyers (nit, name, department)
  SELECT DISTINCT ON (buyer_nit)
    buyer_nit,
    buyer_name,
    department
  FROM tenders
  WHERE buyer_nit IS NOT NULL AND btrim(buyer_nit) <> ''
  ORDER BY buyer_nit, date_published DESC NULLS LAST, nog DESC
  ON CONFLICT (nit) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department
`;

const SQL_BUYERS_HUERFANOS = `
  DELETE FROM buyers AS b
  WHERE NOT EXISTS (
    SELECT 1 FROM tenders AS t
    WHERE t.buyer_nit = b.nit
  )
`;

export async function podarYActualizarBuyers(
  client: Client,
  conservar = MESES_CONSERVADOS,
): Promise<ResultadoPoda> {
  if (!Number.isInteger(conservar) || conservar < 1) {
    throw new Error("Los meses a conservar deben ser un entero positivo");
  }
  return enTransaccion(client, async () => {
    const borrados = await client.query<{ source_month: string }>(
      SQL_PODAR_TENDERS,
      [conservar],
    );
    await client.query(SQL_PODAR_RUNS, [conservar]);
    await client.query(SQL_BUYERS);
    await client.query(SQL_BUYERS_HUERFANOS);
    const cuenta = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM buyers",
    );
    const buyers = cuenta.rows[0]?.n;
    if (buyers === undefined) {
      throw new Error("No se pudo contar buyers");
    }
    return {
      mesesBorrados: borrados.rows.map((fila) => fila.source_month),
      buyers,
    };
  });
}

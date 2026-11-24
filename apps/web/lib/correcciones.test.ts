import type { Pool } from "pg";
import { expect, it } from "vitest";
import {
  listarOpciones,
  mensajePalabrasVacias,
  vaciarCacheOpciones,
} from "./consultas";

it("explica las palabras vacías con el texto buscado", () => {
  expect(mensajePalabrasVacias("de la")).toBe(
    "“de la” son palabras comunes que no se pueden buscar. Escribe un producto o servicio, por ejemplo “escritorios”.",
  );
});

it("listarOpciones reutiliza el resultado durante 10 minutos", async () => {
  vaciarCacheOpciones();
  let llamadas = 0;
  const db = {
    query: async () => {
      llamadas += 1;
      return { rows: [{ valor: "GUATEMALA" }] };
    },
  } as unknown as Pool;
  const ahora = 1_000_000;

  const primera = await listarOpciones(db, ahora);
  const segunda = await listarOpciones(db, ahora + 60_000);
  expect(segunda).toEqual(primera);
  expect(llamadas).toBe(4);

  await listarOpciones(db, ahora + 10 * 60 * 1000);
  expect(llamadas).toBe(8);
  vaciarCacheOpciones();
});

import type { Pool } from "pg";
import { beforeEach, expect, it } from "vitest";
import {
  listarOpciones,
  mensajePalabrasVacias,
  vaciarCacheOpciones,
} from "./consultas";

beforeEach(() => {
  vaciarCacheOpciones();
});

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
});

it("una estampida comparte la consulta en curso", async () => {
  let llamadas = 0;
  const db = {
    query: async () => {
      llamadas += 1;
      await new Promise((resolver) => setTimeout(resolver, 20));
      return { rows: [{ valor: "GUATEMALA" }] };
    },
  } as unknown as Pool;
  const ahora = 8_000_000;
  const [primera, segunda] = await Promise.all([
    listarOpciones(db, ahora),
    listarOpciones(db, ahora),
  ]);
  expect(primera).toEqual(segunda);
  expect(llamadas).toBe(4);
});

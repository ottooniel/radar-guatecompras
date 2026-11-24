import { expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  obtenerPool: () => ({
    query: async () => {
      throw new Error("fallo de prueba");
    },
  }),
}));

import { GET as buscar } from "./search/route";
import { GET as ficha } from "./tenders/[nog]/route";

it("la búsqueda responde 500 si la base falla", async () => {
  const respuesta = await buscar(
    new Request("http://localhost/api/search?q=diesel"),
  );
  expect(respuesta.status).toBe(500);
  expect(await respuesta.json()).toEqual({
    error: "No se pudo consultar la base",
  });
});

it("la ficha responde 500 si la base falla", async () => {
  const respuesta = await ficha(new Request("http://localhost/api/tenders/1"), {
    params: Promise.resolve({ nog: "1" }),
  });
  expect(respuesta.status).toBe(500);
  expect(await respuesta.json()).toEqual({
    error: "No se pudo consultar la base",
  });
});

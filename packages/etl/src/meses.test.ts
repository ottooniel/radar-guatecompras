import { expect, it } from "vitest";
import { mesesDelRango, parsearMes } from "./meses.js";
import { directorioOcds } from "./rutas.js";

it("enumera los doce meses del rango pedido", () => {
  expect(mesesDelRango("2025-12", "2026-11").map((mes) => mes.clave)).toEqual([
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ]);
});

it("guarda septiembre con dos dígitos en la ruta y sin cero en el número", () => {
  const mes = parsearMes("2026-09");

  expect(mes.mes).toBe(9);
  expect(directorioOcds("/repo", mes)).toBe("/repo/data/ocds/anio=2026/mes=09");
});

it("rechaza un mes fuera de rango o un desde posterior", () => {
  expect(() => parsearMes("2026-13")).toThrow(/Mes inválido/);
  expect(() => parsearMes("2026-9")).toThrow(/Mes inválido/);
  expect(() => mesesDelRango("2026-11", "2026-10")).toThrow(/posterior/);
});

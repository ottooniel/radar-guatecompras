import { expect, it } from "vitest";
import { leerArgumentos } from "./argumentos.js";

it("lee desde y hasta", () => {
  expect(leerArgumentos(["--desde", "2025-12", "--hasta", "2026-11"])).toEqual({
    desde: "2025-12",
    hasta: "2026-11",
  });
});

it("exige ambos límites", () => {
  expect(() => leerArgumentos(["--desde", "2026-11"])).toThrow(/Uso:/);
  expect(() => leerArgumentos(["--hasta"])).toThrow(/Falta el valor/);
  expect(() => leerArgumentos(["--otro", "1"])).toThrow(/no reconocido/);
});

import { expect, it } from "vitest";
import { leerBusqueda, leerNog } from "./parametros";

it("la página fija 20 resultados e ignora limit", () => {
  const leido = leerBusqueda(
    new URLSearchParams("q=diesel&limit=500&pagina=2"),
    "pagina",
  );
  expect(leido).toMatchObject({
    ok: true,
    busqueda: { q: "diesel", pagina: 2, limit: 20, soloAdjudicacion: false },
  });
});

it("la API rechaza limit fuera de 1 a 50", () => {
  const alto = leerBusqueda(new URLSearchParams("limit=500"), "api");
  const bajo = leerBusqueda(new URLSearchParams("limit=0"), "api");
  expect(alto).toEqual({
    ok: false,
    error: "limit debe ser un entero entre 1 y 50",
  });
  expect(bajo).toEqual({
    ok: false,
    error: "limit debe ser un entero entre 1 y 50",
  });
});

it("la API usa 20 si no viene limit y acepta 5", () => {
  expect(leerBusqueda(new URLSearchParams("q=diesel"), "api")).toMatchObject({
    ok: true,
    busqueda: { q: "diesel", limit: 20, pagina: 1 },
  });
  expect(
    leerBusqueda(new URLSearchParams("q=diesel&limit=5"), "api"),
  ).toMatchObject({
    ok: true,
    busqueda: { limit: 5 },
  });
});

it("rechaza fechas imposibles, el rango invertido y un parámetro repetido", () => {
  expect(leerBusqueda(new URLSearchParams("desde=2026-02-31"), "api")).toEqual({
    ok: false,
    error: "desde debe ser una fecha real en formato AAAA-MM-DD",
  });
  expect(
    leerBusqueda(
      new URLSearchParams("desde=2026-11-20&hasta=2026-11-01"),
      "api",
    ),
  ).toEqual({
    ok: false,
    error: "La fecha desde no puede ser posterior a hasta",
  });
  const repetido = new URLSearchParams();
  repetido.append("q", "diesel");
  repetido.append("q", "papel");
  expect(leerBusqueda(repetido, "api")).toEqual({
    ok: false,
    error: "El parámetro q va una sola vez",
  });
});

it("solo cuenta adjudicacion=1 y exige un NOG entero", () => {
  expect(
    leerBusqueda(new URLSearchParams("adjudicacion=1"), "api"),
  ).toMatchObject({ ok: true, busqueda: { soloAdjudicacion: true, q: null } });
  expect(leerBusqueda(new URLSearchParams("adjudicacion=si"), "api")).toEqual({
    ok: false,
    error: "adjudicacion debe ser 1",
  });
  expect(leerNog("900000001")).toEqual({ ok: true, nog: "900000001" });
  expect(leerNog("0").ok).toBe(false);
  expect(leerNog("12a").ok).toBe(false);
});

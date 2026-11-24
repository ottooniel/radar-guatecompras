import { expect, it } from "vitest";
import { aTitulo } from "./titulo";

it("pasa el título a minúsculas y mayúscula de oración", () => {
  expect(aTitulo("ADQUISICIÓN DE DIÉSEL PARA GENERADORES.")).toBe(
    "Adquisición de diésel para generadores.",
  );
  expect(aTitulo("COMPRA DE PAPEL. ENTREGA EN BODEGA")).toBe(
    "Compra de papel. Entrega en bodega",
  );
  expect(aTitulo("MINISTERIO DE LA DEFENSA NACIONAL")).toBe(
    "Ministerio de la defensa nacional",
  );
});

it("conserva siglas y números ordinales", () => {
  expect(aTitulo("EMPRESA EJEMPLO S.A. SEGÚN ART. 17 LCE")).toBe(
    "Empresa ejemplo S. A. según art. 17 LCE",
  );
  expect(aTitulo("EMPRESA EJEMPLO S. A. Y UNA ONG")).toBe(
    "Empresa ejemplo S. A. y una ONG",
  );
  expect(aTitulo("PROCESO NOG 123 CON NIT Y CÓDIGO UNSPSC")).toBe(
    "Proceso NOG 123 con NIT y código UNSPSC",
  );
  expect(aTitulo("1ER. TRIMESTRE DEL SUMINISTRO")).toBe(
    "1er. Trimestre del suministro",
  );
});

it("deja vacío un texto en blanco", () => {
  expect(aTitulo("   ")).toBe("");
  expect(aTitulo(null)).toBe("");
  expect(aTitulo(undefined)).toBe("");
});

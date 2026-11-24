import { expect, it } from "vitest";
import { NOMBRE_PAQUETE } from "./index.js";

it("reserva el paquete de ingesta sin descargar datos", () => {
  expect(NOMBRE_PAQUETE).toBe("@radar-guatecompras/etl");
});

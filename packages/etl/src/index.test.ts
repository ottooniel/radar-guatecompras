import { expect, it } from "vitest";
import { NOMBRE_PAQUETE } from "./index.js";

it("identifica el paquete de ingesta", () => {
  expect(NOMBRE_PAQUETE).toBe("@radar-guatecompras/etl");
});

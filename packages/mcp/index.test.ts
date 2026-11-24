import { expect, it } from "vitest";
import { NOMBRE_PAQUETE } from "./index.js";

it("reserva el paquete MCP sin registrar herramientas", () => {
  expect(NOMBRE_PAQUETE).toBe("@radar-guatecompras/mcp");
});

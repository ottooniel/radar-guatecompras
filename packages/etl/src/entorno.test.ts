import { expect, it } from "vitest";
import { parsearEntorno } from "./entorno.js";

it("lee variables y no pisa las que ya existen al interpretar el texto", () => {
  expect(
    parsearEntorno(`
# comentario
DATABASE_URL=postgres://radar:radar@localhost:5432/radar
R2_BUCKET=
VACIO=
CON_COMILLAS="abc"
`),
  ).toEqual({
    DATABASE_URL: "postgres://radar:radar@localhost:5432/radar",
    R2_BUCKET: "",
    VACIO: "",
    CON_COMILLAS: "abc",
  });
});

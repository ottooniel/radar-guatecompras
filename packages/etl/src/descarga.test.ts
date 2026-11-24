import { expect, it } from "vitest";
import { descargarSha, urlOcds } from "./descarga.js";
import { parsearMes } from "./meses.js";

it("arma la URL del mes sin cero a la izquierda", () => {
  const mes = parsearMes("2026-09");

  expect(urlOcds("sha", mes)).toBe(
    "https://ocds.guatecompras.gt/file/sha/2026/9",
  );
  expect(urlOcds("json", mes)).toBe(
    "https://ocds.guatecompras.gt/file/json/2026/9",
  );
});

it.skipIf(process.env.RUN_LIVE !== "1")(
  "el SHA real de noviembre 2026 tiene 64 hexadecimales",
  async () => {
    const sha = await descargarSha(parsearMes("2026-11"));

    expect(sha).toMatch(/^[0-9a-f]{64}$/);
  },
);

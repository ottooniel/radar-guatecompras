import { expect, expectTypeOf, it } from "vitest";
import type { ProcesoRef } from "./index.js";

it("identifica un proceso por su NOG", () => {
  const proceso = { nog: "123456" } satisfies ProcesoRef;

  expectTypeOf(proceso).toEqualTypeOf<ProcesoRef>();
  expect(proceso.nog).toBe("123456");
});

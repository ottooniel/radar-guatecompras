import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/db", () => ({
  obtenerPool: () => ({}),
}));

vi.mock("@/lib/consultas", () => ({
  obtenerFicha: async () => null,
}));

import Pagina from "./page";

it("notFound si el NOG no es un entero", async () => {
  await expect(
    Pagina({ params: Promise.resolve({ nog: "abc" }) }),
  ).rejects.toThrow("NOT_FOUND");
});

it("notFound si el proceso no está cargado", async () => {
  await expect(
    Pagina({ params: Promise.resolve({ nog: "999999999999" }) }),
  ).rejects.toThrow("NOT_FOUND");
});

import { Client } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { MAX_CONEXIONES, obtenerPool, opcionesDeConexion } from "./db";

afterEach(() => {
  vi.restoreAllMocks();
});

it("usa entre 1 y 3 conexiones y no registra la cadena", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const url =
    "postgres://user:secret@example.invalid:5432/db?sslmode=no-verify";
  const opciones = opcionesDeConexion(url);

  expect(MAX_CONEXIONES).toBeGreaterThanOrEqual(1);
  expect(MAX_CONEXIONES).toBeLessThanOrEqual(3);
  expect(opciones.max).toBe(MAX_CONEXIONES);
  expect(opciones.connectionString).toBe(url);
  expect(opciones.application_name).toBe("radar-guatecompras-web");
  expect(error).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("pg deja de verificar el certificado con sslmode=no-verify", () => {
  const client = new Client({
    connectionString: opcionesDeConexion(
      "postgres://user:secret@example.invalid:5432/db?sslmode=no-verify",
    ).connectionString,
  });
  const ssl = parametros(client).ssl;
  expect(ssl).toMatchObject({ rejectUnauthorized: false });
});

it("en local no exige SSL", () => {
  const client = new Client({
    connectionString: opcionesDeConexion(
      "postgres://radar:radar@localhost:5432/radar",
    ).connectionString,
  });
  expect(parametros(client).ssl).toBe(false);
});

it("exige DATABASE_URL sin abrir un pool", () => {
  const previa = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    expect(() => obtenerPool()).toThrow(/Falta DATABASE_URL/);
  } finally {
    if (previa === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previa;
    }
  }
});

function parametros(client: Client): {
  ssl?: { rejectUnauthorized?: boolean } | false;
} {
  return (
    client as unknown as {
      connectionParameters: { ssl?: { rejectUnauthorized?: boolean } | false };
    }
  ).connectionParameters;
}

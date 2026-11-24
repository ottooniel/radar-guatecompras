export function jsonOk(cuerpo: unknown): Response {
  return Response.json(cuerpo, {
    headers: { "cache-control": "no-store" },
  });
}

export function jsonError(estado: number, error: string): Response {
  return Response.json(
    { error },
    { status: estado, headers: { "cache-control": "no-store" } },
  );
}

export function registrarFallo(ruta: string, error: unknown): void {
  const nombre = error instanceof Error ? error.name : "Error";
  console.error(`No se pudo responder ${ruta}: ${nombre}`);
}

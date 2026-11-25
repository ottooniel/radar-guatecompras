import { fichaAJson, obtenerFicha } from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import { jsonError, jsonOk, registrarFallo } from "@/lib/http";
import { leerNog } from "@/lib/parametros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  contexto: { params: Promise<{ nog: string }> },
): Promise<Response> {
  const { nog } = await contexto.params;
  const leido = leerNog(nog);
  if (!leido.ok) {
    return jsonError(400, leido.error);
  }
  try {
    const ficha = await obtenerFicha(obtenerPool(), leido.nog);
    if (ficha === null) {
      return jsonError(
        404,
        "No existe un proceso con ese NOG en los meses cargados",
      );
    }
    return jsonOk(fichaAJson(ficha));
  } catch (error) {
    registrarFallo("GET /api/tenders/[nog]", error);
    return jsonError(500, "No se pudo consultar la base");
  }
}

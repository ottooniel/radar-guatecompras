import {
  buscarProcesos,
  busquedaAJson,
  mensajePalabrasVacias,
} from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import { jsonError, jsonOk, registrarFallo } from "@/lib/http";
import { leerBusqueda } from "@/lib/parametros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const leido = leerBusqueda(new URL(request.url).searchParams, "api");
  if (!leido.ok) {
    return jsonError(400, leido.error);
  }
  try {
    const pagina = await buscarProcesos(obtenerPool(), leido.busqueda);
    const aviso =
      pagina.consultaVacia && leido.busqueda.q !== null
        ? mensajePalabrasVacias(leido.busqueda.q)
        : null;
    return jsonOk(busquedaAJson(pagina, leido.busqueda, aviso));
  } catch (error) {
    registrarFallo("GET /api/search", error);
    return jsonError(500, "No se pudo consultar la base");
  }
}

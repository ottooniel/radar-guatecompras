import {
  buscarProcesos,
  busquedaAJson,
  consultaVacia,
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
    const pool = obtenerPool();
    if (leido.busqueda.q !== null) {
      const vacia = await consultaVacia(pool, leido.busqueda.q);
      if (vacia) {
        return jsonOk(
          busquedaAJson(
            { resultados: [], total: 0 },
            leido.busqueda,
            mensajePalabrasVacias(leido.busqueda.q),
          ),
        );
      }
    }
    const pagina = await buscarProcesos(pool, leido.busqueda);
    return jsonOk(busquedaAJson(pagina, leido.busqueda));
  } catch (error) {
    registrarFallo("GET /api/search", error);
    return jsonError(500, "No se pudo consultar la base");
  }
}

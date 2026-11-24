import type { Metadata } from "next";
import { PaginaBusqueda } from "@/components/PaginaBusqueda";
import {
  buscarProcesos,
  leerActualizacionSegura,
  listarOpciones,
  mensajePalabrasVacias,
} from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import {
  formularioDe,
  formularioDesde,
  leerBusqueda,
  TAMANO_PAGINA,
} from "@/lib/parametros";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Encuentra compras públicas",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await aSearchParams(searchParams);
  const leido = leerBusqueda(search, "pagina");
  const pool = obtenerPool();
  if (!leido.ok) {
    const [opciones, actualizacion] = await Promise.all([
      listarOpciones(pool),
      leerActualizacionSegura(),
    ]);
    return (
      <PaginaBusqueda
        filtros={formularioDesde(search)}
        opciones={opciones}
        resultados={[]}
        total={0}
        pagina={1}
        tamano={TAMANO_PAGINA}
        error={leido.error}
        aviso={null}
        actualizacion={actualizacion}
      />
    );
  }
  const [opciones, actualizacion, pagina] = await Promise.all([
    listarOpciones(pool),
    leerActualizacionSegura(),
    buscarProcesos(pool, leido.busqueda),
  ]);
  const aviso =
    pagina.consultaVacia && leido.busqueda.q !== null
      ? mensajePalabrasVacias(leido.busqueda.q)
      : null;
  return (
    <PaginaBusqueda
      filtros={formularioDe(leido.busqueda)}
      opciones={opciones}
      resultados={pagina.resultados}
      total={pagina.total}
      pagina={leido.busqueda.pagina}
      tamano={leido.busqueda.limit}
      error={null}
      aviso={aviso}
      actualizacion={actualizacion}
    />
  );
}

async function aSearchParams(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<URLSearchParams> {
  const crudos = await searchParams;
  const search = new URLSearchParams();
  for (const [clave, valor] of Object.entries(crudos)) {
    if (Array.isArray(valor)) {
      for (const parte of valor) {
        search.append(clave, parte);
      }
    } else if (valor !== undefined) {
      search.append(clave, valor);
    }
  }
  return search;
}

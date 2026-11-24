import type { Metadata } from "next";
import { PaginaBusqueda } from "@/components/PaginaBusqueda";
import { buscarProcesos, listarOpciones } from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import {
  formularioDe,
  formularioDesde,
  leerBusqueda,
  TAMANO_PAGINA,
} from "@/lib/parametros";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar procesos",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await aSearchParams(searchParams);
  const leido = leerBusqueda(search, "pagina");
  const opciones = await listarOpciones(obtenerPool());
  if (!leido.ok) {
    return (
      <PaginaBusqueda
        filtros={formularioDesde(search)}
        opciones={opciones}
        resultados={[]}
        total={0}
        pagina={1}
        tamano={TAMANO_PAGINA}
        error={leido.error}
      />
    );
  }
  const pagina = await buscarProcesos(obtenerPool(), leido.busqueda);
  return (
    <PaginaBusqueda
      filtros={formularioDe(leido.busqueda)}
      opciones={opciones}
      resultados={pagina.resultados}
      total={pagina.total}
      pagina={leido.busqueda.pagina}
      tamano={leido.busqueda.limit}
      error={null}
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

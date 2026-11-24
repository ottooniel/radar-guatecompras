import { cache } from "react";
import type { Metadata } from "next";
import { PaginaBusqueda } from "@/components/PaginaBusqueda";
import {
  buscarProcesos,
  consultaVacia,
  leerActualizacion,
  listarOpciones,
  mensajePalabrasVacias,
  type PaginaResultados,
} from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import {
  formularioDe,
  formularioDesde,
  leerBusqueda,
  TAMANO_PAGINA,
  type BusquedaValida,
} from "@/lib/parametros";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Encuentra compras públicas",
};

const SIN_RESULTADOS: PaginaResultados = { resultados: [], total: 0 };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await aSearchParams(searchParams);
  const leido = leerBusqueda(search, "pagina");
  const pool = obtenerPool();
  const opciones = await listarOpciones(pool);
  const actualizacion = await actualizacionDe();
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
        aviso={null}
        actualizacion={actualizacion}
      />
    );
  }
  const vacio = await avisoDe(leido.busqueda);
  const pagina =
    vacio === null
      ? await buscarProcesos(pool, leido.busqueda)
      : SIN_RESULTADOS;
  return (
    <PaginaBusqueda
      filtros={formularioDe(leido.busqueda)}
      opciones={opciones}
      resultados={pagina.resultados}
      total={pagina.total}
      pagina={leido.busqueda.pagina}
      tamano={leido.busqueda.limit}
      error={null}
      aviso={vacio}
      actualizacion={actualizacion}
    />
  );
}

async function avisoDe(busqueda: BusquedaValida): Promise<string | null> {
  if (busqueda.q === null) {
    return null;
  }
  const vacia = await consultaVacia(obtenerPool(), busqueda.q);
  return vacia ? mensajePalabrasVacias(busqueda.q) : null;
}

const actualizacionDe = cache(async (): Promise<string | null> => {
  try {
    return await leerActualizacion(obtenerPool());
  } catch {
    return null;
  }
});

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

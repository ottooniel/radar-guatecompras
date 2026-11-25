import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));
import type { Ficha, ResultadoBusqueda } from "@/lib/consultas";
import { armarIndicadores } from "@/lib/indicadores";
import { FichaProceso } from "./FichaProceso";
import { Marco } from "./Marco";
import { NoEncontrado } from "./NoEncontrado";
import { PaginaBusqueda } from "./PaginaBusqueda";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const resultado: ResultadoBusqueda = {
  nog: "900000001",
  titulo: "SUMINISTRO DE DIÉSEL PARA GENERADORES",
  comprador: "MUNICIPALIDAD DE EJEMPLO",
  departamento: "GUATEMALA",
  estado: "Vigente",
  modalidad: "Compra directa",
  categoria: "goods",
  fechaPublicacion: "2026-11-10T18:00:00.000Z",
  montoAdjudicadoGtq: "89000.00",
};

const filtros = {
  q: "diesel",
  departamento: "",
  estado: "",
  modalidad: "",
  categoria: "",
  desde: "",
  hasta: "",
  soloAdjudicacion: false,
};

it("la portada muestra el buscador, la cita y el monto", () => {
  const html = renderToStaticMarkup(
    <PaginaBusqueda
      filtros={filtros}
      opciones={{
        departamentos: ["GUATEMALA"],
        estados: ["Vigente"],
        modalidades: ["Compra directa"],
        categorias: ["goods"],
      }}
      resultados={[
        resultado,
        { ...resultado, nog: "900000002", montoAdjudicadoGtq: null },
      ]}
      total={25}
      pagina={2}
      tamano={20}
      error={null}
      aviso={null}
      actualizacion="2026-11-24T18:05:00.000Z"
    />,
  );

  expect(html).toContain("Encuentra compras públicas que puedes ofertar");
  expect(html).toContain('id="q"');
  expect(html).toContain('aria-label="Departamento"');
  expect(html).toContain("Suministro de diésel para generadores");
  expect(html).toContain("Municipalidad de ejemplo");
  expect(html).toContain("Guatemala");
  expect(html).toContain("Aplicar");
  expect(html).toContain("Vigente");
  expect(html).toContain("Publicado el 10 de noviembre");
  expect(html).toContain("NOG 900000001");
  expect(html).toContain("Q89,000.00");
  expect(html).toContain("Cerca de Q90,000");
  expect(html).toContain("Aún sin adjudicar");
  expect(html).toContain("Ordenados por relevancia");
  expect(html).toContain("Anterior");
  expect(html).toContain("escritorios");
  expect(html).not.toMatch(/·|→/);
  expect(html).not.toMatch(/corrup/i);
});

it("sin búsqueda dice que muestra lo más reciente", () => {
  const html = renderToStaticMarkup(
    <PaginaBusqueda
      filtros={{ ...filtros, q: "" }}
      opciones={{
        departamentos: [],
        estados: [],
        modalidades: [],
        categorias: [],
      }}
      resultados={[resultado]}
      total={1}
      pagina={1}
      tamano={20}
      error={null}
      aviso={null}
      actualizacion={null}
    />,
  );
  expect(html).toContain(
    "Mostrando lo más reciente. Escribe arriba para buscar.",
  );
});

it("sin resultados ofrece quitar cada filtro", () => {
  const html = renderToStaticMarkup(
    <PaginaBusqueda
      filtros={{ ...filtros, departamento: "GUATEMALA" }}
      opciones={{
        departamentos: ["GUATEMALA"],
        estados: [],
        modalidades: [],
        categorias: [],
      }}
      resultados={[]}
      total={0}
      pagina={1}
      tamano={20}
      error={null}
      aviso={null}
      actualizacion={null}
    />,
  );
  expect(html).toContain("No hay procesos con esos filtros.");
  expect(html).toContain("Quitar Guatemala");
  expect(html).toContain("Limpiar filtros");
});

it("la ficha muestra el monto, el cierre ausente y un solo aviso", () => {
  const html = renderToStaticMarkup(<FichaProceso ficha={ficha(null)} />);
  expect(html).toContain("Sin fecha de cierre publicada");
  expect(html).toContain("15101505");
  expect(html).toContain("Enfriador de combustible");
  expect(html).toContain("Proveedor uno");
  expect(html).toContain('class="medidor"');
  expect(html).not.toContain('class="barra"');
  expect(html).toContain("Q89,000.00");
  expect(html).toContain("Presente");
  expect(html).toContain("NOG 900000001 Copiar");
  expect(html).toContain("Volver a los resultados");
  expect(html).toContain("No son una acusación ni prueban irregularidades.");
  expect(html.match(/No son una acusación/g)).toHaveLength(1);
  expect(html).not.toMatch(/corrup/i);
});

it("marca el umbral sin coincidencia cuando el monto queda afuera", () => {
  const base = ficha("2026-11-18T18:00:00.000Z");
  const html = renderToStaticMarkup(
    <FichaProceso
      ficha={{
        ...base,
        adjudicaciones: [{ ...base.adjudicaciones[0]!, montoGtq: "1000.00" }],
      }}
    />,
  );
  expect(html).toContain("18 de noviembre");
  expect(html).toContain("Sin coincidencia");
  expect(html).not.toContain("Sin fecha de cierre publicada");
});

it("una página fuera de rango enlaza a la última", () => {
  const html = renderToStaticMarkup(
    <PaginaBusqueda
      filtros={filtros}
      opciones={{
        departamentos: [],
        estados: [],
        modalidades: [],
        categorias: [],
      }}
      resultados={[]}
      total={25}
      pagina={50}
      tamano={20}
      error={null}
      aviso={null}
      actualizacion={null}
    />,
  );
  expect(html).toContain("Esta página no existe");
  expect(html).toContain("Ir a la página 2");
  expect(html).toContain("pagina=2");
  expect(html).not.toContain("No hay procesos con esos filtros.");
});

it("si hay proveedor pero no monto, no dice que falta la adjudicación", () => {
  const base = ficha(null);
  const html = renderToStaticMarkup(
    <FichaProceso
      ficha={{
        ...base,
        adjudicaciones: [{ ...base.adjudicaciones[0]!, montoGtq: null }],
      }}
    />,
  );
  expect(html).toContain("Adjudicado, monto no publicado");
  expect(html).not.toContain("Aún sin adjudicar");
});

it("el 404 habla de los últimos 5 meses y el pie cita la fuente", () => {
  const perdido = renderToStaticMarkup(
    <NoEncontrado
      titulo="No encontramos ese proceso"
      texto="Ese NOG no está en los últimos 5 meses cargados."
    />,
  );
  expect(perdido).toContain("últimos 5 meses cargados");

  const marco = renderToStaticMarkup(
    <Marco actualizacion="2026-11-24T18:05:00.000Z">
      <p>contenido</p>
    </Marco>,
  );
  expect(marco).toContain("Radar Guatecompras");
  expect(marco).toContain("Buscar");
  expect(marco).toContain("Alertas, próximamente");
  expect(marco).toContain("Acerca de los datos, próximamente");
  expect(marco).toContain('aria-current="page"');
  expect(marco).toContain("CC BY 4.0");
  expect(marco).toContain(
    "Los indicadores describen datos publicados y no son una acusación.",
  );
  expect(marco).toContain("24 de noviembre");
});

it("el estilo es claro, con foco visible y corte para móvil", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../app/globals.css", import.meta.url)),
    "utf8",
  );
  expect(css).toContain("#ffffff");
  expect(css).toContain("#0b1b3b");
  expect(css).toContain(":focus-visible");
  expect(css).toContain("@media (max-width: 760px)");
  expect(css).toContain("prefers-color-scheme: dark");
  expect(css).toContain("prefers-reduced-motion");
});

function ficha(fechaCierre: string | null): Ficha {
  return {
    nog: "900000001",
    ocid: "ocds-test-900000001",
    titulo: "SUMINISTRO DE DIÉSEL PARA GENERADORES",
    estado: "Vigente",
    modalidad: "Compra directa",
    categoria: "goods",
    fechaPublicacion: "2026-11-10T18:00:00.000Z",
    fechaCierre,
    comprador: {
      nit: "NIT-A",
      nombre: "MUNICIPALIDAD DE EJEMPLO",
      unidadGcuc: "U-1",
      unidadNombre: "Bodega central",
      departamento: "GUATEMALA",
    },
    oferentes: 2,
    mesFuente: "2026-11",
    items: [
      {
        id: "1",
        descripcion: "ENFRIADOR DE COMBUSTIBLE",
        unspsc: "15101505",
        cantidad: "100.5000",
        unidad: "Galón",
      },
    ],
    adjudicaciones: [
      {
        id: "A-1",
        proveedorId: "GT-NIT-111",
        proveedor: "Proveedor Uno",
        montoGtq: "89000.00",
        fecha: "2026-11-12T18:00:00.000Z",
        estado: "Adjudicado",
      },
    ],
    proporcion: { total: 3, directas: 2 },
    indicadores: armarIndicadores({
      modalidad: "Compra directa",
      proporcion: { total: 3, directas: 2 },
      montosGtq: ["89000.00"],
    }),
  };
}

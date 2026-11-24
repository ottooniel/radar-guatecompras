import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { Ficha, ResultadoBusqueda } from "@/lib/consultas";
import { armarIndicadores } from "@/lib/indicadores";
import { FichaProceso } from "./FichaProceso";
import { Marco, Pie } from "./Marco";
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
  titulo: "Suministro de diésel para generadores",
  comprador: "Municipalidad de Ejemplo",
  departamento: "GUATEMALA",
  estado: "Vigente",
  modalidad: "Compra directa",
  categoria: "goods",
  fechaPublicacion: "2026-11-10T18:00:00.000Z",
  montoAdjudicadoGtq: "89000.00",
};

it("la búsqueda muestra filtros, cita y monto adjudicado", () => {
  const html = renderToStaticMarkup(
    <PaginaBusqueda
      filtros={{
        q: "diesel",
        departamento: "",
        estado: "",
        modalidad: "",
        categoria: "goods",
        desde: "",
        hasta: "",
        soloAdjudicacion: true,
      }}
      opciones={{
        departamentos: ["GUATEMALA"],
        estados: ["Vigente"],
        modalidades: ["Compra directa"],
        categorias: ["goods", "services"],
      }}
      resultados={[
        resultado,
        {
          ...resultado,
          nog: "900000002",
          montoAdjudicadoGtq: null,
          titulo: "Papel bond",
        },
      ]}
      total={25}
      pagina={2}
      tamano={20}
      error={null}
    />,
  );

  expect(html).toContain("<h1>Buscar procesos</h1>");
  expect(html).toContain('for="q"');
  expect(html).toContain('id="q"');
  expect(html).toContain('for="departamento"');
  expect(html).toContain('for="estado"');
  expect(html).toContain('for="modalidad"');
  expect(html).toContain('for="categoria"');
  expect(html).toContain('for="desde"');
  expect(html).toContain('for="hasta"');
  expect(html).toContain('for="adjudicacion"');
  expect(html).toContain("Suministro de diésel para generadores");
  expect(html).toContain("NOG 900000001");
  expect(html).toContain("Municipalidad de Ejemplo");
  expect(html).toContain("GUATEMALA");
  expect(html).toContain("Vigente");
  expect(html).toContain("Compra directa");
  expect(html).toContain("10 de noviembre de 2026");
  expect(html).toContain("Q89,000.00");
  expect(html).toContain("consultaConcurso.aspx?nog=900000001");
  expect(html).toContain("Página 2 de 2");
  expect(html).toContain(">Anterior<");
  expect(html).not.toContain(">Siguiente<");
  expect(html).toContain("No hay valor estimado");
  expect(html).not.toMatch(/corrup/i);
});

it("la ficha cita el NOG, no inventa cierre y muestra indicadores", () => {
  const html = renderToStaticMarkup(<FichaProceso ficha={ficha(null)} />);

  expect(html).toContain("Sin fecha de cierre publicada");
  expect(html).toContain("15101505");
  expect(html).toContain("Proveedor Uno");
  expect(html).toContain("Q89,000.00");
  expect(html).toContain("cercano al umbral de Q90,000 de compra directa");
  expect(html).toContain("Esto es un indicador, no una acusación.");
  expect(html).toContain("Bodega central");
  expect(html).toContain("NOG 900000001");
  expect(html).not.toMatch(/corrup/i);
});

it("muestra la fecha de cierre cuando está publicada", () => {
  const html = renderToStaticMarkup(
    <FichaProceso ficha={ficha("2026-11-18T18:00:00.000Z")} />,
  );
  expect(html).toContain("18 de noviembre de 2026");
  expect(html).not.toContain("Sin fecha de cierre publicada");
});

it("el 404 y el pie explican la fuente y los indicadores", () => {
  const perdido = renderToStaticMarkup(
    <NoEncontrado
      titulo="No encontramos ese proceso"
      texto="Ese NOG no está en los meses cargados, o el número no es válido."
    />,
  );
  expect(perdido).toContain("No encontramos ese proceso");
  expect(perdido).toContain('href="/"');

  const pie = renderToStaticMarkup(
    <Pie actualizacion="2026-11-24T18:05:00.000Z" />,
  );
  expect(pie).toContain("Guatecompras");
  expect(pie).toContain("CC BY 4.0");
  expect(pie).toContain("24 de noviembre de 2026");
  expect(pie).toContain("Esto es un indicador, no una acusación.");

  const marco = renderToStaticMarkup(
    <Marco actualizacion={null}>
      <p>contenido</p>
    </Marco>,
  );
  expect(marco).toContain("Radar Guatecompras");
  expect(marco).toContain("Saltar al contenido");
  expect(marco).toContain("Fecha de última actualización no disponible.");
});

it("el estilo es azul oscuro, con foco visible y corte para móvil", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../app/globals.css", import.meta.url)),
    "utf8",
  );
  expect(css).toContain("#071833");
  expect(css).toContain(":focus-visible");
  expect(css).toContain("@media (max-width: 720px)");
  expect(css).toMatch(/stroke='%232f6eb8'/);
});

function ficha(fechaCierre: string | null): Ficha {
  return {
    nog: "900000001",
    ocid: "ocds-test-900000001",
    titulo: "Suministro de diésel para generadores",
    estado: "Vigente",
    modalidad: "Compra directa",
    categoria: "goods",
    fechaPublicacion: "2026-11-10T18:00:00.000Z",
    fechaCierre,
    comprador: {
      nit: "NIT-A",
      nombre: "Municipalidad de Ejemplo",
      unidadGcuc: "U-1",
      unidadNombre: "Bodega central",
      departamento: "GUATEMALA",
    },
    oferentes: 2,
    mesFuente: "2026-11",
    items: [
      {
        id: "1",
        descripcion: "Diesel",
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
    indicadores: armarIndicadores({
      modalidad: "Compra directa",
      proporcion: { total: 3, directas: 2 },
      montosGtq: ["89000.00"],
    }),
  };
}

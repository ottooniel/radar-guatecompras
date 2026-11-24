import Link from "next/link";
import type { ReactNode } from "react";
import { formatoDia } from "@/lib/formato";
import { MenuBuscar } from "./MenuBuscar";

export function Marco({
  children,
  actualizacion,
}: {
  children: ReactNode;
  actualizacion: string | null;
}) {
  const fecha = actualizacion === null ? null : formatoDia(actualizacion);
  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="barra">
        <div className="contenedor barra-interior">
          <Link className="marca" href="/">
            <Logo />
            Radar Guatecompras
          </Link>
          <nav className="menu" aria-label="Secciones">
            <MenuBuscar />
          </nav>
          <p className="proximamente">
            <span>Alertas, próximamente</span>
            <span>Acerca de los datos, próximamente</span>
          </p>
        </div>
      </header>
      <div id="contenido">{children}</div>
      <footer className="pie">
        <div className="contenedor">
          <p>
            Fuente: datos abiertos de{" "}
            <a href="https://ocds.guatecompras.gt/descarga-datos">
              Guatecompras
            </a>
            , licencia{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.es">
              CC BY 4.0
            </a>
            . Sitio independiente y no oficial.
          </p>
          <p>
            {fecha === null
              ? "Sin fecha de actualización."
              : `Datos al ${fecha}.`}{" "}
            Los indicadores describen datos publicados y no son una acusación.
          </p>
        </div>
      </footer>
    </>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="11"
        cy="11"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="11" cy="11" r="1.7" fill="currentColor" />
    </svg>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { formatoFecha } from "@/lib/formato";

export function Marco({
  children,
  actualizacion,
}: {
  children: ReactNode;
  actualizacion: string | null;
}) {
  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="barra">
        <Link className="marca" href="/">
          Radar Guatecompras
        </Link>
        <p className="lema">Procesos de compra pública, citados por NOG</p>
      </header>
      <div id="contenido">{children}</div>
      <Pie actualizacion={actualizacion} />
    </>
  );
}

export function Pie({ actualizacion }: { actualizacion: string | null }) {
  return (
    <footer className="pie">
      <p>
        Fuente: datos abiertos OCDS de{" "}
        <a href="https://ocds.guatecompras.gt/descarga-datos">Guatecompras</a>,
        licencia{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/deed.es">
          CC BY 4.0
        </a>
        . No es un sitio oficial.
      </p>
      <p>
        {actualizacion === null
          ? "Fecha de última actualización no disponible."
          : `Última actualización: ${formatoFecha(actualizacion)} (hora de Guatemala).`}
      </p>
      <p>
        Los indicadores describen los datos publicados. Esto es un indicador, no
        una acusación.
      </p>
    </footer>
  );
}

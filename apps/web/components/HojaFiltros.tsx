"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";

/** En escritorio, un cambio de filtro envía el formulario. En móvil se usa el botón. */
export function EnviarEnEscritorio({ children }: { children: ReactNode }) {
  return (
    <div
      onChange={(evento: FormEvent<HTMLDivElement>) => {
        if (window.matchMedia("(max-width: 760px)").matches) {
          return;
        }
        const origen = evento.target;
        if (!(origen instanceof HTMLElement)) {
          return;
        }
        origen.closest("form")?.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}

export function CerrarConEscape() {
  useEffect(() => {
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") {
        return;
      }
      const caja = document.getElementById("abrir-filtros");
      if (caja instanceof HTMLInputElement && caja.checked) {
        caja.checked = false;
      }
    };
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, []);
  return null;
}

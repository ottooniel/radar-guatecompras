"use client";

import { useState } from "react";

export function CopiarNog({ nog }: { nog: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="boton-nog"
      onClick={() => {
        const clipboard = navigator.clipboard;
        if (clipboard === undefined) {
          return;
        }
        void clipboard.writeText(nog).then(
          () => setCopiado(true),
          () => setCopiado(false),
        );
      }}
    >
      NOG {nog} {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Radar Guatecompras",
  description:
    "Alertas de concursos del Estado para MIPYMES, con búsqueda en español. Datos abiertos OCDS de Guatecompras.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

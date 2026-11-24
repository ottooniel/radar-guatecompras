import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Marco } from "@/components/Marco";
import { leerActualizacion } from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Radar Guatecompras",
    template: "%s · Radar Guatecompras",
  },
  description:
    "Búsqueda de procesos de compra pública de Guatecompras. Datos abiertos OCDS, licencia CC BY 4.0.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Marco actualizacion={await actualizacionSegura()}>{children}</Marco>
      </body>
    </html>
  );
}

async function actualizacionSegura(): Promise<string | null> {
  try {
    return await leerActualizacion(obtenerPool());
  } catch {
    return null;
  }
}

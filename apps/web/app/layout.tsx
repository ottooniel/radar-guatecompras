import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Marco } from "@/components/Marco";
import { leerActualizacionSegura } from "@/lib/consultas";
import "./globals.css";

const titulo = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--fuente-titulo",
  display: "swap",
});

const texto = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-texto",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Radar Guatecompras",
    template: "%s - Radar Guatecompras",
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
    <html lang="es" className={`${titulo.variable} ${texto.variable}`}>
      <body>
        <Marco actualizacion={await leerActualizacionSegura()}>
          {children}
        </Marco>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FichaProceso } from "@/components/FichaProceso";
import { obtenerFicha } from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import { leerNog } from "@/lib/parametros";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nog: string }>;
}): Promise<Metadata> {
  const { nog } = await params;
  const leido = leerNog(nog);
  return { title: leido.ok ? `NOG ${leido.nog}` : "Proceso" };
}

export default async function PaginaProceso({
  params,
}: {
  params: Promise<{ nog: string }>;
}) {
  const { nog } = await params;
  const leido = leerNog(nog);
  if (!leido.ok) {
    notFound();
  }
  const ficha = await obtenerFicha(obtenerPool(), leido.nog);
  if (ficha === null) {
    notFound();
  }
  return <FichaProceso ficha={ficha} />;
}

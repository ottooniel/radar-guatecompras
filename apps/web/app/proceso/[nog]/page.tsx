import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FichaProceso } from "@/components/FichaProceso";
import { obtenerFicha } from "@/lib/consultas";
import { obtenerPool } from "@/lib/db";
import { leerNog } from "@/lib/parametros";
import { aTitulo } from "@/lib/titulo";

const fichaDe = cache(async (nog: string) => obtenerFicha(obtenerPool(), nog));

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nog: string }>;
}): Promise<Metadata> {
  const { nog } = await params;
  const leido = leerNog(nog);
  if (!leido.ok) {
    return { title: "Proceso" };
  }
  const ficha = await fichaDe(leido.nog);
  const titulo = aTitulo(ficha?.titulo);
  return { title: titulo === "" ? `NOG ${leido.nog}` : titulo };
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
  const ficha = await fichaDe(leido.nog);
  if (ficha === null) {
    notFound();
  }
  return <FichaProceso ficha={ficha} />;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MenuBuscar() {
  const ruta = usePathname();
  return (
    <Link href="/" aria-current={ruta === "/" ? "page" : undefined}>
      Buscar
    </Link>
  );
}

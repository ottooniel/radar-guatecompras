import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Mes } from "./meses.js";

export function raizDelRepo(inicio: string): string {
  let dir = resolve(inicio);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const padre = dirname(dir);
    if (padre === dir) {
      throw new Error(
        `No se encontró pnpm-workspace.yaml a partir de ${inicio}`,
      );
    }
    dir = padre;
  }
}

export function directorioOcds(raiz: string, mes: Mes): string {
  const mm = String(mes.mes).padStart(2, "0");
  return join(raiz, "data", "ocds", `anio=${mes.anio}`, `mes=${mm}`);
}

export function rutaCalidad(raiz: string, clave: string): string {
  return join(raiz, "data", "quality", `${clave}.json`);
}

export function rutaManifest(raiz: string): string {
  return join(raiz, "data", "manifest.json");
}

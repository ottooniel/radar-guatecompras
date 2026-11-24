import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  aplanarOcds,
  type MetricasCalidad,
  type ReporteCalidad,
  type Tabla,
} from "./aplanar.js";
import {
  descargarSha,
  descargarZip,
  extraerJsonDelZip,
  sha256Archivo,
} from "./descarga.js";
import { guardarManifest, leerManifest } from "./manifest.js";
import { mesesDelRango, type Mes } from "./meses.js";
import { directorioOcds, rutaCalidad, rutaManifest } from "./rutas.js";

export interface FuenteOcds {
  descargarSha(mes: Mes): Promise<string>;
  descargarZip(mes: Mes, destino: string): Promise<void>;
}

export interface OpcionesEtl {
  desde: string;
  hasta: string;
  raiz: string;
  fuente?: FuenteOcds;
  log?: (mensaje: string) => void;
  /** Prueba: se llama después de escribir cada tabla, antes de publicar el mes. */
  despuesDeTabla?: (tabla: Tabla) => void;
}

export interface ResultadoEtl {
  procesados: string[];
  omitidos: string[];
}

const fuenteHttp: FuenteOcds = {
  descargarSha,
  descargarZip,
};

export async function ejecutarEtl(
  opciones: OpcionesEtl,
): Promise<ResultadoEtl> {
  const fuente = opciones.fuente ?? fuenteHttp;
  const log = opciones.log ?? ((mensaje: string) => console.log(mensaje));
  const meses = mesesDelRango(opciones.desde, opciones.hasta);
  const manifestRuta = rutaManifest(opciones.raiz);
  const manifest = await leerManifest(manifestRuta);
  const procesados: string[] = [];
  const omitidos: string[] = [];
  const reloj = Date.now();

  for (const mes of meses) {
    const shaRemoto = await fuente.descargarSha(mes);
    if (manifest.meses[mes.clave]?.sha256 === shaRemoto) {
      omitidos.push(mes.clave);
      log(`${mes.clave} sin cambios, SHA igual`);
      continue;
    }

    const inicio = Date.now();
    await mkdir(join(opciones.raiz, "data", "tmp"), { recursive: true });
    const tmp = await mkdtemp(
      join(opciones.raiz, "data", "tmp", `${mes.clave}-`),
    );
    try {
      const zipPath = join(tmp, "paquete.zip");
      const jsonPath = join(tmp, "paquete.json");
      await fuente.descargarZip(mes, zipPath);
      await extraerJsonDelZip(zipPath, jsonPath);
      const shaJson = await sha256Archivo(jsonPath);
      if (shaJson !== shaRemoto) {
        throw new Error(
          `${mes.clave}: el SHA del JSON (${shaJson}) no coincide con el publicado (${shaRemoto})`,
        );
      }

      const destino = directorioOcds(opciones.raiz, mes);
      await mkdir(dirname(destino), { recursive: true });
      const staging = await mkdtemp(
        join(dirname(destino), `${basename(destino)}.tmp-`),
      );
      try {
        const metricas = await aplanarOcds({
          jsonPath,
          salidaDir: staging,
          sourceMonth: mes.clave,
          despuesDeTabla: opciones.despuesDeTabla,
        });
        if (metricas.filas.tenders !== metricas.records) {
          throw new Error(
            `${mes.clave}: tenders (${metricas.filas.tenders}) no coincide con records (${metricas.records})`,
          );
        }
        await publicarDirectorio(staging, destino);

        const reporte = reporteDe(mes.clave, shaJson, metricas);
        await mkdir(join(opciones.raiz, "data", "quality"), {
          recursive: true,
        });
        await writeFile(
          rutaCalidad(opciones.raiz, mes.clave),
          `${JSON.stringify(reporte, null, 2)}\n`,
          "utf8",
        );
        manifest.meses[mes.clave] = {
          sha256: shaJson,
          records: metricas.records,
          procesado_en: new Date().toISOString(),
        };
        await guardarManifest(manifestRuta, manifest);
        procesados.push(mes.clave);
        const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
        log(
          `${mes.clave} listo en ${segundos}s: ${metricas.filas.tenders} tenders, ${metricas.records} records`,
        );
        log(
          `${mes.clave} calidad: filas tenders=${metricas.filas.tenders} items=${metricas.filas.items} awards=${metricas.filas.awards} bids=${metricas.filas.bids} parties=${metricas.filas.parties}; nog_duplicados=${metricas.nog_duplicados}; nog_nulos=${metricas.nog_nulos}; fechas_no_parsean=${metricas.fechas_no_parsean}; sin_departamento=${metricas.sin_departamento}; sin_items=${metricas.sin_items}; vigentes_sin_fecha_cierre=${metricas.vigentes_sin_fecha_cierre}`,
        );
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  const total = ((Date.now() - reloj) / 1000).toFixed(1);
  log(
    `ETL: ${procesados.length} procesados, ${omitidos.length} omitidos, ${total}s`,
  );
  return { procesados, omitidos };
}

/**
 * El mes queda en `mes=MM.tmp-<id>`, al lado del directorio final y en el
 * mismo filesystem. Al terminar, el directorio anterior pasa a `mes=MM.old-<id>`,
 * el temporal ocupa su lugar con un rename y el `.old` se borra. Si el rename
 * falla, el anterior vuelve a `mes=MM`.
 */
async function publicarDirectorio(
  staging: string,
  destino: string,
): Promise<void> {
  const marca = staging.slice(staging.lastIndexOf(".tmp-") + ".tmp-".length);
  const viejo = join(dirname(destino), `${basename(destino)}.old-${marca}`);
  let apartado = false;
  try {
    if (existsSync(destino)) {
      await rename(destino, viejo);
      apartado = true;
    }
    await rename(staging, destino);
    apartado = false;
  } catch (error) {
    if (apartado && existsSync(viejo) && !existsSync(destino)) {
      await rename(viejo, destino);
    }
    throw error;
  }
  await rm(viejo, { recursive: true, force: true });
}

function reporteDe(
  mes: string,
  sha256: string,
  metricas: MetricasCalidad,
): ReporteCalidad {
  return {
    mes,
    sha256,
    records: metricas.records,
    filas: metricas.filas,
    nog_duplicados: metricas.nog_duplicados,
    nog_nulos: metricas.nog_nulos,
    fechas_no_parsean: metricas.fechas_no_parsean,
    fechas_no_parsean_detalle: metricas.fechas_no_parsean_detalle,
    sin_departamento: metricas.sin_departamento,
    sin_items: metricas.sin_items,
    vigentes_sin_fecha_cierre: metricas.vigentes_sin_fecha_cierre,
  };
}

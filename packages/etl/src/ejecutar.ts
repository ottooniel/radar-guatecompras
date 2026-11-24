import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TABLAS,
  aplanarOcds,
  type MetricasCalidad,
  type ReporteCalidad,
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

      const staging = join(tmp, "parquet");
      const metricas = await aplanarOcds({
        jsonPath,
        salidaDir: staging,
        sourceMonth: mes.clave,
      });
      if (metricas.filas.tenders !== metricas.records) {
        throw new Error(
          `${mes.clave}: tenders (${metricas.filas.tenders}) no coincide con records (${metricas.records})`,
        );
      }

      const destino = directorioOcds(opciones.raiz, mes);
      await mkdir(destino, { recursive: true });
      for (const tabla of TABLAS) {
        await rename(
          join(staging, `${tabla}.parquet`),
          join(destino, `${tabla}.parquet`),
        );
      }

      const reporte = reporteDe(mes.clave, shaJson, metricas);
      await mkdir(join(opciones.raiz, "data", "quality"), { recursive: true });
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
        `${mes.clave} calidad: filas tenders=${metricas.filas.tenders} items=${metricas.filas.items} awards=${metricas.filas.awards} bids=${metricas.filas.bids} parties=${metricas.filas.parties}; nog_duplicados=${metricas.nog_duplicados}; fechas_no_parsean=${metricas.fechas_no_parsean}; sin_departamento=${metricas.sin_departamento}; sin_items=${metricas.sin_items}; vigentes_sin_fecha_cierre=${metricas.vigentes_sin_fecha_cierre}`,
      );
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
    fechas_no_parsean: metricas.fechas_no_parsean,
    fechas_no_parsean_detalle: metricas.fechas_no_parsean_detalle,
    sin_departamento: metricas.sin_departamento,
    sin_items: metricas.sin_items,
    vigentes_sin_fecha_cierre: metricas.vigentes_sin_fecha_cierre,
  };
}

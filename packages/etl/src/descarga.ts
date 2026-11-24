import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { unzipSync } from "fflate";
import type { Mes } from "./meses.js";

const ORIGEN = "https://ocds.guatecompras.gt/file";
const AGENTE = "radar-guatecompras-etl";

export function urlOcds(tipo: "json" | "sha", mes: Mes): string {
  return `${ORIGEN}/${tipo}/${mes.anio}/${mes.mes}`;
}

export async function descargarSha(mes: Mes): Promise<string> {
  const url = urlOcds("sha", mes);
  return conReintentos(async () => {
    const respuesta = await fetch(url, {
      headers: { "user-agent": AGENTE },
      signal: AbortSignal.timeout(60_000),
    });
    if (respuesta.status >= 400 && respuesta.status < 500) {
      throw new ErrorPermanente(`HTTP ${respuesta.status} ${url}`);
    }
    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status} ${url}`);
    }
    const texto = (await respuesta.text()).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(texto)) {
      throw new ErrorPermanente(`El SHA de ${url} no tiene 64 hexadecimales`);
    }
    return texto;
  });
}

export async function descargarZip(mes: Mes, destino: string): Promise<void> {
  const url = urlOcds("json", mes);
  await conReintentos(async () => {
    const respuesta = await fetch(url, {
      headers: { "user-agent": AGENTE },
      signal: AbortSignal.timeout(180_000),
    });
    if (respuesta.status >= 400 && respuesta.status < 500) {
      throw new ErrorPermanente(`HTTP ${respuesta.status} ${url}`);
    }
    if (!respuesta.ok || respuesta.body === null) {
      throw new Error(`HTTP ${respuesta.status} ${url}`);
    }
    await pipeline(
      Readable.fromWeb(respuesta.body),
      createWriteStream(destino),
    );
  });
}

/**
 * El ZIP trae un solo JSON. El SHA publicado es de esos bytes, no del ZIP.
 */
export async function extraerJsonDelZip(
  zipPath: string,
  destino: string,
): Promise<void> {
  const comprimido = new Uint8Array(await readFile(zipPath));
  const archivos = unzipSync(comprimido);
  const jsons = Object.entries(archivos).filter(([nombre, bytes]) => {
    const base = nombre.split("/").pop() ?? "";
    return base.endsWith(".json") && bytes.byteLength > 0;
  });
  const unico = jsons[0];
  if (jsons.length !== 1 || unico === undefined) {
    throw new Error(`El ZIP debe traer un solo JSON y trajo ${jsons.length}`);
  }
  await writeFile(destino, unico[1]);
}

export async function sha256Archivo(ruta: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(ruta), hash);
  return hash.digest("hex");
}

class ErrorPermanente extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorPermanente";
  }
}

async function conReintentos<T>(accion: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      return await accion();
    } catch (error) {
      if (error instanceof ErrorPermanente) {
        throw error;
      }
      ultimo = error;
      if (intento === 3) {
        break;
      }
      await new Promise((resolver) => {
        setTimeout(resolver, 1000 * intento);
      });
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}

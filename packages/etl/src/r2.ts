import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { TABLAS } from "./aplanar.js";
import { leerManifest, mesesPublicados } from "./manifest.js";
import { rutaManifest, rutaParquet } from "./rutas.js";

export interface SecretosR2 {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

const CLAVES = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

/** Null si falta alguno: la subida se omite y no es un error. */
export function secretosR2(env: NodeJS.ProcessEnv): SecretosR2 | null {
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = env.R2_BUCKET?.trim() ?? "";
  if (
    accountId === "" ||
    accessKeyId === "" ||
    secretAccessKey === "" ||
    bucket === ""
  ) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export async function subirParquetAR2(opciones: {
  raiz: string;
  secretos: SecretosR2;
  log?: (mensaje: string) => void;
}): Promise<number> {
  const log = opciones.log ?? ((mensaje: string) => console.log(mensaje));
  const archivos = await parquetDelManifest(opciones.raiz);
  if (archivos.length === 0) {
    log("R2: data/manifest.json no tiene meses. No se sube nada.");
    return 0;
  }
  const cliente = new S3Client({
    region: "auto",
    endpoint: `https://${opciones.secretos.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: opciones.secretos.accessKeyId,
      secretAccessKey: opciones.secretos.secretAccessKey,
    },
  });
  for (const ruta of archivos) {
    const info = await stat(ruta);
    const clave = relative(join(opciones.raiz, "data"), ruta)
      .split("\\")
      .join("/");
    await cliente.send(
      new PutObjectCommand({
        Bucket: opciones.secretos.bucket,
        Key: clave,
        Body: createReadStream(ruta),
        ContentLength: info.size,
      }),
    );
  }
  log(`R2: ${archivos.length} Parquet subidos a ${opciones.secretos.bucket}`);
  return archivos.length;
}

export function mensajeR2Omitido(): string {
  return `Secretos R2 incompletos (${CLAVES.join(", ")}): se omite la subida.`;
}

/** Parquet de los meses del manifest, en la ruta final. No recorre `.tmp-` ni `.old-`. */
export async function parquetDelManifest(raiz: string): Promise<string[]> {
  const ruta = rutaManifest(raiz);
  if (!existsSync(ruta)) {
    return [];
  }
  const manifest = await leerManifest(ruta);
  const archivos: string[] = [];
  for (const mes of mesesPublicados(manifest)) {
    for (const tabla of TABLAS) {
      const archivo = rutaParquet(raiz, mes, tabla);
      if (!existsSync(archivo)) {
        throw new Error(`${mes.clave}: falta ${archivo}`);
      }
      archivos.push(archivo);
    }
  }
  return archivos;
}

import { centavos, enUmbral, formatoMonto } from "./formato";

export const AVISO = "Esto es un indicador, no una acusación.";

export interface Indicador {
  id: "modalidad" | "compra_directa" | "umbral";
  titulo: string;
  texto: string;
  explicacion: string;
  aviso: string;
}

export interface ProporcionComprador {
  total: number;
  directas: number;
}

export function armarIndicadores(datos: {
  modalidad: string | null;
  proporcion: ProporcionComprador | null;
  montosGtq: readonly string[];
}): Indicador[] {
  return [
    indicadorModalidad(datos.modalidad),
    indicadorCompraDirecta(datos.proporcion),
    indicadorUmbral(datos.montosGtq.filter(enUmbral)),
  ];
}

function indicadorModalidad(modalidad: string | null): Indicador {
  const limpia = modalidad?.trim() ?? "";
  const texto =
    limpia === ""
      ? "Guatecompras no publicó modalidad para este proceso."
      : `La modalidad publicada es «${limpia}».`;
  return {
    id: "modalidad",
    titulo: "Modalidad",
    texto,
    explicacion:
      "Es el procedimiento de compra que Guatecompras registró para este NOG.",
    aviso: AVISO,
  };
}

function indicadorCompraDirecta(
  proporcion: ProporcionComprador | null,
): Indicador {
  if (proporcion === null || proporcion.total <= 0) {
    return {
      id: "compra_directa",
      titulo: "Compra directa del comprador",
      texto:
        "Sin NIT de comprador no se calcula la proporción de compra directa.",
      explicacion:
        "La proporción agrupa los procesos del mismo NIT en los meses cargados.",
      aviso: AVISO,
    };
  }
  const porcentaje = new Intl.NumberFormat("es-GT", {
    maximumFractionDigits: 1,
  }).format((proporcion.directas / proporcion.total) * 100);
  return {
    id: "compra_directa",
    titulo: "Compra directa del comprador",
    texto: `En los meses cargados, ${proporcion.directas} de ${proporcion.total} procesos de este comprador (${porcentaje} %) tienen modalidad de compra directa.`,
    explicacion:
      "Se cuenta un proceso cuando su modalidad contiene el texto «compra directa».",
    aviso: AVISO,
  };
}

function indicadorUmbral(montos: readonly string[]): Indicador {
  const ordenados = [...montos].sort((a, b) => compararCentavos(a, b));
  const textos = ordenados.map((monto) => formatoMonto(monto) ?? monto);
  let texto: string;
  if (textos.length === 0) {
    texto = "Ningún monto adjudicado queda entre Q85,000 y Q90,000.";
  } else if (textos.length === 1) {
    texto = `Monto adjudicado de ${textos[0]}, cercano al umbral de Q90,000 de compra directa.`;
  } else {
    texto = `Montos adjudicados de ${unir(textos)}, cercanos al umbral de Q90,000 de compra directa.`;
  }
  return {
    id: "umbral",
    titulo: "Umbral de compra directa",
    texto,
    explicacion:
      "El rango observado va de Q85,000 a Q90,000, inclusive. Solo se miran montos de adjudicación, en quetzales.",
    aviso: AVISO,
  };
}

function compararCentavos(a: string, b: string): number {
  const izquierda = centavos(a) ?? 0n;
  const derecha = centavos(b) ?? 0n;
  if (izquierda === derecha) {
    return 0;
  }
  return izquierda < derecha ? -1 : 1;
}

function unir(partes: readonly string[]): string {
  if (partes.length <= 1) {
    return partes[0] ?? "";
  }
  if (partes.length === 2) {
    return `${partes[0]} y ${partes[1]}`;
  }
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

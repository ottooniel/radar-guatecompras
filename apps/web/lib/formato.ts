const UMBRAL_MIN_CENTAVOS = 8_500_000n;
const UMBRAL_MAX_CENTAVOS = 9_000_000n;

export function centavos(valor: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (match === null) {
    return null;
  }
  const entero = match[2] ?? "0";
  const fraccion = (match[3] ?? "").padEnd(3, "0");
  const base = BigInt(entero) * 100n + BigInt(fraccion.slice(0, 2));
  const redondeo = (fraccion[2] ?? "0") >= "5" ? 1n : 0n;
  const total = base + redondeo;
  return match[1] === "-" ? -total : total;
}

export function enUmbral(valor: string): boolean {
  const monto = centavos(valor);
  if (monto === null) {
    return false;
  }
  return monto >= UMBRAL_MIN_CENTAVOS && monto <= UMBRAL_MAX_CENTAVOS;
}

export function formatoMonto(valor: string | null): string | null {
  if (valor === null) {
    return null;
  }
  const monto = centavos(valor);
  if (monto === null) {
    return null;
  }
  const negativo = monto < 0n;
  const absoluto = negativo ? -monto : monto;
  const entero = (absoluto / 100n).toString();
  const fraccion = (absoluto % 100n).toString().padStart(2, "0");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negativo ? "-" : ""}Q${conMiles}.${fraccion}`;
}

export function sumarMontos(
  valores: readonly (string | null)[],
): string | null {
  let total = 0n;
  let alguno = false;
  for (const valor of valores) {
    if (valor === null) {
      continue;
    }
    const monto = centavos(valor);
    if (monto === null) {
      continue;
    }
    total += monto;
    alguno = true;
  }
  if (!alguno) {
    return null;
  }
  const negativo = total < 0n;
  const absoluto = negativo ? -total : total;
  const entero = absoluto / 100n;
  const fraccion = (absoluto % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}${entero.toString()}.${fraccion}`;
}

export function formatoCantidad(valor: string | null): string {
  if (valor === null || valor.trim() === "") {
    return "Sin cantidad";
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (match === null) {
    return valor;
  }
  const fraccion = (match[3] ?? "").replace(/0+$/, "").slice(0, 4);
  const entero = (match[2] ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const signo = match[1] ?? "";
  return fraccion === ""
    ? `${signo}${entero}`
    : `${signo}${entero}.${fraccion}`;
}

const FECHA = new Intl.DateTimeFormat("es-GT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Guatemala",
});

export function formatoFecha(iso: string | null): string {
  if (iso === null) {
    return "Sin fecha publicada";
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return "Sin fecha publicada";
  }
  return FECHA.format(fecha);
}

const CATEGORIAS: Record<string, string> = {
  goods: "Bienes",
  services: "Servicios",
  works: "Obras",
};

export function etiquetaCategoria(valor: string): string {
  return CATEGORIAS[valor] ?? valor;
}

/** El enlace público solo lleva el NOG. No se consulta el HTML de Guatecompras. */
export function urlGuatecompras(nog: string): string {
  return `https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog=${encodeURIComponent(nog)}`;
}

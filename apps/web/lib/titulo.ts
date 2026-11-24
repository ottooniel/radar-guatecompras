import { DEPARTAMENTOS, INSTITUCIONES, MUNICIPIOS } from "./lugares";

const MARCAS: { patron: RegExp; token: string; texto: string }[] = [
  {
    patron: /(?<!\p{L})s\.\s*a\.(?!\p{L})/gu,
    token: "\uE000",
    texto: "S. A.",
  },
  { patron: /\bunspsc\b/gu, token: "\uE001", texto: "UNSPSC" },
  { patron: /\blce\b/gu, token: "\uE002", texto: "LCE" },
  { patron: /\bnit\b/gu, token: "\uE003", texto: "NIT" },
  { patron: /\bnog\b/gu, token: "\uE004", texto: "NOG" },
  { patron: /\bong\b/gu, token: "\uE005", texto: "ONG" },
  { patron: /\binde\b/gu, token: "\uE006", texto: "INDE" },
  { patron: /\bpnc\b/gu, token: "\uE007", texto: "PNC" },
  { patron: /\bigss\b/gu, token: "\uE008", texto: "IGSS" },
];

const VOCAL: Record<string, string> = {
  a: "[aá]",
  e: "[eé]",
  i: "[ií]",
  o: "[oó]",
  u: "[uúü]",
};

interface Frase {
  regex: RegExp;
  texto: string;
}

let frasesCache: Frase[] | undefined;

const DEPARTAMENTO_POR_PLANO = new Map(
  DEPARTAMENTOS.map((nombre) => [planoDe(nombre), nombre]),
);

/** Pasa un título en mayúsculas a oración, con lugares e instituciones. */
export function aTitulo(texto: string | null | undefined): string {
  if (texto === null || texto === undefined) {
    return "";
  }
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (limpio === "") {
    return "";
  }
  let actual = limpio.toLocaleLowerCase("es-GT");
  for (const marca of MARCAS) {
    actual = actual.replace(clonar(marca.patron), marca.token);
  }
  actual = capitalizarOraciones(actual);
  for (const marca of MARCAS) {
    actual = actual.replaceAll(marca.token, marca.texto);
  }
  actual = aplicarFrases(actual);
  return restaurarCodigos(limpio, actual);
}

/** No repite el departamento si el nombre del comprador ya lo trae. */
export function conDepartamento(
  comprador: string,
  departamento: string,
): string {
  if (departamento === "No publicado") {
    return comprador;
  }
  const plano = sinTilde(comprador.toLocaleLowerCase("es-GT"));
  const depto = sinTilde(departamento.toLocaleLowerCase("es-GT"));
  if (plano.includes(depto)) {
    return comprador;
  }
  return `${comprador}, ${departamento}`;
}

/** Departamento como «Guatemala» o «Baja Verapaz», no en mayúsculas. */
export function aDepartamento(texto: string | null | undefined): string {
  if (texto === null || texto === undefined || texto.trim() === "") {
    return "No publicado";
  }
  const oficial = DEPARTAMENTO_POR_PLANO.get(planoDe(texto.trim()));
  return oficial ?? aTitulo(texto);
}

function aplicarFrases(texto: string): string {
  let actual = texto;
  for (const frase of frases()) {
    frase.regex.lastIndex = 0;
    actual = actual.replace(frase.regex, frase.texto);
  }
  return actual;
}

function frases(): Frase[] {
  if (frasesCache !== undefined) {
    return frasesCache;
  }
  const vistos = new Set<string>();
  const entradas: { plano: string; texto: string }[] = [];
  for (const texto of [...INSTITUCIONES, ...DEPARTAMENTOS, ...MUNICIPIOS]) {
    const plano = planoDe(texto);
    if (vistos.has(plano)) {
      continue;
    }
    vistos.add(plano);
    entradas.push({ plano, texto });
  }
  entradas.sort((a, b) => b.plano.length - a.plano.length);
  frasesCache = entradas.map((entrada) => ({
    regex: regexFrase(entrada.plano),
    texto: entrada.texto,
  }));
  return frasesCache;
}

function regexFrase(plano: string): RegExp {
  let cuerpo = "";
  for (const char of plano) {
    cuerpo += VOCAL[char] ?? escapar(char);
  }
  return new RegExp(`(?<!\\p{L})${cuerpo}(?!\\p{L})`, "giu");
}

function restaurarCodigos(original: string, convertido: string): string {
  const codigos = original.match(/\p{L}*\p{N}[\p{L}\p{N}]*/gu) ?? [];
  let actual = convertido;
  const usados = new Set<string>();
  for (const codigo of codigos) {
    const bajo = codigo.toLocaleLowerCase("es-GT");
    if (bajo === codigo || usados.has(bajo) || esOrdinal(codigo)) {
      continue;
    }
    usados.add(bajo);
    actual = actual.replace(
      new RegExp(`(?<!\\p{L})${escapar(bajo)}(?!\\p{L})`, "gu"),
      codigo,
    );
  }
  return actual;
}

function esOrdinal(codigo: string): boolean {
  return /^\d+(er|do|to|ro|ra|da|ta|os|as)$/i.test(codigo);
}

function planoDe(texto: string): string {
  return sinTilde(texto.toLocaleLowerCase("es-GT"));
}

function sinTilde(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "");
}

function clonar(base: RegExp): RegExp {
  return new RegExp(base.source, base.flags);
}

function escapar(texto: string): string {
  return texto.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function capitalizarOraciones(texto: string): string {
  let inicio = true;
  let salida = "";
  for (const char of texto) {
    if (inicio && letra(char)) {
      salida += char.toLocaleUpperCase("es-GT");
      inicio = false;
      continue;
    }
    salida += char;
    if (char === "." || char === "!" || char === "?") {
      inicio = true;
      continue;
    }
    if (inicio && !espacioOApertura(char)) {
      inicio = false;
    }
  }
  return salida;
}

function letra(char: string): boolean {
  return /\p{L}/u.test(char);
}

function espacioOApertura(char: string): boolean {
  return /[\s¿¡«»"'“”]/u.test(char);
}

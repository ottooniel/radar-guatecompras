const MARCAS: { patron: RegExp; token: string; texto: string }[] = [
  { patron: /s\.\s*a\./g, token: "\uE000", texto: "S. A." },
  { patron: /\bunspsc\b/g, token: "\uE001", texto: "UNSPSC" },
  { patron: /\blce\b/g, token: "\uE002", texto: "LCE" },
  { patron: /\bnit\b/g, token: "\uE003", texto: "NIT" },
  { patron: /\bnog\b/g, token: "\uE004", texto: "NOG" },
  { patron: /\bong\b/g, token: "\uE005", texto: "ONG" },
];

/** Pasa un título en mayúsculas a minúsculas, con mayúscula al inicio de cada oración. */
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
    actual = actual.replace(patron(marca.patron), marca.token);
  }
  actual = capitalizarOraciones(actual);
  for (const marca of MARCAS) {
    actual = actual.replaceAll(marca.token, marca.texto);
  }
  return actual;
}

function patron(base: RegExp): RegExp {
  return new RegExp(base.source, "g");
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

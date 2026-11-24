export interface RangoCli {
  desde: string;
  hasta: string;
}

const USO = "Uso: pnpm etl --desde YYYY-MM --hasta YYYY-MM";

export function leerArgumentos(argv: readonly string[]): RangoCli {
  let desde: string | undefined;
  let hasta: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const argumento = argv[i];
    if (argumento !== "--desde" && argumento !== "--hasta") {
      throw new Error(
        argumento === undefined
          ? USO
          : `Argumento no reconocido: ${argumento}. ${USO}`,
      );
    }
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith("--")) {
      throw new Error(`Falta el valor de ${argumento}. ${USO}`);
    }
    if (argumento === "--desde") {
      if (desde !== undefined) {
        throw new Error(`Argumento repetido: --desde. ${USO}`);
      }
      desde = valor;
    } else {
      if (hasta !== undefined) {
        throw new Error(`Argumento repetido: --hasta. ${USO}`);
      }
      hasta = valor;
    }
    i += 1;
  }

  if (desde === undefined || hasta === undefined) {
    throw new Error(USO);
  }
  return { desde, hasta };
}

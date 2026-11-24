const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Mes calendario usado en argumentos, rutas y la clave del manifest. */
export interface Mes {
  anio: number;
  /** 1 a 12, sin cero a la izquierda. Así lo pide la URL de Guatecompras. */
  mes: number;
  /** `YYYY-MM`. */
  clave: string;
}

export function parsearMes(texto: string): Mes {
  const coincidencia = MES.exec(texto);
  const anio = coincidencia?.[1];
  const mes = coincidencia?.[2];
  if (!coincidencia || anio === undefined || mes === undefined) {
    throw new Error(`Mes inválido: ${texto}. Use YYYY-MM.`);
  }
  return { anio: Number(anio), mes: Number(mes), clave: texto };
}

/** Meses inclusivos de `desde` a `hasta`. */
export function mesesDelRango(desde: string, hasta: string): Mes[] {
  const inicio = parsearMes(desde);
  const fin = parsearMes(hasta);
  if (indice(inicio) > indice(fin)) {
    throw new Error(`--desde ${desde} es posterior a --hasta ${hasta}`);
  }

  const meses: Mes[] = [];
  let anio = inicio.anio;
  let mes = inicio.mes;
  while (anio * 12 + mes <= indice(fin)) {
    meses.push({
      anio,
      mes,
      clave: `${anio}-${String(mes).padStart(2, "0")}`,
    });
    mes += 1;
    if (mes === 13) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

function indice(mes: Mes): number {
  return mes.anio * 12 + mes.mes;
}

/** `cantidad` meses de calendario terminando en el mes UTC de `hoy`, inclusive. */
export function ultimosMeses(
  cantidad: number,
  hoy: Date,
): { desde: string; hasta: string } {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new Error("La cantidad de meses debe ser un entero positivo");
  }
  const hasta = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const desde = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (cantidad - 1), 1),
  );
  return {
    desde: formatearMesUtc(desde),
    hasta: formatearMesUtc(hasta),
  };
}

function formatearMesUtc(fecha: Date): string {
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${mes}`;
}

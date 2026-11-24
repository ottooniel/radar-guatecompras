import { z } from "zod";

export const TAMANO_PAGINA = 20;
export const LIMITE_API_MAX = 50;

const CLAVES = [
  "q",
  "departamento",
  "estado",
  "modalidad",
  "categoria",
  "desde",
  "hasta",
  "adjudicacion",
  "pagina",
  "limit",
] as const;

export interface BusquedaValida {
  q: string | null;
  departamento: string | null;
  estado: string | null;
  modalidad: string | null;
  categoria: string | null;
  desde: string | null;
  hasta: string | null;
  soloAdjudicacion: boolean;
  pagina: number;
  limit: number;
}

export interface FiltrosFormulario {
  q: string;
  departamento: string;
  estado: string;
  modalidad: string;
  categoria: string;
  desde: string;
  hasta: string;
  soloAdjudicacion: boolean;
}

export type ResultadoParametros =
  { ok: true; busqueda: BusquedaValida } | { ok: false; error: string };

const esquema = z
  .object({
    q: z.string().max(200).optional(),
    departamento: z.string().max(120).optional(),
    estado: z.string().max(160).optional(),
    modalidad: z.string().max(200).optional(),
    categoria: z.string().max(80).optional(),
    desde: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(fechaValida)
      .optional(),
    hasta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(fechaValida)
      .optional(),
    adjudicacion: z.literal("1").optional(),
    pagina: z.coerce.number().int().min(1).max(1000),
    limit: z.coerce.number().int().min(1).max(LIMITE_API_MAX).optional(),
  })
  .superRefine((valor, ctx) => {
    if (
      valor.desde !== undefined &&
      valor.hasta !== undefined &&
      valor.desde > valor.hasta
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["desde"],
        message: "La fecha desde no puede ser posterior a hasta",
      });
    }
  });

export function leerBusqueda(
  search: URLSearchParams,
  modo: "pagina" | "api",
): ResultadoParametros {
  const tomados = tomarParametros(search);
  if (!tomados.ok) {
    return tomados;
  }
  const valores = { ...tomados.valores };
  if (modo === "pagina") {
    delete valores.limit;
  }
  if (valores.pagina === undefined) {
    valores.pagina = "1";
  }
  const parsed = esquema.safeParse(valores);
  if (!parsed.success) {
    return { ok: false, error: mensajesZod(parsed.error) };
  }
  const datos = parsed.data;
  return {
    ok: true,
    busqueda: {
      q: datos.q ?? null,
      departamento: datos.departamento ?? null,
      estado: datos.estado ?? null,
      modalidad: datos.modalidad ?? null,
      categoria: datos.categoria ?? null,
      desde: datos.desde ?? null,
      hasta: datos.hasta ?? null,
      soloAdjudicacion: datos.adjudicacion === "1",
      pagina: datos.pagina,
      limit: limiteDe(modo, datos.limit),
    },
  };
}

export function leerNog(
  nog: string,
): { ok: true; nog: string } | { ok: false; error: string } {
  if (!/^[1-9]\d{0,17}$/.test(nog)) {
    return { ok: false, error: "El NOG debe ser un entero positivo" };
  }
  return { ok: true, nog };
}

export function formularioDesde(search: URLSearchParams): FiltrosFormulario {
  return {
    q: search.get("q")?.trim() ?? "",
    departamento: search.get("departamento")?.trim() ?? "",
    estado: search.get("estado")?.trim() ?? "",
    modalidad: search.get("modalidad")?.trim() ?? "",
    categoria: search.get("categoria")?.trim() ?? "",
    desde: search.get("desde")?.trim() ?? "",
    hasta: search.get("hasta")?.trim() ?? "",
    soloAdjudicacion: search.get("adjudicacion") === "1",
  };
}

export function formularioDe(busqueda: BusquedaValida): FiltrosFormulario {
  return {
    q: busqueda.q ?? "",
    departamento: busqueda.departamento ?? "",
    estado: busqueda.estado ?? "",
    modalidad: busqueda.modalidad ?? "",
    categoria: busqueda.categoria ?? "",
    desde: busqueda.desde ?? "",
    hasta: busqueda.hasta ?? "",
    soloAdjudicacion: busqueda.soloAdjudicacion,
  };
}

function limiteDe(modo: "pagina" | "api", valor: number | undefined): number {
  switch (modo) {
    case "pagina":
      return TAMANO_PAGINA;
    case "api":
      return valor ?? TAMANO_PAGINA;
    default: {
      const agotado: never = modo;
      throw new Error(`Modo no contemplado: ${String(agotado)}`);
    }
  }
}

function tomarParametros(
  search: URLSearchParams,
):
  { ok: true; valores: Record<string, string> } | { ok: false; error: string } {
  const valores: Record<string, string> = {};
  for (const clave of CLAVES) {
    const todos = search.getAll(clave);
    if (todos.length > 1) {
      return { ok: false, error: `El parámetro ${clave} va una sola vez` };
    }
    const unico = todos[0];
    if (unico === undefined) {
      continue;
    }
    const limpio = unico.trim();
    if (limpio === "") {
      continue;
    }
    valores[clave] = limpio;
  }
  return { ok: true, valores };
}

function mensajesZod(error: z.ZodError): string {
  const mensajes = error.issues.map((issue) => {
    const campo = issue.path[0];
    if (issue.code === "custom" && issue.message.startsWith("La fecha desde")) {
      return issue.message;
    }
    switch (campo) {
      case "limit":
        return "limit debe ser un entero entre 1 y 50";
      case "pagina":
        return "pagina debe ser un entero entre 1 y 1000";
      case "q":
        return "q admite hasta 200 caracteres";
      case "departamento":
        return "departamento admite hasta 120 caracteres";
      case "estado":
        return "estado admite hasta 160 caracteres";
      case "modalidad":
        return "modalidad admite hasta 200 caracteres";
      case "categoria":
        return "categoria admite hasta 80 caracteres";
      case "desde":
      case "hasta":
        return `${String(campo)} debe ser una fecha real en formato AAAA-MM-DD`;
      case "adjudicacion":
        return "adjudicacion debe ser 1";
      default:
        return "Revisa los parámetros de búsqueda";
    }
  });
  return [...new Set(mensajes)].join(". ");
}

function fechaValida(valor: string): boolean {
  const partes = valor.split("-");
  if (partes.length !== 3) {
    return false;
  }
  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (
    !Number.isInteger(anio) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(dia)
  ) {
    return false;
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

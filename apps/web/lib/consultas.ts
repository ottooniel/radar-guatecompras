import type { Pool, QueryResultRow } from "pg";
import { armarIndicadores, type ProporcionComprador } from "./indicadores";
import type { BusquedaValida } from "./parametros";

export interface ResultadoBusqueda {
  nog: string;
  titulo: string | null;
  comprador: string | null;
  departamento: string | null;
  estado: string | null;
  modalidad: string | null;
  categoria: string | null;
  fechaPublicacion: string | null;
  montoAdjudicadoGtq: string | null;
}

export interface PaginaResultados {
  resultados: ResultadoBusqueda[];
  total: number;
}

export interface OpcionesFiltro {
  departamentos: string[];
  estados: string[];
  modalidades: string[];
  categorias: string[];
}

export interface ItemFicha {
  id: string | null;
  descripcion: string | null;
  unspsc: string | null;
  cantidad: string | null;
  unidad: string | null;
}

export interface AdjudicacionFicha {
  id: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  montoGtq: string | null;
  fecha: string | null;
  estado: string | null;
}

export interface Ficha {
  nog: string;
  ocid: string;
  titulo: string | null;
  estado: string | null;
  modalidad: string | null;
  categoria: string | null;
  fechaPublicacion: string | null;
  fechaCierre: string | null;
  comprador: {
    nit: string | null;
    nombre: string | null;
    unidadGcuc: string | null;
    unidadNombre: string | null;
    departamento: string | null;
  };
  oferentes: number | null;
  mesFuente: string;
  items: ItemFicha[];
  adjudicaciones: AdjudicacionFicha[];
  indicadores: ReturnType<typeof armarIndicadores>;
}

/**
 * Con texto, la categoría no excluye filas. El UNSPSC (y a veces `category`)
 * viene mal clasificado: pesa más `ts_rank` y la categoría solo desempata.
 * Sin texto, la categoría sí filtra.
 */
const DESDE_CONSULTA = `
WITH consulta AS (
  SELECT CASE
    WHEN $1::text IS NULL THEN NULL::tsquery
    ELSE websearch_to_tsquery('spanish', unaccent($1))
  END AS ts
)
`;

const FILTROS = `
FROM tenders AS t
CROSS JOIN consulta AS c
WHERE (
  $1::text IS NULL
  OR t.search @@ c.ts
)
AND ($2::text IS NULL OR t.department = $2)
AND ($3::text IS NULL OR t.status_detail = $3)
AND ($4::text IS NULL OR t.method_detail = $4)
AND (
  $5::text IS NULL
  OR $1::text IS NOT NULL
  OR t.category = $5
)
AND (
  $6::date IS NULL
  OR (t.date_published AT TIME ZONE 'America/Guatemala')::date >= $6::date
)
AND (
  $7::date IS NULL
  OR (t.date_published AT TIME ZONE 'America/Guatemala')::date <= $7::date
)
AND (
  $8::boolean IS NOT TRUE
  OR EXISTS (SELECT 1 FROM awards AS aw WHERE aw.nog = t.nog)
)
`;

export const SQL_LISTADO = `
${DESDE_CONSULTA}
SELECT
  t.nog::text AS nog,
  t.title,
  t.buyer_name,
  t.department,
  t.status_detail,
  t.method_detail,
  t.category,
  t.date_published,
  (
    SELECT ROUND(SUM(a.amount_gtq), 2)::text
    FROM awards AS a
    WHERE a.nog = t.nog
  ) AS monto
${FILTROS}
ORDER BY
  CASE
    WHEN c.ts IS NULL THEN 0
    ELSE ts_rank(t.search, c.ts)
  END DESC,
  CASE
    WHEN $5::text IS NULL OR t.category = $5 THEN 0
    ELSE 1
  END ASC,
  t.date_published DESC NULLS LAST,
  t.nog DESC
LIMIT $9::int
OFFSET $10::int
`;

const SQL_CONTEO = `
${DESDE_CONSULTA}
SELECT count(*)::int AS total
${FILTROS}
`;

const SQL_FICHA = `
SELECT
  t.nog::text AS nog,
  t.ocid,
  t.title,
  t.status_detail,
  t.method_detail,
  t.category,
  t.date_published,
  t.tender_end,
  t.buyer_nit,
  t.buyer_name,
  t.unit_gcuc,
  t.unit_name,
  t.department,
  t.n_tenderers,
  t.source_month,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'item_id', i.item_id,
        'description', i.description,
        'unspsc', i.unspsc,
        'quantity', i.quantity::text,
        'unit_name', i.unit_name
      )
      ORDER BY i.id
    )
    FROM items AS i
    WHERE i.nog = t.nog
  ), '[]'::json) AS items,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'award_id', a.award_id,
        'supplier_id', a.supplier_id,
        'supplier_name', a.supplier_name,
        'amount_gtq', a.amount_gtq::text,
        'award_date', a.award_date,
        'status_detail', a.status_detail
      )
      ORDER BY a.award_date NULLS LAST, a.id
    )
    FROM awards AS a
    WHERE a.nog = t.nog
  ), '[]'::json) AS awards,
  CASE
    WHEN t.buyer_nit IS NULL THEN NULL
    ELSE (
      SELECT json_build_object(
        'total', count(*)::int,
        'directas', count(*) FILTER (
          WHERE b.method_detail ILIKE '%compra directa%'
        )::int
      )
      FROM tenders AS b
      WHERE b.buyer_nit = t.buyer_nit
    )
  END AS proporcion
FROM tenders AS t
WHERE t.nog = $1::bigint
`;

export async function buscarProcesos(
  db: Pool,
  busqueda: BusquedaValida,
): Promise<PaginaResultados> {
  const filtro = parametrosFiltro(busqueda);
  const offset = (busqueda.pagina - 1) * busqueda.limit;
  const [lista, conteo] = await Promise.all([
    db.query<FilaBusqueda>(SQL_LISTADO, [...filtro, busqueda.limit, offset]),
    db.query<{ total: number }>(SQL_CONTEO, filtro),
  ]);
  const total = conteo.rows[0]?.total;
  if (total === undefined) {
    throw new Error("No se pudo contar la búsqueda");
  }
  return {
    total,
    resultados: lista.rows.map(mapearResultado),
  };
}

export async function listarOpciones(db: Pool): Promise<OpcionesFiltro> {
  const [departamentos, estados, modalidades, categorias] = await Promise.all([
    distintos(db, "department"),
    distintos(db, "status_detail"),
    distintos(db, "method_detail"),
    distintos(db, "category"),
  ]);
  return { departamentos, estados, modalidades, categorias };
}

export async function obtenerFicha(
  db: Pool,
  nog: string,
): Promise<Ficha | null> {
  const resultado = await db.query<FilaFicha>(SQL_FICHA, [nog]);
  const fila = resultado.rows[0];
  if (fila === undefined) {
    return null;
  }
  const adjudicaciones = leerAdjudicaciones(fila.awards);
  const proporcion = leerProporcion(fila.proporcion);
  return {
    nog: fila.nog,
    ocid: fila.ocid,
    titulo: fila.title,
    estado: fila.status_detail,
    modalidad: fila.method_detail,
    categoria: fila.category,
    fechaPublicacion: instante(fila.date_published),
    fechaCierre: instante(fila.tender_end),
    comprador: {
      nit: fila.buyer_nit,
      nombre: fila.buyer_name,
      unidadGcuc: fila.unit_gcuc,
      unidadNombre: fila.unit_name,
      departamento: fila.department,
    },
    oferentes: fila.n_tenderers,
    mesFuente: fila.source_month,
    items: leerItems(fila.items),
    adjudicaciones,
    indicadores: armarIndicadores({
      modalidad: fila.method_detail,
      proporcion,
      montosGtq: adjudicaciones.flatMap((adjudicacion) =>
        adjudicacion.montoGtq === null ? [] : [adjudicacion.montoGtq],
      ),
    }),
  };
}

export async function leerActualizacion(db: Pool): Promise<string | null> {
  const resultado = await db.query<{ finished_at: Date | string | null }>(`
    SELECT finished_at
    FROM etl_runs
    WHERE status = 'ok' AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `);
  return instante(resultado.rows[0]?.finished_at ?? null);
}

export function resultadoAJson(resultado: ResultadoBusqueda) {
  return {
    nog: resultado.nog,
    titulo: resultado.titulo,
    comprador: resultado.comprador,
    departamento: resultado.departamento,
    estado: resultado.estado,
    modalidad: resultado.modalidad,
    categoria: resultado.categoria,
    fecha_publicacion: resultado.fechaPublicacion,
    monto_adjudicado_gtq: resultado.montoAdjudicadoGtq,
  };
}

export function busquedaAJson(
  pagina: PaginaResultados,
  busqueda: BusquedaValida,
) {
  return {
    filtros: {
      q: busqueda.q,
      departamento: busqueda.departamento,
      estado: busqueda.estado,
      modalidad: busqueda.modalidad,
      categoria: busqueda.categoria,
      desde: busqueda.desde,
      hasta: busqueda.hasta,
      solo_adjudicacion: busqueda.soloAdjudicacion,
    },
    total: pagina.total,
    pagina: busqueda.pagina,
    limit: busqueda.limit,
    resultados: pagina.resultados.map(resultadoAJson),
  };
}

export function fichaAJson(ficha: Ficha) {
  return {
    nog: ficha.nog,
    ocid: ficha.ocid,
    titulo: ficha.titulo,
    estado: ficha.estado,
    modalidad: ficha.modalidad,
    categoria: ficha.categoria,
    fecha_publicacion: ficha.fechaPublicacion,
    fecha_cierre: ficha.fechaCierre,
    fecha_cierre_publicada: ficha.fechaCierre !== null,
    comprador: {
      nit: ficha.comprador.nit,
      nombre: ficha.comprador.nombre,
      unidad_gcuc: ficha.comprador.unidadGcuc,
      unidad_nombre: ficha.comprador.unidadNombre,
      departamento: ficha.comprador.departamento,
    },
    oferentes: ficha.oferentes,
    mes_fuente: ficha.mesFuente,
    items: ficha.items.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      unspsc: item.unspsc,
      cantidad: item.cantidad,
      unidad: item.unidad,
    })),
    adjudicaciones: ficha.adjudicaciones.map((adjudicacion) => ({
      id: adjudicacion.id,
      proveedor_id: adjudicacion.proveedorId,
      proveedor: adjudicacion.proveedor,
      monto_gtq: adjudicacion.montoGtq,
      fecha: adjudicacion.fecha,
      estado: adjudicacion.estado,
    })),
    indicadores: ficha.indicadores,
  };
}

function parametrosFiltro(busqueda: BusquedaValida): unknown[] {
  return [
    busqueda.q,
    busqueda.departamento,
    busqueda.estado,
    busqueda.modalidad,
    busqueda.categoria,
    busqueda.desde,
    busqueda.hasta,
    busqueda.soloAdjudicacion,
  ];
}

async function distintos(db: Pool, columna: ColumnaFiltro): Promise<string[]> {
  const resultado = await db.query<{ valor: string }>(sqlDistintos(columna));
  return resultado.rows.map((fila) => fila.valor);
}

function sqlDistintos(columna: ColumnaFiltro): string {
  switch (columna) {
    case "department":
      return `SELECT DISTINCT department AS valor
        FROM tenders
        WHERE department IS NOT NULL AND btrim(department) <> ''
        ORDER BY 1`;
    case "status_detail":
      return `SELECT DISTINCT status_detail AS valor
        FROM tenders
        WHERE status_detail IS NOT NULL AND btrim(status_detail) <> ''
        ORDER BY 1`;
    case "method_detail":
      return `SELECT DISTINCT method_detail AS valor
        FROM tenders
        WHERE method_detail IS NOT NULL AND btrim(method_detail) <> ''
        ORDER BY 1`;
    case "category":
      return `SELECT DISTINCT category AS valor
        FROM tenders
        WHERE category IS NOT NULL AND btrim(category) <> ''
        ORDER BY 1`;
    default: {
      const agotado: never = columna;
      throw new Error(`Columna no contemplada: ${String(agotado)}`);
    }
  }
}

type ColumnaFiltro =
  "department" | "status_detail" | "method_detail" | "category";

function mapearResultado(fila: FilaBusqueda): ResultadoBusqueda {
  return {
    nog: fila.nog,
    titulo: fila.title,
    comprador: fila.buyer_name,
    departamento: fila.department,
    estado: fila.status_detail,
    modalidad: fila.method_detail,
    categoria: fila.category,
    fechaPublicacion: instante(fila.date_published),
    montoAdjudicadoGtq: fila.monto,
  };
}

function leerItems(valor: unknown): ItemFicha[] {
  return lista(valor).map((item) => ({
    id: texto(item.item_id),
    descripcion: texto(item.description),
    unspsc: texto(item.unspsc),
    cantidad: texto(item.quantity),
    unidad: texto(item.unit_name),
  }));
}

function leerAdjudicaciones(valor: unknown): AdjudicacionFicha[] {
  return lista(valor).map((item) => ({
    id: texto(item.award_id),
    proveedorId: texto(item.supplier_id),
    proveedor: texto(item.supplier_name),
    montoGtq: texto(item.amount_gtq),
    fecha: instante(item.award_date as Date | string | null | undefined),
    estado: texto(item.status_detail),
  }));
}

function leerProporcion(valor: unknown): ProporcionComprador | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (typeof valor !== "object") {
    throw new Error("Proporción inválida");
  }
  const fila = valor as Record<string, unknown>;
  if (typeof fila.total !== "number" || typeof fila.directas !== "number") {
    throw new Error("Proporción inválida");
  }
  return { total: fila.total, directas: fila.directas };
}

function lista(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) {
    throw new Error("La ficha no devolvió una lista");
  }
  return valor.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Elemento de ficha inválido");
    }
    return item as Record<string, unknown>;
  });
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (typeof valor === "string") {
    return valor;
  }
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  throw new Error("Valor de ficha no esperado");
}

function instante(valor: Date | string | null | undefined): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  if (typeof valor === "string") {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) {
      return null;
    }
    return fecha.toISOString();
  }
  return null;
}

interface FilaBusqueda extends QueryResultRow {
  nog: string;
  title: string | null;
  buyer_name: string | null;
  department: string | null;
  status_detail: string | null;
  method_detail: string | null;
  category: string | null;
  date_published: Date | string | null;
  monto: string | null;
}

interface FilaFicha extends QueryResultRow {
  nog: string;
  ocid: string;
  title: string | null;
  status_detail: string | null;
  method_detail: string | null;
  category: string | null;
  date_published: Date | string | null;
  tender_end: Date | string | null;
  buyer_nit: string | null;
  buyer_name: string | null;
  unit_gcuc: string | null;
  unit_name: string | null;
  department: string | null;
  n_tenderers: number | null;
  source_month: string;
  items: unknown;
  awards: unknown;
  proporcion: unknown;
}

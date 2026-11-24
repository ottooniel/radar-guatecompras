import Link from "next/link";
import type { OpcionesFiltro, ResultadoBusqueda } from "@/lib/consultas";
import {
  enUmbral,
  etiquetaCategoria,
  formatoDia,
  formatoMonto,
  urlGuatecompras,
} from "@/lib/formato";
import type { FiltrosFormulario } from "@/lib/parametros";
import { aDepartamento, aTitulo, conDepartamento } from "@/lib/titulo";
import { PuntoEstado } from "./Estado";
import { CerrarConEscape, EnviarEnEscritorio } from "./HojaFiltros";

export interface PaginaBusquedaProps {
  filtros: FiltrosFormulario;
  opciones: OpcionesFiltro;
  resultados: ResultadoBusqueda[];
  total: number;
  pagina: number;
  tamano: number;
  error: string | null;
  aviso: string | null;
  actualizacion: string | null;
}

const EJEMPLOS = [
  ["escritorios", "escritorios"],
  ["insumos de limpieza", "insumos de limpieza"],
  ["mantenimiento de vehículos", "mantenimiento de vehículos"],
] as const;

export function PaginaBusqueda({
  filtros,
  opciones,
  resultados,
  total,
  pagina,
  tamano,
  error,
  aviso,
  actualizacion,
}: PaginaBusquedaProps) {
  const paginas = total === 0 ? 1 : Math.ceil(total / tamano);
  const fuera = total > 0 && pagina > paginas;
  const activos = filtrosActivos(filtros);
  const fecha = actualizacion === null ? null : formatoDia(actualizacion);
  return (
    <>
      <form
        key={JSON.stringify(filtros)}
        className="portada"
        method="get"
        action="/"
        role="search"
      >
        <section className="hero contenedor">
          <Circuito />
          <h1>Encuentra compras públicas que puedes ofertar</h1>
          <p className="subtitulo">
            Busca por producto o servicio. Cada resultado cita su NOG de
            Guatecompras.
          </p>
          <div className="buscador">
            <label className="solo-lector" htmlFor="q">
              Qué buscas
            </label>
            <input
              id="q"
              name="q"
              type="search"
              maxLength={200}
              defaultValue={filtros.q}
              placeholder="Producto o servicio"
              autoComplete="off"
            />
            <button type="submit">Buscar</button>
          </div>
          <p className="prueba">
            Prueba con <Link href="/?q=escritorios">{EJEMPLOS[0][1]}</Link>,{" "}
            <Link href="/?q=insumos%20de%20limpieza">{EJEMPLOS[1][1]}</Link> y{" "}
            <Link href="/?q=mantenimiento%20de%20veh%C3%ADculos">
              {EJEMPLOS[2][1]}
            </Link>
            .
          </p>
        </section>
        <div className="franja">
          <div className="contenedor controles">
            <input
              id="abrir-filtros"
              className="abrir-filtros"
              type="checkbox"
            />
            <label className="boton-filtros" htmlFor="abrir-filtros">
              Filtros{activos.length > 0 ? ` ${activos.length}` : ""}
            </label>
            <label className="cortina" htmlFor="abrir-filtros" />
            <div className="hoja">
              <CerrarConEscape />
              <div className="hoja-cabeza">
                <p>Filtros</p>
                <label className="cerrar-hoja" htmlFor="abrir-filtros">
                  Cerrar
                </label>
                <Link href={limpiarFiltros(filtros)}>Limpiar</Link>
              </div>
              <EnviarEnEscritorio>
                <div className="filtros">
                  <Selector
                    id="departamento"
                    nombre="departamento"
                    etiqueta="Departamento"
                    actual={filtros.departamento}
                    opciones={opciones.departamentos}
                    etiquetaOpcion={aDepartamento}
                  />
                  <Selector
                    id="estado"
                    nombre="estado"
                    etiqueta="Estado"
                    actual={filtros.estado}
                    opciones={opciones.estados}
                  />
                  <Selector
                    id="modalidad"
                    nombre="modalidad"
                    etiqueta="Modalidad"
                    actual={filtros.modalidad}
                    opciones={opciones.modalidades}
                  />
                  <div
                    className={
                      filtros.desde === ""
                        ? "fecha-grupo"
                        : "fecha-grupo filtro-activo"
                    }
                  >
                    <span>Desde</span>
                    <input
                      id="desde"
                      name="desde"
                      type="date"
                      aria-label="Publicado desde"
                      defaultValue={filtros.desde}
                    />
                  </div>
                  <div
                    className={
                      filtros.hasta === ""
                        ? "fecha-grupo"
                        : "fecha-grupo filtro-activo"
                    }
                  >
                    <span>Hasta</span>
                    <input
                      id="hasta"
                      name="hasta"
                      type="date"
                      aria-label="Publicado hasta"
                      defaultValue={filtros.hasta}
                    />
                  </div>
                  <Selector
                    id="categoria"
                    nombre="categoria"
                    etiqueta="Categoría"
                    actual={filtros.categoria}
                    opciones={opciones.categorias}
                    etiquetaOpcion={etiquetaCategoria}
                  />
                  <label className="interruptor" htmlFor="adjudicacion">
                    <input
                      id="adjudicacion"
                      name="adjudicacion"
                      type="checkbox"
                      value="1"
                      defaultChecked={filtros.soloAdjudicacion}
                    />
                    Solo con adjudicación
                  </label>
                  <button className="aplicar" type="submit">
                    Aplicar
                  </button>
                </div>
              </EnviarEnEscritorio>
              <button className="ver-procesos" type="submit">
                Ver {total.toLocaleString("es-GT")}{" "}
                {total === 1 ? "proceso" : "procesos"}
              </button>
            </div>
          </div>
        </div>
      </form>
      <section className="contenedor resultados" aria-label="Resultados">
        {error !== null && (
          <p className="alerta" role="alert">
            {error}
          </p>
        )}
        {aviso !== null && (
          <p className="aviso" role="status">
            {aviso}
          </p>
        )}
        {fuera && (
          <div className="vacio">
            <p>Esta página no existe. La última es la {paginas}.</p>
            <p>
              <Link href={enlace(filtros, paginas)}>
                Ir a la página {paginas}
              </Link>
            </p>
          </div>
        )}
        {!fuera && aviso === null && total === 0 && error === null && (
          <div className="vacio">
            <p>No hay procesos con esos filtros.</p>
            <div className="acciones-vacias">
              {activos.map((filtro) => (
                <Link key={filtro.etiqueta} href={filtro.href}>
                  {filtro.etiqueta}
                </Link>
              ))}
              <Link href={limpiarFiltros(filtros)}>Limpiar filtros</Link>
            </div>
          </div>
        )}
        {!fuera && total > 0 && (
          <>
            <div className="resumen">
              <strong>
                {total.toLocaleString("es-GT")}{" "}
                {total === 1 ? "proceso" : "procesos"}
              </strong>
              <p className="orden">
                {filtros.q === ""
                  ? "Mostrando lo más reciente. Escribe arriba para buscar."
                  : fecha === null
                    ? "Ordenados por relevancia. Fecha de actualización no disponible."
                    : `Ordenados por relevancia. Datos al ${fecha}.`}
              </p>
            </div>
            <ol className="lista">
              {resultados.map((resultado) => (
                <Fila key={resultado.nog} resultado={resultado} />
              ))}
            </ol>
            {paginas > 1 && (
              <nav className="paginacion" aria-label="Paginación">
                {pagina > 1 ? (
                  <Link href={enlace(filtros, pagina - 1)}>Anterior</Link>
                ) : (
                  <span>Anterior</span>
                )}
                {numeros(pagina, paginas).map((numero) =>
                  numero === pagina ? (
                    <span key={numero} aria-current="page">
                      {numero}
                    </span>
                  ) : (
                    <Link key={numero} href={enlace(filtros, numero)}>
                      {numero}
                    </Link>
                  ),
                )}
                {pagina < paginas ? (
                  <Link href={enlace(filtros, pagina + 1)}>Siguiente</Link>
                ) : (
                  <span>Siguiente</span>
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Fila({ resultado }: { resultado: ResultadoBusqueda }) {
  const titulo = mostrado(aTitulo(resultado.titulo));
  const monto = formatoMonto(resultado.montoAdjudicadoGtq);
  const cerca =
    resultado.montoAdjudicadoGtq !== null &&
    enUmbral(resultado.montoAdjudicadoGtq);
  return (
    <li className="fila">
      <div>
        <h2>
          <Link href={`/proceso/${resultado.nog}`}>{titulo}</Link>
        </h2>
        <p className="secundaria">
          {conDepartamento(
            mostrado(aTitulo(resultado.comprador)),
            aDepartamento(resultado.departamento),
          )}
        </p>
        <div className="meta-fila">
          <p>
            <PuntoEstado estado={resultado.estado} />
          </p>
          <p>{mostrado(resultado.modalidad)}</p>
          <p>
            {resultado.fechaPublicacion === null
              ? "No publicado"
              : `Publicado el ${formatoDia(resultado.fechaPublicacion)}`}
          </p>
          <p className="nog">
            <a href={urlGuatecompras(resultado.nog)} rel="noreferrer">
              NOG {resultado.nog}
            </a>
          </p>
        </div>
      </div>
      <p className="monto">
        {monto === null ? (
          <span className="sin-monto">Aún sin adjudicar</span>
        ) : (
          <>
            {monto}
            <small>adjudicado</small>
            {cerca && <span className="insignia">Cerca de Q90,000</span>}
          </>
        )}
      </p>
    </li>
  );
}

function Selector({
  id,
  nombre,
  etiqueta,
  actual,
  opciones,
  etiquetaOpcion = (valor) => valor,
}: {
  id: string;
  nombre: string;
  etiqueta: string;
  actual: string;
  opciones: string[];
  etiquetaOpcion?: (valor: string) => string;
}) {
  return (
    <label
      className={actual === "" ? "filtro" : "filtro filtro-activo"}
      htmlFor={id}
    >
      <select id={id} name={nombre} defaultValue={actual} aria-label={etiqueta}>
        <option value="">{etiqueta}</option>
        {opcionesCon(opciones, actual).map((valor) => (
          <option key={valor} value={valor}>
            {etiquetaOpcion(valor)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Circuito() {
  return (
    <svg
      className="circuito"
      viewBox="0 0 280 160"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 28H90V78H150V28H250"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M40 140H120V96H200V140H270"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M150 78V120" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="90" cy="78" r="3" fill="currentColor" />
      <circle cx="150" cy="28" r="3" fill="currentColor" />
      <circle cx="120" cy="96" r="3" fill="currentColor" />
      <circle cx="200" cy="140" r="3" fill="currentColor" />
    </svg>
  );
}

function mostrado(valor: string | null): string {
  if (valor === null || valor.trim() === "") {
    return "No publicado";
  }
  return valor;
}

function opcionesCon(valores: string[], actual: string): string[] {
  if (actual === "" || valores.includes(actual)) {
    return valores;
  }
  return [...valores, actual].sort((a, b) => a.localeCompare(b, "es"));
}

function numeros(actual: number, paginas: number): number[] {
  const inicio = Math.max(1, Math.min(actual - 2, paginas - 4));
  const fin = Math.min(paginas, inicio + 4);
  const salida: number[] = [];
  for (let numero = Math.max(1, fin - 4); numero <= fin; numero += 1) {
    salida.push(numero);
  }
  return salida;
}

interface FiltroActivo {
  etiqueta: string;
  href: string;
}

function filtrosActivos(filtros: FiltrosFormulario): FiltroActivo[] {
  const salida: FiltroActivo[] = [];
  if (filtros.departamento !== "") {
    salida.push({
      etiqueta: `Quitar ${aDepartamento(filtros.departamento)}`,
      href: enlace({ ...filtros, departamento: "" }, 1),
    });
  }
  if (filtros.estado !== "") {
    salida.push({
      etiqueta: `Quitar ${filtros.estado}`,
      href: enlace({ ...filtros, estado: "" }, 1),
    });
  }
  if (filtros.modalidad !== "") {
    salida.push({
      etiqueta: `Quitar ${filtros.modalidad}`,
      href: enlace({ ...filtros, modalidad: "" }, 1),
    });
  }
  if (filtros.categoria !== "") {
    salida.push({
      etiqueta: `Quitar ${etiquetaCategoria(filtros.categoria)}`,
      href: enlace({ ...filtros, categoria: "" }, 1),
    });
  }
  if (filtros.desde !== "") {
    salida.push({
      etiqueta: `Quitar ${filtros.desde}`,
      href: enlace({ ...filtros, desde: "" }, 1),
    });
  }
  if (filtros.hasta !== "") {
    salida.push({
      etiqueta: `Quitar ${filtros.hasta}`,
      href: enlace({ ...filtros, hasta: "" }, 1),
    });
  }
  if (filtros.soloAdjudicacion) {
    salida.push({
      etiqueta: "Quitar solo con adjudicación",
      href: enlace({ ...filtros, soloAdjudicacion: false }, 1),
    });
  }
  return salida;
}

function limpiarFiltros(filtros: FiltrosFormulario): string {
  return enlace(
    {
      q: filtros.q,
      departamento: "",
      estado: "",
      modalidad: "",
      categoria: "",
      desde: "",
      hasta: "",
      soloAdjudicacion: false,
    },
    1,
  );
}

function enlace(filtros: FiltrosFormulario, pagina: number): string {
  const params = new URLSearchParams();
  if (filtros.q !== "") {
    params.set("q", filtros.q);
  }
  if (filtros.departamento !== "") {
    params.set("departamento", filtros.departamento);
  }
  if (filtros.estado !== "") {
    params.set("estado", filtros.estado);
  }
  if (filtros.modalidad !== "") {
    params.set("modalidad", filtros.modalidad);
  }
  if (filtros.categoria !== "") {
    params.set("categoria", filtros.categoria);
  }
  if (filtros.desde !== "") {
    params.set("desde", filtros.desde);
  }
  if (filtros.hasta !== "") {
    params.set("hasta", filtros.hasta);
  }
  if (filtros.soloAdjudicacion) {
    params.set("adjudicacion", "1");
  }
  if (pagina > 1) {
    params.set("pagina", String(pagina));
  }
  const consulta = params.toString();
  return consulta === "" ? "/" : `/?${consulta}`;
}

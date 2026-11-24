import Link from "next/link";
import type { OpcionesFiltro, ResultadoBusqueda } from "@/lib/consultas";
import {
  etiquetaCategoria,
  formatoFecha,
  formatoMonto,
  urlGuatecompras,
} from "@/lib/formato";
import type { FiltrosFormulario } from "@/lib/parametros";

export interface PaginaBusquedaProps {
  filtros: FiltrosFormulario;
  opciones: OpcionesFiltro;
  resultados: ResultadoBusqueda[];
  total: number;
  pagina: number;
  tamano: number;
  error: string | null;
}

export function PaginaBusqueda({
  filtros,
  opciones,
  resultados,
  total,
  pagina,
  tamano,
  error,
}: PaginaBusquedaProps) {
  const paginas = total === 0 ? 1 : Math.ceil(total / tamano);
  return (
    <main className="pagina">
      <h1>Buscar procesos</h1>
      <form className="busqueda" method="get" action="/" role="search">
        {error !== null && (
          <p className="alerta" role="alert">
            {error}
          </p>
        )}
        <div className="campo">
          <label htmlFor="q">Texto</label>
          <input
            id="q"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={filtros.q}
            placeholder="Por ejemplo, diesel"
            autoComplete="off"
          />
        </div>
        <div className="filtros">
          <Selector
            id="departamento"
            nombre="departamento"
            etiqueta="Departamento"
            actual={filtros.departamento}
            opciones={opciones.departamentos}
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
          <div className="campo">
            <label htmlFor="categoria">Categoría</label>
            <select
              id="categoria"
              name="categoria"
              defaultValue={filtros.categoria}
              aria-describedby="ayuda-categoria"
            >
              <option value="">Todas</option>
              {opcionesCon(opciones.categorias, filtros.categoria).map(
                (valor) => (
                  <option key={valor} value={valor}>
                    {etiquetaCategoria(valor)}
                  </option>
                ),
              )}
            </select>
            <p id="ayuda-categoria" className="ayuda">
              Si escribes texto, la categoría no descarta resultados: el texto
              pesa más y la categoría solo ordena.
            </p>
          </div>
          <div className="campo">
            <label htmlFor="desde">Publicado desde</label>
            <input
              id="desde"
              name="desde"
              type="date"
              defaultValue={filtros.desde}
            />
          </div>
          <div className="campo">
            <label htmlFor="hasta">Publicado hasta</label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={filtros.hasta}
            />
          </div>
          <div className="campo campo-check">
            <label htmlFor="adjudicacion">
              <input
                id="adjudicacion"
                name="adjudicacion"
                type="checkbox"
                value="1"
                defaultChecked={filtros.soloAdjudicacion}
              />{" "}
              Solo con adjudicación
            </label>
          </div>
        </div>
        <div className="acciones">
          <button type="submit">Buscar</button>
        </div>
      </form>
      <p className="nota">
        No hay valor estimado de la licitación. Si aparece un monto, es la suma
        de las adjudicaciones, en quetzales.
      </p>
      <p className="resumen">
        {total === 0
          ? "No hay procesos con esos filtros."
          : `${total.toLocaleString("es-GT")} ${total === 1 ? "proceso" : "procesos"}.`}
      </p>
      <ol className="lista">
        {resultados.map((resultado) => (
          <li key={resultado.nog}>
            <article className="tarjeta">
              <h2>
                <Link href={`/proceso/${resultado.nog}`}>
                  {resultado.titulo ?? "Sin título publicado"}
                </Link>
              </h2>
              <div className="meta">
                <p>
                  Cita:{" "}
                  <cite>
                    <a href={urlGuatecompras(resultado.nog)} rel="noreferrer">
                      NOG {resultado.nog}
                    </a>
                  </cite>
                </p>
                <p>{resultado.comprador ?? "Comprador no publicado"}</p>
                <p>{resultado.departamento ?? "Sin departamento"}</p>
                <p>{resultado.estado ?? "Sin estado"}</p>
                <p>{resultado.modalidad ?? "Sin modalidad"}</p>
                <p>{formatoFecha(resultado.fechaPublicacion)}</p>
                {resultado.montoAdjudicadoGtq !== null && (
                  <p>
                    Monto adjudicado:{" "}
                    {formatoMonto(resultado.montoAdjudicadoGtq)}
                  </p>
                )}
              </div>
            </article>
          </li>
        ))}
      </ol>
      {paginas > 1 && (
        <nav className="paginacion" aria-label="Paginación">
          {pagina > 1 && (
            <Link href={enlace(filtros, pagina - 1)}>Anterior</Link>
          )}
          <span>
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={enlace(filtros, pagina + 1)}>Siguiente</Link>
          )}
        </nav>
      )}
    </main>
  );
}

function Selector({
  id,
  nombre,
  etiqueta,
  actual,
  opciones,
}: {
  id: string;
  nombre: string;
  etiqueta: string;
  actual: string;
  opciones: string[];
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} name={nombre} defaultValue={actual}>
        <option value="">Todos</option>
        {opcionesCon(opciones, actual).map((valor) => (
          <option key={valor} value={valor}>
            {valor}
          </option>
        ))}
      </select>
    </div>
  );
}

function opcionesCon(valores: string[], actual: string): string[] {
  if (actual === "" || valores.includes(actual)) {
    return valores;
  }
  return [...valores, actual].sort((a, b) => a.localeCompare(b, "es"));
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

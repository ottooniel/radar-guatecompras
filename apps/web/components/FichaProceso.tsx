import Link from "next/link";
import type { Ficha } from "@/lib/consultas";
import {
  enUmbral,
  etiquetaCategoria,
  formatoCantidad,
  formatoDia,
  formatoMonto,
  sumarMontos,
  urlGuatecompras,
} from "@/lib/formato";
import { aTitulo } from "@/lib/titulo";
import { CopiarNog } from "./CopiarNog";
import { PuntoEstado } from "./Estado";

export function FichaProceso({ ficha }: { ficha: Ficha }) {
  const suma = sumarMontos(
    ficha.adjudicaciones.map((adjudicacion) => adjudicacion.montoGtq),
  );
  const monto = formatoMonto(suma);
  const presente = ficha.adjudicaciones.some(
    (adjudicacion) =>
      adjudicacion.montoGtq !== null && enUmbral(adjudicacion.montoGtq),
  );
  const porcentaje = porcentajeDe(ficha.proporcion);
  return (
    <main className="pagina contenedor">
      <p className="volver">
        <Link href="/">Volver a los resultados</Link>
      </p>
      <article className="ficha">
        <h1>{mostrado(aTitulo(ficha.titulo))}</h1>
        <div className="linea-estado">
          <PuntoEstado estado={ficha.estado} />
          <span>{mostrado(ficha.modalidad)}</span>
          <span>
            {ficha.categoria === null
              ? "No publicado"
              : etiquetaCategoria(ficha.categoria)}
          </span>
          <CopiarNog nog={ficha.nog} />
          <a href={urlGuatecompras(ficha.nog)} rel="noreferrer">
            Ver en Guatecompras
          </a>
        </div>
        <div className="bloque-monto">
          {monto === null ? (
            <p className="monto-grande sin-monto">Aún sin adjudicar</p>
          ) : (
            <p className="monto-grande">{monto}</p>
          )}
          <dl className="datos-clave">
            <div>
              <dt>Publicado</dt>
              <dd>
                {ficha.fechaPublicacion === null
                  ? "No publicado"
                  : formatoDia(ficha.fechaPublicacion)}
              </dd>
            </div>
            <div>
              <dt>Cierre de ofertas</dt>
              <dd>
                {ficha.fechaCierre === null
                  ? "Sin fecha de cierre publicada"
                  : formatoDia(ficha.fechaCierre)}
              </dd>
            </div>
            <div>
              <dt>Oferentes</dt>
              <dd>{ficha.oferentes ?? "No publicado"}</dd>
            </div>
          </dl>
        </div>
        <div className="columnas">
          <div>
            <section className="bloque" aria-labelledby="que-se-compra">
              <h2 id="que-se-compra">Qué se compra</h2>
              {ficha.items.length === 0 ? (
                <p>No publicado</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Descripción</th>
                      <th scope="col">UNSPSC</th>
                      <th scope="col">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.items.map((item, indice) => (
                      <tr key={`${item.id ?? "item"}-${indice}`}>
                        <td>{mostrado(item.descripcion)}</td>
                        <td className="nog">{mostrado(item.unspsc)}</td>
                        <td>
                          {formatoCantidad(item.cantidad)} {item.unidad ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="bloque" aria-labelledby="adjudicado">
              <h2 id="adjudicado">A quién se adjudicó</h2>
              {ficha.adjudicaciones.length === 0 ? (
                <p>Aún sin adjudicar</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Proveedor</th>
                      <th scope="col">Monto</th>
                      <th scope="col">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.adjudicaciones.map((adjudicacion, indice) => (
                      <tr key={`${adjudicacion.id ?? "adj"}-${indice}`}>
                        <td>{mostrado(adjudicacion.proveedor)}</td>
                        <td className="nog">
                          {adjudicacion.montoGtq === null
                            ? "No publicado"
                            : formatoMonto(adjudicacion.montoGtq)}
                        </td>
                        <td>
                          {adjudicacion.fecha === null
                            ? "No publicado"
                            : formatoDia(adjudicacion.fecha)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
          <div>
            <section className="bloque" aria-labelledby="comprador">
              <h2 id="comprador">Comprador</h2>
              <dl className="pares">
                <dt>Nombre</dt>
                <dd>{mostrado(aTitulo(ficha.comprador.nombre))}</dd>
                <dt>NIT</dt>
                <dd>{mostrado(ficha.comprador.nit)}</dd>
                <dt>Unidad</dt>
                <dd>{mostrado(ficha.comprador.unidadNombre)}</dd>
                <dt>Código</dt>
                <dd>{mostrado(ficha.comprador.unidadGcuc)}</dd>
                <dt>Departamento</dt>
                <dd>{mostrado(ficha.comprador.departamento)}</dd>
              </dl>
            </section>
            <section className="bloque" aria-labelledby="indicadores">
              <h2 id="indicadores">Indicadores</h2>
              {ficha.indicadores.map((indicador) => (
                <div key={indicador.id} className="indicador">
                  <h3>
                    {indicador.titulo}
                    {indicador.id === "umbral" && (
                      <span
                        className={
                          presente ? "insignia" : "insignia insignia-vacia"
                        }
                      >
                        {presente ? "Presente" : "Sin coincidencia"}
                      </span>
                    )}
                  </h3>
                  <p>{indicador.texto}</p>
                  {indicador.id === "compra_directa" && porcentaje !== null && (
                    <div
                      className="barra"
                      role="img"
                      aria-label={`${porcentaje} por ciento de compra directa`}
                    >
                      <span
                        style={{ width: `${Math.min(porcentaje, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
              <p className="aviso-indicadores">
                Los indicadores describen datos publicados. No son una acusación
                ni prueban irregularidades.
              </p>
            </section>
          </div>
        </div>
      </article>
    </main>
  );
}

function porcentajeDe(
  proporcion: { total: number; directas: number } | null,
): number | null {
  if (proporcion === null || proporcion.total <= 0) {
    return null;
  }
  return Math.round((proporcion.directas / proporcion.total) * 1000) / 10;
}

function mostrado(valor: string | null): string {
  if (valor === null || valor.trim() === "") {
    return "No publicado";
  }
  return valor;
}

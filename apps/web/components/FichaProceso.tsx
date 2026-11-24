import Link from "next/link";
import type { Ficha } from "@/lib/consultas";
import {
  etiquetaCategoria,
  formatoCantidad,
  formatoFecha,
  formatoMonto,
  sumarMontos,
  urlGuatecompras,
} from "@/lib/formato";

export function FichaProceso({ ficha }: { ficha: Ficha }) {
  const suma = sumarMontos(
    ficha.adjudicaciones.map((adjudicacion) => adjudicacion.montoGtq),
  );
  return (
    <main className="pagina">
      <p className="volver">
        <Link href="/">Volver a la búsqueda</Link>
      </p>
      <article className="ficha">
        <h1>{ficha.titulo ?? "Sin título publicado"}</h1>
        <p>
          Cita:{" "}
          <cite>
            <a href={urlGuatecompras(ficha.nog)} rel="noreferrer">
              NOG {ficha.nog}
            </a>
          </cite>
        </p>
        <section aria-labelledby="datos-generales">
          <h2 id="datos-generales">Datos generales</h2>
          <dl className="datos">
            <dt>Estado</dt>
            <dd>{publicado(ficha.estado, "Sin estado")}</dd>
            <dt>Modalidad</dt>
            <dd>{publicado(ficha.modalidad, "Sin modalidad")}</dd>
            <dt>Categoría</dt>
            <dd>
              {ficha.categoria === null
                ? "Sin categoría"
                : etiquetaCategoria(ficha.categoria)}
            </dd>
            <dt>Publicación</dt>
            <dd>{formatoFecha(ficha.fechaPublicacion)}</dd>
            <dt>Cierre</dt>
            <dd>
              {ficha.fechaCierre === null
                ? "Sin fecha de cierre publicada"
                : formatoFecha(ficha.fechaCierre)}
            </dd>
            <dt>OCID</dt>
            <dd>{ficha.ocid}</dd>
            <dt>Oferentes registrados</dt>
            <dd>{ficha.oferentes ?? "Sin dato"}</dd>
            <dt>Mes de la fuente</dt>
            <dd>{ficha.mesFuente}</dd>
          </dl>
          <p className="nota">
            No hay valor estimado de la licitación. Los montos son de
            adjudicaciones, en quetzales. Las fechas se muestran en hora de
            Guatemala.
          </p>
        </section>
        <section aria-labelledby="comprador">
          <h2 id="comprador">Comprador y unidad</h2>
          <dl className="datos">
            <dt>Comprador</dt>
            <dd>
              {publicado(ficha.comprador.nombre, "Comprador no publicado")}
            </dd>
            <dt>NIT</dt>
            <dd>{publicado(ficha.comprador.nit, "Sin NIT")}</dd>
            <dt>Unidad</dt>
            <dd>
              {publicado(ficha.comprador.unidadNombre, "Sin unidad publicada")}
            </dd>
            <dt>Código de unidad</dt>
            <dd>{publicado(ficha.comprador.unidadGcuc, "Sin código")}</dd>
            <dt>Departamento</dt>
            <dd>
              {publicado(ficha.comprador.departamento, "Sin departamento")}
            </dd>
          </dl>
        </section>
        <section aria-labelledby="items">
          <h2 id="items">Ítems</h2>
          {ficha.items.length === 0 ? (
            <p>Este proceso no tiene ítems publicados.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Descripción</th>
                  <th scope="col">UNSPSC</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {ficha.items.map((item, indice) => (
                  <tr key={`${item.id ?? "item"}-${indice}`}>
                    <td>{publicado(item.descripcion, "Sin descripción")}</td>
                    <td>{publicado(item.unspsc, "Sin UNSPSC")}</td>
                    <td>{formatoCantidad(item.cantidad)}</td>
                    <td>{publicado(item.unidad, "Sin unidad")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section aria-labelledby="adjudicaciones">
          <h2 id="adjudicaciones">Adjudicaciones</h2>
          {ficha.adjudicaciones.length === 0 ? (
            <p>Este proceso no tiene adjudicaciones publicadas.</p>
          ) : (
            <>
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Monto</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.adjudicaciones.map((adjudicacion, indice) => (
                    <tr key={`${adjudicacion.id ?? "adj"}-${indice}`}>
                      <td>
                        {publicado(
                          adjudicacion.proveedor,
                          "Proveedor no publicado",
                        )}
                      </td>
                      <td>
                        {adjudicacion.montoGtq === null
                          ? "Sin monto"
                          : formatoMonto(adjudicacion.montoGtq)}
                      </td>
                      <td>{formatoFecha(adjudicacion.fecha)}</td>
                      <td>{publicado(adjudicacion.estado, "Sin estado")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {suma !== null && <p>Suma adjudicada: {formatoMonto(suma)}</p>}
            </>
          )}
        </section>
        <section aria-labelledby="titulo-indicadores">
          <h2 id="titulo-indicadores">Indicadores</h2>
          <ol className="indicadores">
            {ficha.indicadores.map((indicador) => (
              <li key={indicador.id} className="indicador">
                <h3>{indicador.titulo}</h3>
                <p>{indicador.texto}</p>
                <p>{indicador.explicacion}</p>
                <p className="aviso">{indicador.aviso}</p>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </main>
  );
}

function publicado(valor: string | null, vacio: string): string {
  if (valor === null || valor.trim() === "") {
    return vacio;
  }
  return valor;
}

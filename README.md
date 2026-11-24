# Radar Guatecompras

## Qué es

Alertas de concursos del Estado para MIPYMES, con búsqueda en español y respuestas citadas al NOG. Este monorepo tiene el ETL de datos abiertos, la aplicación web, el servidor MCP y los tipos compartidos. La web y el MCP siguen en esqueleto. El ETL descarga los paquetes OCDS mensuales y los aplana a Parquet.

## Fuente de datos y licencia

Los datos provienen de los datos abiertos OCDS de Guatecompras: <https://ocds.guatecompras.gt/descarga-datos>. Esa publicación usa la licencia [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

El código de este repositorio se distribuye bajo la licencia MIT. Copyright (c) 2026 ottooniel. Ver [LICENSE](LICENSE).

## Cómo correrlo

Hace falta Node.js 22 y pnpm 10.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

La página inicial, en local:

```bash
pnpm --filter @radar-guatecompras/web dev
```

El ETL, desde la raíz del repo. `--desde` y `--hasta` son inclusivos, con mes de dos dígitos. La URL de Guatecompras usa el mes sin cero (`2026/9`); el comando no.

```bash
pnpm etl --desde 2025-12 --hasta 2026-11
```

Por cada mes baja el SHA publicado, lo compara con `data/manifest.json` y solo vuelve a bajar y aplanar si cambió. La segunda corrida, con el mismo SHA, no reescribe Parquet. Salidas, ignoradas por git:

- `data/ocds/anio=YYYY/mes=MM/{tenders,items,awards,bids,parties}.parquet`
- `data/quality/YYYY-MM.json`
- `data/manifest.json`

`data/quality/YYYY-MM.json` trae filas por tabla, NOG duplicados, fechas que no parsean (y el detalle por campo), procesos sin departamento, sin ítems y vigentes sin fecha de cierre.

No hace falta ninguna variable de entorno. `.env.example` queda vacío a propósito. Los archivos `.env*` reales no se versionan. Las descargas (`data/`, `*.parquet`) tampoco. El fixture de 200 records en `packages/etl/test/fixtures/` sí va en el repo: es un extracto de los datos abiertos de noviembre 2026, bajo la misma licencia CC BY 4.0. El test que pega a la red (`RUN_LIVE=1`) no corre en `pnpm test`.

## Modelo tabular

Solo se usa `compiledRelease`. `source_month` es el mes de publicación del archivo (`YYYY-MM`), en las cinco tablas. `nog` y `ocid` están en todas y sirven de llave.

Fechas en `TIMESTAMPTZ`. El texto trae offset `-06:00` y se guarda el instante, sin tratar la hora local como UTC. Para ver esa hora: `SET TimeZone = 'America/Guatemala'`. Montos en `DECIMAL(18,2)`, sin redondear más allá de los centavos que ya vienen. Cantidades en `DECIMAL(18,4)`.

`buyer.id` es `GT-NIT-...` y no aparece en `parties`. `buyer_nit` es ese id sin el prefijo; a veces termina en `K`. El departamento es `address.region` del party `GT-CISP-` con rol `buyer` (la entidad). La unidad compradora `GT-GCUC-` también trae rol `buyer`, `memberOf` hacia la entidad, y a veces otra región: esa región queda en `parties`, no en `tenders.department`.

### tenders

| Columna          | Origen                                                    |
| ---------------- | --------------------------------------------------------- |
| `nog`            | `tender.id` sin `GT-NOG-`, entero                         |
| `ocid`           | `ocid`                                                    |
| `title`          | `tender.title`                                            |
| `status_detail`  | `tender.statusDetails`                                    |
| `method_detail`  | `tender.procurementMethodDetails`                         |
| `category`       | `tender.mainProcurementCategory`                          |
| `date_published` | `tender.datePublished`                                    |
| `tender_end`     | `tender.tenderPeriod.endDate`                             |
| `buyer_nit`      | `buyer.id` sin `GT-NIT-`                                  |
| `buyer_name`     | `buyer.name`                                              |
| `unit_gcuc`      | id de la unidad `GT-GCUC-` con rol `buyer`, sin prefijo   |
| `unit_name`      | nombre de esa unidad                                      |
| `department`     | `address.region` de la entidad `GT-CISP-` con rol `buyer` |
| `n_tenderers`    | `tender.numberOfTenderers`                                |
| `source_month`   | mes del archivo                                           |

### items

Una fila por ítem de `tender.items`: `nog`, `ocid`, `source_month`, `item_id`, `description`, `classification_scheme`, `unspsc` (`classification.id`, 8 dígitos), `quantity`, `unit_name`.

### awards

Una fila por proveedor de cada elemento de `awards`. Si no hay proveedores, la fila queda con proveedor nulo. Columnas: `nog`, `ocid`, `source_month`, `award_id`, `title`, `status`, `status_detail`, `award_date`, `amount`, `currency`, `supplier_id`, `supplier_name`. El monto es `value.amount` y la moneda, en estos archivos, GTQ.

### bids

Una fila por oferente de cada elemento de `bids.details` (extensión de ofertas). Columnas: `nog`, `ocid`, `source_month`, `bid_id`, `status`, `bid_date`, `amount`, `currency`, `tenderer_id`, `tenderer_name`.

### parties

Una fila por party: `nog`, `ocid`, `source_month`, `party_id`, `scheme`, `name`, `roles` (ordenados y unidos por coma), `member_of_id` (primer `memberOf`), `region`, `locality`.

## Aviso

Indicadores, no acusaciones. Datos de Guatecompras OCDS; no es un sitio oficial.

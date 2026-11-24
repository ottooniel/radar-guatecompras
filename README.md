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

Por cada mes baja el SHA publicado, lo compara con `data/manifest.json` y solo vuelve a bajar y aplanar si cambió. Las cinco tablas se escriben en `mes=MM.tmp-<id>`, al lado del directorio final. Cuando las cinco están listas, el directorio anterior pasa a `mes=MM.old-<id>`, el temporal lo reemplaza con un rename y el `.old` se borra. Si la escritura falla, el mes anterior queda como estaba y el temporal se limpia. `manifest.json` se actualiza después de ese reemplazo. La segunda corrida, con el mismo SHA, no reescribe Parquet. Salidas, ignoradas por git:

- `data/ocds/anio=YYYY/mes=MM/{tenders,items,awards,bids,parties}.parquet`
- `data/quality/YYYY-MM.json`
- `data/manifest.json`

`data/quality/YYYY-MM.json` trae filas por tabla, NOG duplicados, NOG nulos (el `tender.id` falta o no es un entero), fechas que no parsean (y el detalle por campo), procesos sin departamento, sin ítems y vigentes sin fecha de cierre.

El ETL de Parquet no necesita variables de entorno. La carga a Postgres sí: están en `.env.example`. Los archivos `.env*` reales no se versionan. Las descargas (`data/`, `*.parquet`) tampoco. El fixture de 200 records en `packages/etl/test/fixtures/` sí va en el repo: es un extracto de los datos abiertos de noviembre 2026, bajo la misma licencia CC BY 4.0. El test que pega a la red (`RUN_LIVE=1`) no corre en `pnpm test`. Si `DATABASE_URL` apunta a Postgres, `pnpm test` también prueba la carga.

## Postgres

La base local es Postgres 16 con pgvector.

```bash
docker compose up -d
cp .env.example .env
pnpm migrate
pnpm etl --desde 2026-11 --hasta 2026-11
pnpm load --desde 2026-11 --hasta 2026-11
```

`pnpm load` sin fechas carga los meses de `data/manifest.json`. La ruta es exacta: `data/ocds/anio=YYYY/mes=MM/{tenders,items,awards}.parquet`. No lista directorios. Si el ETL se interrumpe pueden quedar `mes=MM.tmp-*` y `mes=MM.old-*`; no se leen. Si falta un archivo del manifest, el comando falla y dice cuál.

Lee esas tres tablas con DuckDB. `bids` y `parties` se quedan en Parquet. Upsert de `tenders` por `nog`. Antes de reinsertar, borra los ítems y las adjudicaciones de ese NOG. `etl_runs` guarda una fila por mes (`rows` es la cantidad de tenders, `sha` sale del manifest) y la reemplaza en la siguiente carga.

`tenders.search` no es una columna generada: no puede armarse leyendo `items`. El cargador la llena después de insertar los ítems:

```sql
to_tsvector('spanish', unaccent(coalesce(title, '') || ' ' || coalesce(texto_de_items, '')))
```

Un tender sin ítems queda con el vector de su título. `unaccent` está en `packages/etl/migrations/0002_unaccent.sql`, aparte de `0001_inicial.sql`, que es el esquema obligatorio. `embedding` (`halfvec(512)`) queda `NULL`. El índice HNSW es de una fase posterior. Una recarga no lo pisa.

`buyers` sale de `tenders`: un renglón por NIT. Si el mismo NIT trae varios nombres o departamentos, se queda el de `date_published` más reciente. Si empatan, gana el NOG mayor.

Al final se conservan 5 `source_month`. Los más viejos se borran, y con ellos sus ítems y adjudicaciones. Son 5 meses por el límite de 500 MB del plan gratis de Supabase.

La segunda carga, con los mismos Parquet, deja los mismos conteos.

Búsqueda recomendada:

```sql
SELECT nog, title
FROM tenders
WHERE search @@ websearch_to_tsquery('spanish', unaccent('diesel'))
LIMIT 5;
```

`diesel` no lleva tilde, así que esta otra forma también coincide:

```sql
SELECT nog, title
FROM tenders
WHERE search @@ websearch_to_tsquery('spanish', 'diesel')
LIMIT 5;
```

Para ver la hora de Guatemala: `SET TimeZone = 'America/Guatemala'`.

El cron está en `.github/workflows/etl.yml`: todos los días a las 09:30 UTC baja los últimos 3 meses, migra y carga. `DATABASE_URL` es un secreto del repositorio. En Supabase esa cadena es la del Session pooler y termina en `?sslmode=no-verify`. Si faltan `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` o `R2_BUCKET`, no sube los Parquet y el job sigue. La subida usa solo los meses del manifest, en la ruta final. El workflow de pull requests no usa la base.

Para llenar los 5 meses la primera vez, en una máquina con la misma `DATABASE_URL`:

```bash
pnpm etl --desde 2026-07 --hasta 2026-11
pnpm load --desde 2026-07 --hasta 2026-11
```

El job diario solo refresca los últimos 3. Los anteriores se quedan hasta que haya más de 5 meses distintos.

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

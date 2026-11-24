# Radar Guatecompras

## Qué es

Alertas de concursos del Estado para MIPYMES, con búsqueda en español y respuestas citadas al NOG. Este monorepo tendrá el ETL de datos abiertos, la aplicación web, el servidor MCP y los tipos compartidos. En esta fase solo está el esqueleto: la web muestra el nombre del proyecto y el resto de los paquetes no implementan todavía su función.

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

No hay variables de entorno en esta fase. `.env.example` queda vacío a propósito; las que hagan falta después se documentan ahí. Los archivos `.env*` reales no se versionan. Las descargas (`data/`, `*.parquet`) tampoco.

## Aviso

Indicadores, no acusaciones. Datos de Guatecompras OCDS; no es un sitio oficial.

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const archivosWeb = ["apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];
const archivosPaquetes = ["packages/**/*.ts", "vitest.config.ts"];

function soloEnWeb(configs) {
  return configs.map((config) => {
    const claves = Object.keys(config);
    const soloIgnora = claves.every(
      (clave) => clave === "ignores" || clave === "name",
    );
    if (soloIgnora) {
      return config;
    }
    return {
      ...config,
      files: archivosWeb,
      settings: {
        ...config.settings,
        next: {
          ...config.settings?.next,
          rootDir: "apps/web/",
        },
      },
    };
  });
}

export default defineConfig([
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/dist/**",
    "**/coverage/**",
    "data/**",
    "**/next-env.d.ts",
    "pnpm-lock.yaml",
  ]),
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: archivosPaquetes,
  })),
  ...soloEnWeb(nextVitals),
  ...soloEnWeb(nextTs),
  prettier,
]);

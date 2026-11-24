import { leerRangoOpcional } from "./argumentos.js";
import { cargarOcds } from "./cargar.js";
import { aplicarEntorno, exigirDatabaseUrl } from "./entorno.js";
import { raizDelRepo } from "./rutas.js";

try {
  const raiz = raizDelRepo(process.cwd());
  await aplicarEntorno(raiz);
  const rango = leerRangoOpcional(process.argv.slice(2));
  await cargarOcds({
    raiz,
    databaseUrl: exigirDatabaseUrl(),
    desde: rango?.desde,
    hasta: rango?.hasta,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

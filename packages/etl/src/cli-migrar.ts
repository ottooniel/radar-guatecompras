import { aplicarEntorno, exigirDatabaseUrl } from "./entorno.js";
import {
  aplicarMigraciones,
  directorioMigracionesPorDefecto,
} from "./migrar.js";
import { raizDelRepo } from "./rutas.js";

try {
  const raiz = raizDelRepo(process.cwd());
  await aplicarEntorno(raiz);
  const aplicadas = await aplicarMigraciones({
    databaseUrl: exigirDatabaseUrl(),
    directorio: directorioMigracionesPorDefecto(),
  });
  if (aplicadas.length === 0) {
    console.log("Migraciones al día");
  } else {
    for (const version of aplicadas) {
      console.log(`Aplicada ${version}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

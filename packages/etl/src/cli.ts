import { leerArgumentos } from "./argumentos.js";
import { ejecutarEtl } from "./ejecutar.js";
import { raizDelRepo } from "./rutas.js";

try {
  const { desde, hasta } = leerArgumentos(process.argv.slice(2));
  await ejecutarEtl({
    desde,
    hasta,
    raiz: raizDelRepo(process.cwd()),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

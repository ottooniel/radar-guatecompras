import { aplicarEntorno } from "./entorno.js";
import { mensajeR2Omitido, secretosR2, subirParquetAR2 } from "./r2.js";
import { raizDelRepo } from "./rutas.js";

try {
  const raiz = raizDelRepo(process.cwd());
  await aplicarEntorno(raiz);
  const secretos = secretosR2(process.env);
  if (secretos === null) {
    console.log(mensajeR2Omitido());
  } else {
    await subirParquetAR2({ raiz, secretos });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

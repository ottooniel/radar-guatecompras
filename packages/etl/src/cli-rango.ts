import { ultimosMeses } from "./meses.js";

const { desde, hasta } = ultimosMeses(3, new Date());
process.stdout.write(`${desde} ${hasta}\n`);

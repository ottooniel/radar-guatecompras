import Link from "next/link";

export function NoEncontrado({
  titulo,
  texto,
}: {
  titulo: string;
  texto: string;
}) {
  return (
    <main className="pagina contenedor">
      <h1>{titulo}</h1>
      <p>{texto}</p>
      <p>
        <Link href="/">Volver a la búsqueda</Link>
      </p>
    </main>
  );
}

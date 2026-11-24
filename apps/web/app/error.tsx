"use client";

export default function ErrorConsulta({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error.digest;
  return (
    <main className="pagina contenedor error-pagina">
      <h1>No se pudo conectar</h1>
      <p>
        No pudimos consultar los datos. Revisa la conexión e inténtalo de nuevo.
      </p>
      <button type="button" onClick={() => reset()}>
        Reintentar
      </button>
    </main>
  );
}

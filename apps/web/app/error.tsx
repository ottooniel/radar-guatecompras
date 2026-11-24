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
    <main className="pagina">
      <h1>No se pudo consultar la base</h1>
      <p>Inténtalo de nuevo en un momento.</p>
      <button type="button" onClick={() => reset()}>
        Reintentar
      </button>
    </main>
  );
}

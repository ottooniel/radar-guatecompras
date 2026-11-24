import { NoEncontrado } from "@/components/NoEncontrado";

export default function ProcesoNoEncontrado() {
  return (
    <NoEncontrado
      titulo="No encontramos ese proceso"
      texto="Ese NOG no está en los meses cargados, o el número no es válido."
    />
  );
}

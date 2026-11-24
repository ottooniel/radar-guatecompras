export function PuntoEstado({ estado }: { estado: string | null }) {
  const vista = vistaEstado(estado);
  return (
    <span className={`punto-estado ${vista.clase}`}>
      <span className="punto" aria-hidden="true" />
      {vista.texto}
    </span>
  );
}

function vistaEstado(estado: string | null): { clase: string; texto: string } {
  const limpio = estado?.trim() ?? "";
  switch (limpio) {
    case "Adjudicado":
      return { clase: "punto-verde", texto: "Adjudicado" };
    case "Vigente":
      return { clase: "punto-azul", texto: "Vigente" };
    case "Evaluación":
      return { clase: "punto-ambar", texto: "En evaluación" };
    case "Desierto":
    case "Prescindido":
    case "No adjudicado":
      return { clase: "punto-gris", texto: limpio };
    case "":
      return { clase: "punto-gris", texto: "No publicado" };
    default:
      return { clase: "punto-gris", texto: limpio };
  }
}

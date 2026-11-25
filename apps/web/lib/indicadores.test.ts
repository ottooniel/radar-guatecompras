import { expect, it } from "vitest";
import {
  enUmbral,
  formatoCantidad,
  formatoFecha,
  formatoMonto,
  sumarMontos,
} from "./formato";
import { armarIndicadores } from "./indicadores";

it("formatea quetzales, cantidades y la hora de Guatemala", () => {
  expect(formatoMonto("89000")).toBe("Q89,000.00");
  expect(formatoMonto("150.75")).toBe("Q150.75");
  expect(formatoCantidad("100.5000")).toBe("100.5");
  expect(formatoFecha("2026-11-10T18:00:00.000Z")).toMatch(
    /10 de noviembre de 2026/,
  );
  expect(formatoFecha("2026-11-16T02:00:00.000Z")).toMatch(
    /15 de noviembre de 2026/,
  );
  expect(sumarMontos(["100.50", "50.25", null])).toBe("150.75");
});

it("el umbral incluye Q85,000 y Q90,000 y deja afuera los bordes", () => {
  expect(enUmbral("84999.99")).toBe(false);
  expect(enUmbral("85000")).toBe(true);
  expect(enUmbral("90000.00")).toBe(true);
  expect(enUmbral("90000.01")).toBe(false);
});

it("describe modalidad, proporción y umbral sin acusar", () => {
  const indicadores = armarIndicadores({
    modalidad: "Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)",
    proporcion: { total: 3, directas: 2 },
    montosGtq: ["1000.00", "89000.00", "86000"],
  });
  const texto = indicadores
    .map((indicador) =>
      [indicador.texto, indicador.explicacion, indicador.aviso].join(" "),
    )
    .join("\n");

  expect(texto).toContain("Compra Directa con Oferta Electrónica");
  expect(texto).toContain("2 de 3 procesos");
  expect(texto).toContain("66.7 %");
  expect(texto).toContain("cercanos al umbral de Q90,000 de compra directa");
  expect(texto).not.toMatch(/Q1,000\.00/);
  expect(
    indicadores.every((indicador) =>
      indicador.aviso.includes("no una acusación"),
    ),
  ).toBe(true);
  expect(texto).not.toMatch(/corrup|fraude|sospecha|anomal/i);

  const sinUmbral = armarIndicadores({
    modalidad: null,
    proporcion: null,
    montosGtq: ["84999.99"],
  });
  expect(sinUmbral[2]?.texto).toBe(
    "Ningún monto adjudicado queda entre Q85,000 y Q90,000.",
  );
  expect(sinUmbral[1]?.texto).toMatch(/Sin NIT/);
});

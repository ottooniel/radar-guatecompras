import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Page from "./page";

it("muestra el nombre del proyecto", () => {
  const html = renderToStaticMarkup(<Page />);

  expect(html).toContain("<h1>Radar Guatecompras</h1>");
});

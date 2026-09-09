import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("contains wide GFM tables in a horizontal scroll region", () => {
    const markup = renderToStaticMarkup(createElement(
      Markdown,
      null,
      "| Very long metric | Very long value |\n| --- | --- |\n| Revenue | $1,000 |",
    ));

    expect(markup).toContain('<div class="max-w-full overflow-x-auto"><table>');
  });
});

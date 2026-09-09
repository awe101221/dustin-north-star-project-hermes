import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/lib/db/research";
import { StreamCard } from "./research-stream";

const item: StreamItem = {
  id: "70000000-0000-4000-8000-000000000001",
  kind: "memo",
  source: "analyst_memos",
  title: "Micron underwriting",
  ticker: "NAS:MU",
  symbol: "MU",
  companyName: "Micron",
  persona: "brad-gerstner",
  verdict: "BUY",
  sourceSystem: "test",
  expectedIrr: 0.2,
  downside: -0.1,
  price: 100,
  buyPrice: 90,
  triggerPrice: 80,
  pwv: 120,
  tags: [],
  excerpt: "Test memo",
  bodyLength: 9,
  isLatest: true,
  occurredAt: "2026-09-08T00:00:00Z",
};

describe("StreamCard", () => {
  it("renders company, memo, and persona links as siblings instead of nested anchors", () => {
    const markup = renderToStaticMarkup(createElement(StreamCard, { item }));

    expect(markup).toContain('href="/companies/NAS%3AMU"');
    expect(markup).toContain(`href="/research/${item.id}"`);
    expect(markup).toContain('href="/personas/brad-gerstner"');
    expect(markup).not.toContain(`href="/research/${item.id}" class="block panel`);
    expect(markup.startsWith('<div class="block panel')).toBe(true);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  listCompanies: vi.fn(),
  getCompanyCoverage: vi.fn(),
  getLatestPositions: vi.fn(),
  getIdeas: vi.fn(),
  getUniverse: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ serverReadClient: () => ({}) }));
vi.mock("@/lib/db/company", () => ({
  listCompanies: harness.listCompanies,
  getCompanyCoverage: harness.getCompanyCoverage,
}));
vi.mock("@/lib/db/portfolio", () => ({ getLatestPositions: harness.getLatestPositions }));
vi.mock("@/lib/db/pipeline", () => ({ getIdeas: harness.getIdeas }));
vi.mock("@/lib/db/quant", () => ({ getUniverse: harness.getUniverse }));
vi.mock("@/components/companies/companies-table", () => ({
  CompaniesTable: ({ rows }: { rows: unknown }) => createElement("pre", null, JSON.stringify(rows)),
}));

import CompaniesPage from "@/app/companies/page";

describe("CompaniesPage", () => {
  beforeEach(() => {
    harness.listCompanies.mockResolvedValue([{
      ticker: "NAS:MU",
      symbol: "MU",
      name: "Micron",
      sector: "Technology",
      industry: "Semiconductors",
      country: "USA",
    }]);
    harness.getCompanyCoverage.mockResolvedValue([{
      memoId: "memo-1",
      persona: "brad-gerstner",
      ticker: "NAS:MU",
      symbol: "MU",
      companyName: "Micron",
      verdict: "BUY",
      analyzedAt: "2026-09-08T00:00:00Z",
      expectedIrr: 0.21,
    }]);
    harness.getLatestPositions.mockResolvedValue([{ ticker: "NAS:MU", symbol: "MU", weight: 0.04 }]);
    harness.getIdeas.mockResolvedValue([{ ticker: "NAS:MU", stage: "live" }]);
    harness.getUniverse.mockRejectedValue(new Error("the full screener view must not be loaded"));
  });

  it("builds the index from narrow memo coverage without loading the full screener universe", async () => {
    const markup = renderToStaticMarkup(await CompaniesPage());

    expect(harness.getCompanyCoverage).toHaveBeenCalledOnce();
    expect(harness.getUniverse).not.toHaveBeenCalled();
    expect(markup).toContain("Micron");
    expect(markup).toContain("brad-gerstner:BUY");
    expect(markup).toContain("&quot;bestIrr&quot;:0.21");
    expect(markup).toContain("&quot;weight&quot;:0.04");
    expect(markup).toContain("&quot;stage&quot;:&quot;live&quot;");
  });
});

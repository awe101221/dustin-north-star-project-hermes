import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanyModel } from "@/lib/company-models";
import { fmtPrice } from "@/lib/format";
import type { CompanyUnderwriting } from "@/lib/db/underwriting";
import type { UnderwritingNodeRow } from "@/lib/db/types";

const harness = vi.hoisted(() => ({
  getCompany: vi.fn(),
  getFilings: vi.fn(),
  getThemesForTicker: vi.fn(),
  getMemoSummariesForTicker: vi.fn(),
  getNotes: vi.fn(),
  getUniverseForTicker: vi.fn(),
  getGuruSignalForSymbol: vi.fn(),
  getHoldersForSymbol: vi.fn(),
  getLatestPositions: vi.fn(),
  getTrades: vi.fn(),
  getIdeaForTicker: vi.fn(),
  getBestIdeasDashboard: vi.fn(),
  getCompanyUnderwriting: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  serverReadClient: () => ({}),
  underwritingReadClient: async () => ({}),
}));
vi.mock("@/lib/db/company", () => ({
  getCompany: harness.getCompany,
  getFilings: harness.getFilings,
  getThemesForTicker: harness.getThemesForTicker,
}));
vi.mock("@/lib/db/research", () => ({
  getMemoSummariesForTicker: harness.getMemoSummariesForTicker,
  getNotes: harness.getNotes,
}));
vi.mock("@/lib/db/quant", () => ({
  getUniverseForTicker: harness.getUniverseForTicker,
  getGuruSignalForSymbol: harness.getGuruSignalForSymbol,
  getHoldersForSymbol: harness.getHoldersForSymbol,
}));
vi.mock("@/lib/db/portfolio", () => ({
  getLatestPositions: harness.getLatestPositions,
  positionForTicker: () => null,
  getTrades: harness.getTrades,
}));
vi.mock("@/lib/db/pipeline", () => ({ getIdeaForTicker: harness.getIdeaForTicker }));
vi.mock("@/lib/best-ideas", () => ({ getBestIdeasDashboard: harness.getBestIdeasDashboard }));
vi.mock("@/lib/db/underwriting", () => ({ getCompanyUnderwriting: harness.getCompanyUnderwriting }));
vi.mock("@/lib/env", () => ({ isWriteConfigured: () => false }));
vi.mock("@/components/companies/company-actions", () => ({ CompanyActions: () => null }));
vi.mock("@/components/portfolio/trade-log", () => ({ TradeLog: () => null }));

import CompanyPage from "@/app/companies/[ticker]/page";

function persistedNode(asOf: string): UnderwritingNodeRow {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    stable_key: "page-persisted-node",
    node_type: "assumption",
    ticker: "MU",
    title: "Persisted assumption",
    body: null,
    status: "active",
    confidence: null,
    as_of: asOf,
    valid_until: null,
    supersedes_id: null,
    agent_run_id: null,
    payload: {},
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
  };
}

function underwritingWith(asOf?: string): CompanyUnderwriting {
  return {
    nodes: asOf ? [persistedNode(asOf)] : [],
    edges: [],
    forecasts: [],
    runs: [],
  };
}

async function renderPage(underwriting: CompanyUnderwriting) {
  harness.getCompanyUnderwriting.mockResolvedValue(underwriting);
  const page = await CompanyPage({ params: Promise.resolve({ ticker: "MU" }) });
  return renderToStaticMarkup(page);
}

describe("CompanyPage persisted underwriting model suppression", () => {
  beforeEach(() => {
    harness.getCompany.mockResolvedValue(null);
    harness.getFilings.mockResolvedValue([]);
    harness.getThemesForTicker.mockResolvedValue([]);
    harness.getMemoSummariesForTicker.mockResolvedValue([]);
    harness.getNotes.mockResolvedValue([]);
    harness.getUniverseForTicker.mockResolvedValue([]);
    harness.getGuruSignalForSymbol.mockResolvedValue([]);
    harness.getHoldersForSymbol.mockResolvedValue([]);
    harness.getLatestPositions.mockResolvedValue([]);
    harness.getTrades.mockResolvedValue([]);
    harness.getIdeaForTicker.mockResolvedValue(null);
    harness.getBestIdeasDashboard.mockResolvedValue({
      topTen: [{ ticker: "MU", lane: "top-ten", rank: 1, qqqLine: "above" }],
      watchlistTen: [],
    });
  });

  it("suppresses every code-backed model surface when the latest persisted graph is in the future", async () => {
    const markup = await renderPage(underwritingWith("9999-01-01T00:00:00.000Z"));
    const model = getCompanyModel("MU");
    if (!model) throw new Error("MU fixture model is required");

    expect(markup).toContain("Persisted graph record unavailable");
    expect(markup).toContain("future as_of");
    expect(markup).not.toContain("Forward financial model");
    expect(markup).not.toContain("Probability-weighted IRR");
    expect(markup).not.toContain(fmtPrice(model.baseline.currentPrice, model.baseline.currency));
    expect(markup).not.toContain("Model scenario preview");
    expect(markup).not.toContain("Code-model preview");
    expect(markup).toContain("Latest view per lens");
    expect(markup).toContain("Record provenance");
  });

  it("suppresses every code-backed model surface when a persisted graph timestamp is unparseable", async () => {
    const markup = await renderPage(underwritingWith("not-a-timestamp"));

    expect(markup).toContain("Persisted graph record unavailable");
    expect(markup).toContain("invalid as_of");
    expect(markup).not.toContain("Forward financial model");
    expect(markup).not.toContain("Model scenario preview");
    expect(markup).not.toContain("Code-model preview");
  });

  it("keeps the normal financial model for a valid historical persisted graph", async () => {
    const markup = await renderPage(underwritingWith("2020-01-01T00:00:00.000Z"));

    expect(markup).toContain("Forward financial model");
    expect(markup).toContain("Persisted forecast cohort unavailable");
    expect(markup).not.toContain("Persisted graph record unavailable");
  });

  it("keeps code-model preview fallback when no persisted graph exists", async () => {
    const markup = await renderPage(underwritingWith());

    expect(markup).toContain("Forward financial model");
    expect(markup).toContain("Code-model preview");
    expect(markup).toContain("Model scenario preview");
  });
});

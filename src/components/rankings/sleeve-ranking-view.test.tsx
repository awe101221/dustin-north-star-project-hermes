import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rankForecasts, type RankingForecast, type SleeveRanking } from "@/lib/qqq-rankings";
import { SleeveRankingView } from "./sleeve-ranking-view";

function fixture(count: number): SleeveRanking {
  const forecasts: RankingForecast[] = Array.from({ length: count }, (_, i) => ({
    securityId: `SEC:0000000001:TEST${i}`, ticker: `TEST${i.toString().padStart(2, "0")}`, companyName: `Test company ${i}`, modelAsOf: "2026-10-07T20:00:00Z", priceAsOf: "2026-10-07T20:00:00Z",
    currentPrice: 100, currency: "USD", thesis: "Test thesis", whyBeatQqq: "Test benchmark comparison", falsifier: "Test falsifier", nextAction: "Test review", theme: "Test theme", evidenceUrls: ["https://example.com/evidence"], limitations: "Synthetic test fixture", capitalStructure: "Synthetic shares", probabilityRationale: "Synthetic weights",
    scenarios: [{ name: "Bear", benchmarkScenario: "Bear", probability: 0.2, stockAnnualizedReturn: -0.1, stockTerminalPrice: 100 * 0.9 ** 5, qqqAnnualizedReturn: 0, rationale: "Test" },
      { name: "Base", benchmarkScenario: "Base", probability: 0.6, stockAnnualizedReturn: 0.2, stockTerminalPrice: 100 * 1.2 ** 5, qqqAnnualizedReturn: 0.1, rationale: "Test" },
      { name: "Bull", benchmarkScenario: "Bull", probability: 0.2, stockAnnualizedReturn: 0.3, stockTerminalPrice: 100 * 1.3 ** 5, qqqAnnualizedReturn: 0.2, rationale: "Test" }],
  }));
  return { sleeve: "core", asOf: "2026-10-07T20:00:00Z", publication: null, rows: rankForecasts(forecasts), stale: [], candidates: [], missingSlots: Math.max(0, 50 - count) };
}

describe("sleeve ranking surface", () => {
  it("renders a single 50-company ordered list with likelihoods and dossier links", () => {
    const html = renderToStaticMarkup(<SleeveRankingView ranking={fixture(50)} />);
    expect((html.match(/<li /g) ?? [])).toHaveLength(50);
    expect(html).toContain("50 / 50 ranked");
    expect(html).toContain('/companies/TEST49');
    expect(html).toContain("80.0%");
    expect(html).not.toContain("Watchlist 10");
    expect(html).not.toContain("Capital Line");
  });
  it("keeps unavailable likelihoods unranked without manufacturing zero estimates", () => {
    const ranking = fixture(0);
    ranking.candidates = [{ ticker: "MISSING", companyName: "Unmodeled company", thesis: null, nextAction: null }];
    const html = renderToStaticMarkup(<SleeveRankingView ranking={ranking} />);
    expect(html).toContain("50 ranking slots await");
    expect(html).toContain("/companies/MISSING");
    expect(html).not.toContain("0.0%");
    expect((html.match(/<li /g) ?? [])).toHaveLength(0);
  });
});

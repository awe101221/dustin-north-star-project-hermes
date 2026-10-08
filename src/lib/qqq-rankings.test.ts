import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildSleeveRanking, forecastMetrics, rankForecasts, rankingDraftSchema, rankingPublicationSchema, type RankingDraft, type RankingForecast, type RankingPublication, assertSharedForecastConsistency } from "./qqq-rankings";
vi.mock("server-only", () => ({}));
import { loadReviewedRankings } from "./server/qqq-rankings";

const now = "2026-10-07T22:00:00Z";
function forecast(ticker = "ABC"): RankingForecast {
  return { securityId: "SEC:0000000001:" + ticker.replace(":", "-"), ticker, companyName: ticker, modelAsOf: "2026-10-06T20:00:00Z", priceAsOf: "2026-10-07T20:00:00Z", currentPrice: 100,
    currency: "USD", thesis: "Durable economics", whyBeatQqq: "Growth beats benchmark expectations", falsifier: "Margins disappoint", nextAction: "Review next filing", theme: "Software",
    evidenceUrls: ["https://www.sec.gov/Archives/example"], limitations: "Subjective probabilities, not calibrated", capitalStructure: "Test shares and financing", probabilityRationale: "Test conditional weights",
    scenarios: [
      { name: "Bear", benchmarkScenario: "Bear", probability: 0.2, stockAnnualizedReturn: -0.1, stockTerminalPrice: 100 * 0.9 ** 5, qqqAnnualizedReturn: 0.01, rationale: "Execution fails" },
      { name: "Base", benchmarkScenario: "Base", probability: 0.6, stockAnnualizedReturn: 0.11, stockTerminalPrice: 100 * 1.11 ** 5, qqqAnnualizedReturn: 0.1, rationale: "Base case" },
      { name: "Bull", benchmarkScenario: "Bull", probability: 0.2, stockAnnualizedReturn: 0.2, stockTerminalPrice: 100 * 1.2 ** 5, qqqAnnualizedReturn: 0.2, rationale: "Both compound equally" },
    ] };
}
function draft(forecasts = [forecast()], sleeve: RankingDraft["sleeve"] = "core"): RankingDraft {
  return rankingDraftSchema.parse({ schemaVersion: "qqq-top50/v1", sleeve, asOf: "2026-10-07T20:00:00Z", horizonYears: 5, returnBasis: "price-only", benchmark: "QQQ",
    benchmarkAsOf: "2026-10-07T20:00:00Z", benchmarkPrice: 750, benchmarkEvidenceUrls: ["https://www.invesco.com/qqq"],
    benchmarkScenarios: forecast().scenarios.map((s) => ({ name: s.name, probability: s.probability, annualizedReturn: s.qqqAnnualizedReturn, rationale: s.rationale })),
    methodology: "Matched subjective joint scenarios", forecasts });
}
function publication(forecasts = [forecast()], sleeve: RankingDraft["sleeve"] = "core"): RankingPublication {
  const d = draft(forecasts, sleeve);
  const contentHash = createHash("sha256").update(JSON.stringify(d)).digest("hex");
  return rankingPublicationSchema.parse({ draft: d, author: "investment-underwriter",
    review: { taskId: "t_00000001", runId: "1", actor: "evidence-risk-reviewer", contentHash, reviewedAt: "2026-10-07T20:30:00Z", verdict: "PASS" },
    approval: { taskId: "t_00000002", runId: "2", actor: "north-star-pm", contentHash, reviewedAt: "2026-10-07T21:00:00Z", decision: "APPROVE RANKING PUBLICATION" } });
}

function authorities(pubs: RankingPublication[]) {
  return pubs.flatMap((p) => [p.review, p.approval].map((r) => ({ taskId: r.taskId, runId: r.runId, actor: r.actor,
    taskStatus: "done", runStatus: "done", runOutcome: "completed", recordedAt: r.reviewedAt,
    startedAt: Date.parse(r.reviewedAt) / 1000 - 60, endedAt: Date.parse(r.reviewedAt) / 1000 + 60,
    contentHash: r.contentHash, decision: "verdict" in r ? r.verdict : r.decision })));
}

describe("QQQ likelihood rankings", () => {
  it("sums joint outperforming scenario weights and excludes ties", () => {
    expect(forecastMetrics(forecast()).probabilityBeatQqq).toBeCloseTo(0.6);
  });
  it("orders by likelihood even when expected returns and the old hurdles prefer another company", () => {
    const lowIrr = forecast("SAFE");
    lowIrr.scenarios[1]!.stockAnnualizedReturn = 0.105;
    const highIrr = forecast("RISK");
    highIrr.scenarios[1]!.stockAnnualizedReturn = 0.09;
    highIrr.scenarios[2]!.stockAnnualizedReturn = 2;
    const rows = rankForecasts([highIrr, lowIrr]);
    expect(rows.map((r) => r.ticker)).toEqual(["SAFE", "RISK"]);
    expect(rows[0]!.expectedAnnualizedReturn).toBeLessThan(0.12);
    expect(rows[1]!.expectedAnnualizedReturn).toBeGreaterThan(rows[0]!.expectedAnnualizedReturn);
  });
  it("retains all 50 ranks without creating top-ten or watchlist lanes; ties are alphabetical", () => {
    const forecasts = Array.from({ length: 60 }, (_, i) => forecast(`A${String(i).padStart(2, "0")}`));
    const rows = rankForecasts(forecasts.reverse());
    expect(rows).toHaveLength(50);
    expect(rows[0]).toMatchObject({ ticker: "A00", rank: 1 });
    expect(rows[49]).toMatchObject({ ticker: "A49", rank: 50 });
    expect(rows.some((r) => "lane" in r)).toBe(false);
  });
  it("keeps both sleeves independent and permits a shared company", () => {
    const pubs = [publication(), publication([forecast()], "ai-regime")];
    expect(buildSleeveRanking("core", pubs, [], now).rows).toHaveLength(1);
    expect(buildSleeveRanking("ai-regime", pubs, [], now).rows).toHaveLength(1);
  });
  it("leaves missing probabilities unranked and deduplicates exchange aliases", () => {
    const ranking = buildSleeveRanking("core", [], [{ ticker: "ABC", companyName: null, thesis: null, nextAction: null }, { ticker: "NAS:ABC", companyName: null, thesis: null, nextAction: null }], now);
    expect(ranking.rows).toEqual([]);
    expect(ranking.missingSlots).toBe(50);
    expect(ranking.candidates).toHaveLength(1);
  });
  it("withholds stale models/prices and future-approved publications", () => {
    const f = forecast(); f.modelAsOf = "2026-08-01T20:00:00Z";
    const ranking = buildSleeveRanking("core", [publication([f])], [], now);
    expect(ranking.rows).toEqual([]);
    expect(ranking.stale).toHaveLength(1);
    expect(buildSleeveRanking("core", [publication()], [], "2026-10-07T20:45:00Z").rows).toEqual([]);
  });
  it("rejects duplicates, incomplete or malformed probabilities and unlike benchmark bases", () => {
    const alias = forecast("NAS:ABC"); alias.securityId = forecast().securityId;
    expect(() => draft([forecast(), alias])).toThrow();
    const d = draft();
    expect(rankingDraftSchema.safeParse({ ...d, horizonYears: 10 }).success).toBe(false);
    expect(rankingDraftSchema.safeParse({ ...d, returnBasis: "total-return" }).success).toBe(false);
    d.forecasts[0]!.scenarios[0]!.probability = 0.3;
    expect(rankingDraftSchema.safeParse(d).success).toBe(false);
    d.forecasts[0] = forecast(); d.forecasts[0]!.priceAsOf = "2026-10-06T20:00:00Z";
    expect(rankingDraftSchema.safeParse(d).success).toBe(false);
    d.forecasts[0] = forecast(); d.forecasts[0]!.scenarios[1]!.qqqAnnualizedReturn = 0.01;
    expect(rankingDraftSchema.safeParse(d).success).toBe(false);
  });
  it("rejects terminal prices that do not reproduce the five-year return", () => {
    const d = draft();
    d.forecasts[0]!.scenarios[1]!.stockTerminalPrice = 999;
    expect(rankingDraftSchema.safeParse(d).success).toBe(false);
  });
  it("requires distinct reviewers, exact hash and temporal ordering", () => {
    const p = publication();
    expect(rankingPublicationSchema.safeParse({ ...p, author: p.review.actor }).success).toBe(false);
    expect(rankingPublicationSchema.safeParse({ ...p, approval: { ...p.approval, contentHash: "0".repeat(64) } }).success).toBe(false);
    expect(rankingPublicationSchema.safeParse({ ...p, approval: { ...p.approval, reviewedAt: "2026-10-07T20:00:00Z" } }).success).toBe(false);
    expect(loadReviewedRankings([p], authorities([p]))).toHaveLength(1);
    p.draft.forecasts[0]!.thesis = "Changed after review";
    expect(() => loadReviewedRankings([p], authorities([p]))).toThrow(/differs/);
  });
  it("requires one same-date numeric forecast for a shared stock across sleeves", () => {
    const core = publication();
    const aiForecast = forecast(); aiForecast.scenarios[1]!.stockAnnualizedReturn = 0.05; aiForecast.scenarios[1]!.stockTerminalPrice = 100 * 1.05 ** 5;
    aiForecast.modelAsOf = "2026-10-07T20:00:00Z";
    const ai = publication([aiForecast], "ai-regime");
    expect(() => loadReviewedRankings([core, ai], authorities([core, ai]))).toThrow(/conflicting/);
  });
  it("binds runtime approvals to completed Hermes authority readbacks and exact roles", () => {
    const p = publication();
    expect(() => loadReviewedRankings([p], [])).toThrow(/authority readback/);
    expect(rankingPublicationSchema.safeParse({ ...p, review: { ...p.review, actor: "Evidence-Risk-Reviewer" } }).success).toBe(false);
    expect(rankingPublicationSchema.safeParse({ ...p, review: { ...p.review, runId: "01" } }).success).toBe(false);
  });
  it("uses security identities for aliases while retaining distinct exchange instruments", () => {
    const nas = forecast("NAS:ABC"), asx = forecast("ASX:ABC");
    expect(draft([nas, asx]).forecasts).toHaveLength(2);
    asx.securityId = nas.securityId;
    expect(() => draft([nas, asx])).toThrow();
  });
  it("requires one comparator even if sleeve timestamps differ", () => {
    const core = publication(), ai = publication([forecast()], "ai-regime");
    ai.draft.benchmarkAsOf = "2026-10-07T19:59:59Z";
    ai.draft.forecasts[0]!.priceAsOf = ai.draft.benchmarkAsOf;
    expect(() => assertSharedForecastConsistency([core, ai], now)).toThrow(/exact QQQ benchmark/);
  });
  it("selects a later approved correction and excludes inactive future publications from consistency", () => {
    const old = publication(), correction = publication();
    correction.approval.reviewedAt = "2026-10-07T21:30:00Z";
    correction.draft.forecasts[0]!.thesis = "Corrected";
    expect(buildSleeveRanking("core", [old, correction], [], now).rows[0]!.thesis).toBe("Corrected");
    const future = publication([forecast()], "ai-regime");
    future.draft.benchmarkPrice = 1;
    future.approval.reviewedAt = "2026-10-08T21:30:00Z";
    expect(() => assertSharedForecastConsistency([old, future], now)).not.toThrow();
  });
  it("orders unequal probabilities before display rounding and rejects overflowed prices", () => {
    const low = forecast("AAA"), high = forecast("ZZZ");
    high.scenarios[1]!.probability += 1e-13; high.scenarios[0]!.probability -= 1e-13;
    expect(rankForecasts([low, high])[0]!.ticker).toBe("ZZZ");
    const f = forecast(); f.currentPrice = 1e308;
    expect(rankingDraftSchema.safeParse({ ...draft(), forecasts: [f] }).success).toBe(false);
  });

});

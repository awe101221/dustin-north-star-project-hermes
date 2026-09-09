import { describe, expect, it } from "vitest";
import { forecastLadderCreate, forecastMisses, marketObservation, ladderMetrics, type LadderEvaluation } from "./forecast-ladder";
import { parseAdjustedPrices, secObservation, createEvidenceProvider, gradeDueLadders } from "./forecast-evidence";
import { assertLadderRanking } from "./forecast-ranking";

import { ladderFixture } from "./test-fixtures/forecast-ladder";
describe("forecast ladder contracts", () => {
  it("requires all horizons, exact provenance, references and safe source URLs", () => {
    const f = ladderFixture();
    expect(forecastLadderCreate.safeParse(f).success).toBe(true);
    expect(forecastLadderCreate.safeParse({ ...f, market_90d: undefined }).success).toBe(false);
    expect(forecastLadderCreate.safeParse({ ...f, market_90d: { ...f.market_90d, probability: 60 } }).success).toBe(false);
    expect(forecastLadderCreate.safeParse({ ...f, market_90d: { ...f.market_90d, assumption_ids: ["invented"] } }).success).toBe(false);
    for (const url of ["http://www.sec.gov/a", "https://localhost/a", "https://www.sec.gov/a?apikey=secret", "https://user:pass@www.sec.gov/a"]) {
      expect(forecastLadderCreate.safeParse({ ...f, market_90d: { ...f.market_90d, evidence_urls: [url] } }).success).toBe(false);
    }
  });
  it("requires forecast decisions to match the whole published ranking", () => {
    const f = ladderFixture();
    expect(() => assertLadderRanking({ topTen: [{ ticker: "MELI", qqqLine: "above" }], watchlistTen: [], forecastLadders: [f] })).not.toThrow();
    expect(() => assertLadderRanking({ topTen: [{ ticker: "MELI", qqqLine: "below" }], watchlistTen: [], forecastLadders: [f] })).toThrow();
  });
});
describe("authoritative outcome extraction", () => {
  it("uses common forward sessions and keeps raw endpoints for audit", () => {
    expect(marketObservation({ "2026-01-05": 100, "2026-04-06": 120 }, { "2026-01-05": 100, "2026-04-06": 110 }, "2026-01-03", "2026-04-04", "2026-04-07")).toMatchObject({ stock_start: 100, stock_end: 120, qqq_start: 100, qqq_end: 110, start_date: "2026-01-05" });
  });
  it("refuses stale, missing, intraday, invalid, and extreme prices", () => {
    const s = { "2026-01-05": 100, "2026-04-06": 120 };
    expect(() => marketObservation(s, s, "2025-12-01", "2026-04-04", "2026-04-07")).toThrow();
    expect(() => marketObservation(s, s, "2026-01-03", "2026-04-04", "2026-04-06")).toThrow();
    expect(() => marketObservation(s, {}, "2026-01-03", "2026-04-04", "2026-04-07")).toThrow();
    expect(() => marketObservation({ ...s, "2026-04-06": 10000 }, s, "2026-01-03", "2026-04-04", "2026-04-07")).toThrow();
    expect(() => parseAdjustedPrices({ Note: "rate limit" }, "MELI")).toThrow();
    expect(() => parseAdjustedPrices({ "Meta Data": { "2. Symbol": "MELI" }, "Time Series (Daily)": { "2026-01-01": { "4. close": 100 } } }, "MELI")).toThrow();
  });
  it("uses exact SEC period/unit and earliest non-amended filing, not YTD or restatement", () => {
    const contract = ladderFixture().operating;
    if (contract.kind !== "sec_kpi") throw new Error();
    const original = { start: contract.period_start, end: contract.period_end, filed: contract.due_date, val: 110, form: "10-Q", accn: "0000000001-26-000001" };
    const raw = { cik: 1, facts: { "us-gaap": { Revenues: { units: { USD: [original, { ...original, form: "10-Q/A", val: 90 }, { ...original, start: "2020-01-01", val: 500 }] } } } } };
    expect(secObservation(raw, contract, contract.due_date).observation.value).toBe(110);
    expect(() => secObservation({ ...raw, cik: 2 }, contract, contract.due_date)).toThrow();
    expect(() => secObservation(raw, { ...contract, unit: "EUR" }, contract.due_date)).toThrow();
  });
  it("pending providers never persist an outcome", async () => {
    const f = { id: "one", ticker: "MELI", horizon: "90d", due_date: "2020-01-01", outcome_id: null } as LadderEvaluation;
    const results = await gradeDueLadders([f], createEvidenceProvider({}), async () => { throw new Error("Must not write"); });
    expect(results[0]!.status).toBe("pending");
    expect(results[0]!.reason).toContain("not configured");
  });
  it("never mixes horizons or models for calibration", () => {
    const base = { horizon: "90d", agent_name: "hermes", prompt_id: "refresh", prompt_version: "1", model_version: "a", outcome_id: "out", hit: false, brier: .81, alpha: -.1, contract: { probability: .9 } } as LadderEvaluation;
    const groups = ladderMetrics([base, { ...base, model_version: "b", outcome_id: null }, { ...base, horizon: "12m" }]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ n: 1, accuracy: 0, alpha: -.1, brier: .81 });
    expect(groups[1]!.alpha).toBeNull();
    expect(groups[0]!.bins[4]).toMatchObject({ n: 1, predicted: .9, observed: 0 });
  });
  it("assigns probability boundaries to exactly one calibration bin", () => {
    const rows = [0, .2, .4, .6, .8, 1].map((probability) => ({ horizon: "90d", agent_name: "hermes", prompt_id: "refresh", prompt_version: "1", model_version: "a", outcome_id: "out", hit: true, brier: 0, alpha: 0, absolute_error: 0, contract: { probability } } as LadderEvaluation));
    expect(ladderMetrics(rows)[0]!.bins.map((b) => b.n)).toEqual([1, 1, 1, 1, 2]);
  });
  it("does not call correctly anticipated QQQ underperformance a forecasting error", () => {
    const correct = { outcome_id: "out", hit: false, alpha: -.05, absolute_error: 0, brier: .16, contract: { probability: .4 } } as LadderEvaluation;
    expect(forecastMisses([correct])).toHaveLength(0);
    expect(forecastMisses([{ ...correct, contract: { ...correct.contract, probability: .8 } }])).toHaveLength(1);
    expect(forecastMisses([{ ...correct, absolute_error: .2 }])).toHaveLength(1);
  });
});

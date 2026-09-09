import { describe, expect, it, vi } from "vitest";
import { createGuruFocusPriceProvider, parseGuruFocusPrices } from "./providers/gurufocus-prices";
import { MARKET_POLICY_VERSION, priceReturnEvidence, type HistoricalPrices, type HistoricalPriceProvider } from "./market-price-provider";
import { isMarketSession, previousCompletedSession } from "./market-calendar";
import { createEvidenceProvider, gradeDueLadders } from "./forecast-evidence";
import { ladderMetrics, marketObservation, type LadderEvaluation } from "./forecast-ladder";

const now = new Date("2026-09-09T12:00:00Z");
const start = "2026-06-08", due = "2026-09-08";
const raw = [["06-08-2026", 100], ["09-08-2026", 120]];
const leg = (symbol: string): HistoricalPrices => ({ provider: "licensed-test", symbol, currency: "USD", adjustment_basis: "split-adjusted",
  return_basis: "price-return", retrieved_at: now.toISOString(), source_date: due,
  source_url: `https://example.com/${symbol}`, endpoint: "/history/{symbol}", prices: { [start]: 100, [due]: symbol === "QQQ" ? 110 : 120 } });
const forecast = { id: "one", ticker: "MELI", horizon: "90d", start_date: start, due_date: due,
  measurement_policy: MARKET_POLICY_VERSION, outcome_id: null } as LadderEvaluation;
const adapter = (mutate: (v: HistoricalPrices) => HistoricalPrices = (v) => v): HistoricalPriceProvider =>
  ({ name: "licensed-test", history: async (symbol) => mutate(leg(symbol)) });

describe("licensed GuruFocus historical prices", () => {
  it("parses only the verified MM-DD-YYYY tuple contract and never substitutes unadjusted values", () => {
    expect(parseGuruFocusPrices(raw)).toEqual({ [start]: 100, [due]: 120 });
    for (const bad of [[], {}, { error: "limit" }, [["2026-09-08", 120]], [["02-30-2026", 1]], [["09-08-2026", null]],
      [["09-08-2026", "120"]], [["09-08-2026", -1]], [["09-08-2026", Infinity]], [...raw, raw[1]],
      [{ date: due, unadjusted_close: 120 }]]) expect(() => parseGuruFocusPrices(bad)).toThrow();
  });
  it("uses only the licensed endpoint, caches per sweep, and redacts request credentials from evidence", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(raw)));
    const provider = createGuruFocusPriceProvider("private-key", request, () => now);
    const result = await priceReturnEvidence(provider, "MELI", start, due, now);
    await provider.history("QQQ", "2026-09-09");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]![0]).toBe("https://api.gurufocus.com/public/user/private-key/stock/MELI/price");
    expect(request.mock.calls[0]![1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(JSON.stringify(result)).not.toContain("private-key");
    expect(result.observation.stock).toMatchObject({ retrieved_at: now.toISOString(), source_date: due, start_source_date: start,
      end_source_date: due, adjustment_basis: "split-adjusted", provider: "gurufocus" });
    expect(result.observation.stock).not.toHaveProperty("prices");
  });
  it("leaves unauthorized, rate-limited, unavailable and malformed responses pending without fallback or leaking keys", async () => {
    for (const response of [new Response("{}", { status: 401 }), new Response("{}", { status: 429 }), new Response("private-key")]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(createGuruFocusPriceProvider("private-key", request).history("MELI", "2026-09-09")).rejects.not.toThrow(/private-key/);
      expect(request).toHaveBeenCalledTimes(1);
    }
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("fetch https://private-key"));
    await expect(createGuruFocusPriceProvider("private-key", request).history("MELI", "2026-09-09")).rejects.toThrow("keep pending");
    expect(request).toHaveBeenCalledTimes(1);
    await expect(createGuruFocusPriceProvider(undefined, request).history("MELI", "2026-09-09")).rejects.toThrow("not configured");
    await expect(createGuruFocusPriceProvider("key", request).history("HKSE:0700", "2026-09-09")).rejects.toThrow("Ambiguous");
  });
});
describe("provider-neutral price-return policy", () => {
  it("accepts a different licensed adapter without changing grading logic", async () => {
    const persist = vi.fn().mockResolvedValue("saved");
    const result = await gradeDueLadders([forecast], createEvidenceProvider({ prices: adapter() }, fetch, () => now), persist, "2026-09-09");
    expect(result[0]!.status).toBe("graded");
    expect(persist.mock.calls[0]![1]).toMatchObject({ stock_start: 100, stock_end: 120, qqq_start: 100, qqq_end: 110,
      provider: "licensed-test", return_basis: "price-return", policy_version: MARKET_POLICY_VERSION });
  });
  it("never persists mismatched bases, identities, stale retrievals or stale source dates", async () => {
    for (const change of [{ provider: "other" }, { symbol: "OTHER" }, { currency: "EUR" }, { adjustment_basis: "split-and-dividend-adjusted" },
      { return_basis: "total-return" }, { source_date: "2026-09-04" }, { retrieved_at: "2026-09-07T12:00:00Z" },
      { retrieved_at: "invalid" }, { retrieved_at: "2026-09-10T12:00:00Z" }, { source_url: "https://example.com/a?apikey=secret" }]) {
      const prices = adapter((v) => v.symbol === "MELI" ? { ...v, ...change } as HistoricalPrices : v);
      const persist = vi.fn();
      expect((await gradeDueLadders([forecast], createEvidenceProvider({ prices }, fetch, () => now), persist, "2026-09-09"))[0]!.status).toBe("pending");
      expect(persist).not.toHaveBeenCalled();
    }
  });
  it("does not silently shift missing endpoints, weekends, holidays, or unknown calendar years", () => {
    const s = { [start]: 100, [due]: 120, "2026-09-07": 119 };
    for (const date of ["2026-09-07", "2026-09-06", "2026-09-04", "2029-09-10", "2026-02-30"]) {
      expect(() => marketObservation(s, s, start, date, "2030-01-01")).toThrow();
    }
    expect(previousCompletedSession("2026-09-08")).toBe("2026-09-04");
    expect(isMarketSession("2027-12-31")).toBe(true);
    expect(isMarketSession("2026-11-27")).toBe(true); // Early close still a completed session.
    expect(isMarketSession("2028-04-14")).toBe(false);
  });
  it("separates measurement-policy cohorts and requires explicit adoption", async () => {
    await expect(createEvidenceProvider({ prices: adapter() }, fetch, () => now)({ ...forecast, measurement_policy: null }, "2026-09-09")).rejects.toThrow("policy not bound");
    const f = { ...forecast, contract: { probability: .6 }, observation: null } as LadderEvaluation;
    expect(ladderMetrics([f, { ...f, measurement_policy: "legacy-adjusted" }])).toHaveLength(2);
  });
});

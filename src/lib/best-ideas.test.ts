import { describe, expect, it } from "vitest";
import { buildBestIdeas, HERMES_BEST_IDEAS_MANDATE, type BestIdeaInput } from "./best-ideas";

function idea(overrides: Partial<BestIdeaInput> & { ticker: string }): BestIdeaInput {
  return {
    id: overrides.id ?? overrides.ticker,
    ticker: overrides.ticker,
    symbol: overrides.symbol ?? overrides.ticker.replace(/^.*:/, ""),
    companyName: overrides.companyName ?? `${overrides.ticker} Inc`,
    stage: overrides.stage ?? "diligence",
    conviction: overrides.conviction ?? 70,
    risk: overrides.risk ?? 35,
    targetWeight: overrides.targetWeight ?? null,
    currentWeight: overrides.currentWeight ?? null,
    thesis: "thesis" in overrides ? overrides.thesis ?? null : `Hermes thesis for ${overrides.ticker}`,
    whyBeatQqq: "whyBeatQqq" in overrides ? overrides.whyBeatQqq ?? null : `${overrides.ticker} can compound faster than QQQ because Hermes sees a durable edge.`,
    falsifier: "falsifier" in overrides ? overrides.falsifier ?? null : "QQQ is better if the edge fails to translate into durable growth.",
    catalyst: overrides.catalyst ?? null,
    nextAction: overrides.nextAction ?? "Refresh evidence and compare to QQQ.",
    persona: overrides.persona ?? "hermes-pm",
    theme: overrides.theme ?? "compounders",
    tags: overrides.tags ?? ["hermes-ranked"],
    updatedAt: overrides.updatedAt ?? "2026-09-07T12:00:00.000Z",
  };
}

describe("best ideas ranking", () => {
  it("centers the app mandate on Hermes-ranked ideas intended to beat QQQ over 10 years", () => {
    expect(HERMES_BEST_IDEAS_MANDATE).toContain("Hermes-ranked");
    expect(HERMES_BEST_IDEAS_MANDATE).toContain("beat QQQ over 10 years");
  });

  it("builds a Top 10 and Watchlist 10 from active Hermes research, excluding archived ideas", () => {
    const ranked = buildBestIdeas([
      idea({ ticker: "ARCH", stage: "archive", conviction: 100, risk: 1 }),
      ...Array.from({ length: 24 }, (_, idx) =>
        idea({
          ticker: `T${String(idx + 1).padStart(2, "0")}`,
          conviction: 95 - idx,
          risk: idx < 12 ? 15 : 45,
          stage: idx % 3 === 0 ? "live" : idx % 3 === 1 ? "diligence" : "monitor",
          targetWeight: idx < 10 ? 0.03 : 0.01,
          updatedAt: `2026-09-${String(24 - idx).padStart(2, "0")}T12:00:00.000Z`,
        }),
      ),
    ]);

    expect(ranked.topTen).toHaveLength(10);
    expect(ranked.watchlistTen).toHaveLength(10);
    expect(ranked.topTen.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ranked.watchlistTen.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...ranked.topTen, ...ranked.watchlistTen].map((x) => x.ticker)).not.toContain("ARCH");
    expect(new Set([...ranked.topTen, ...ranked.watchlistTen].map((x) => x.ticker)).size).toBe(20);
  });

  it("ranks stronger QQQ-relative ideas ahead of high-risk or incomplete ideas", () => {
    const ranked = buildBestIdeas([
      idea({ ticker: "HIGH_RISK", conviction: 99, risk: 95, whyBeatQqq: "Can win, but the drawdown/falsifier risk is severe." }),
      idea({ ticker: "NO_QQQ_CASE", conviction: 96, risk: 10, whyBeatQqq: null }),
      idea({ ticker: "BEST", conviction: 91, risk: 15, whyBeatQqq: "Clear evidence-backed reason this can beat QQQ over a decade.", falsifier: "QQQ is better if moat compression shows up in renewal rates." }),
    ]);

    expect(ranked.topTen[0]?.ticker).toBe("BEST");
    expect(ranked.topTen[0]?.score).toBeGreaterThan(ranked.topTen[1]?.score ?? 0);
    expect(ranked.lastUpdated).toBe("2026-09-07T12:00:00.000Z");
  });
});

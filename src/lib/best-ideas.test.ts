import { describe, expect, it } from "vitest";
import {
  buildBestIdeas,
  HERMES_BEST_IDEAS_MANDATE,
  normalizeBestIdeasSnapshot,
  snapshotMetadataToDashboard,
  type BestIdeaInput,
} from "./best-ideas";

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

  it("accepts a fresh Hermes-authored snapshot as the first-class ranked source", () => {
    const snapshot = normalizeBestIdeasSnapshot({
      asOf: "2026-09-07T16:45:00.000Z",
      thesis: "Hermes updated the list from fresh chat research and QQQ-relative review.",
      topTen: [
        {
          ticker: "NVDA",
          companyName: "NVIDIA",
          thesis: "Infrastructure leader still compounds if inference demand broadens.",
          whyBeatQqq: "Direct AI infrastructure exposure can outgrow the index basket.",
          falsifier: "QQQ is better if margins normalize faster than revenue growth.",
          nextAction: "Refresh valuation and customer concentration evidence.",
          conviction: 92,
          risk: 42,
          theme: "ai-infrastructure",
        },
      ],
      watchlistTen: [
        {
          ticker: "TSM",
          thesis: "Foundry bottleneck candidate needs geopolitical risk sizing.",
          whyBeatQqq: "AI capex breadth accrues to leading-edge wafer share.",
          falsifier: "QQQ is better if Taiwan risk dominates the upside.",
          conviction: 84,
          risk: 55,
        },
      ],
    });

    expect(snapshot.asOf).toBe("2026-09-07T16:45:00.000Z");
    expect(snapshot.topTen[0]?.rank).toBe(1);
    expect(snapshot.topTen[0]?.scoreLabel).toBe("92");
    expect(snapshot.topTen[0]?.lane).toBe("top-ten");
    expect(snapshot.watchlistTen[0]?.lane).toBe("watchlist");
    expect(snapshot.topTen[0]?.source).toBe("hermes-snapshot");
  });

  it("turns the latest best-ideas note metadata into the dashboard before falling back to idea-table scoring", () => {
    const dashboard = snapshotMetadataToDashboard({
      bestIdeas: {
        asOf: "2026-09-07T16:45:00.000Z",
        thesis: "Hermes current view.",
        topTen: [{ ticker: "APP", thesis: "Adtech compounding candidate", whyBeatQqq: "Faster growth than QQQ", falsifier: "QQQ wins if signal quality fades", conviction: 88, risk: 46 }],
        watchlistTen: [{ ticker: "MELI", thesis: "Latin America compounder", whyBeatQqq: "Regional fintech/ecommerce exposure", falsifier: "QQQ wins if FX and credit cycle dominate", conviction: 82, risk: 52 }],
      },
    });

    expect(dashboard?.sourceMode).toBe("hermes-snapshot");
    expect(dashboard?.lastUpdated).toBe("2026-09-07T16:45:00.000Z");
    expect(dashboard?.topTen[0]?.ticker).toBe("APP");
    expect(dashboard?.watchlistTen[0]?.ticker).toBe("MELI");
    expect(snapshotMetadataToDashboard({})).toBeNull();
  });
});

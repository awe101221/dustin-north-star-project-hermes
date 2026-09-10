import { describe, expect, it, vi } from "vitest";
import {
  buildBestIdeas,
  buildRevisitIdeas,
  getBestIdeasDashboard,
  snapshotToDashboard,
  getQqqLineInSand,
  HERMES_BEST_IDEAS_MANDATE,
  normalizeBestIdeasSnapshot,
  snapshotMetadataToDashboard,
  type BestIdeaInput,
} from "./best-ideas";
import type { Db } from "./db/query";

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

  it("draws a movable QQQ line in the sand from explicit snapshot fields", () => {
    const dashboard = snapshotMetadataToDashboard({
      bestIdeas: {
        asOf: "2026-09-07T19:54:44.000Z",
        thesis: "Modeled refresh with daily price updates.",
        topTen: [
          { ticker: "MELI", thesis: "Modeled upside", whyBeatQqq: "Probability-weighted return can beat QQQ.", falsifier: "QQQ wins if growth slows.", conviction: 91, risk: 48, qqqLine: "above", qqqLineReason: "PW 5y IRR clears the 12% QQQ hurdle." },
          { ticker: "TSM", thesis: "Great company, expensive stock", whyBeatQqq: "Bull case can beat QQQ.", falsifier: "QQQ wins if valuation compresses.", conviction: 77, risk: 64, qqqLine: "below", qqqLineReason: "Base/PW model does not clear the QQQ hurdle today." },
        ],
        watchlistTen: [
          { ticker: "VRT", thesis: "AI power beneficiary", whyBeatQqq: "Backlog could surprise.", falsifier: "QQQ wins if valuation already prices it.", conviction: 74, risk: 72, qqqLine: "below" },
        ],
      },
    });

    expect(dashboard?.topTen[0]?.qqqLine).toBe("above");
    expect(dashboard?.topTen[1]?.qqqLine).toBe("below");
    const line = getQqqLineInSand(dashboard!);
    expect(line.hurdleLabel).toBe("12% modeled 5y IRR hurdle");
    expect(line.above.map((x) => x.ticker)).toEqual(["MELI"]);
    expect(line.below.map((x) => x.ticker)).toEqual(["TSM", "VRT"]);
    expect(line.firstBelow?.ticker).toBe("TSM");
    expect(line.lastPriceRefresh).toBe("2026-09-07T19:54:44.000Z");
  });
});

function snapshot(day: number, topTen: string[], watchlistTen: string[] = []) {
  return snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: new Date(Date.UTC(2026, 0, day)).toISOString(),
    topTen: topTen.map((ticker) => ({ ticker, thesis: `Thesis ${day}: ${ticker}`, nextAction: `Review ${ticker}` })),
    watchlistTen: watchlistTen.map((ticker) => ({ ticker })),
  }), `snapshot-${day}`);
}

describe("former 10 + 10 revisit history", () => {
  it("retains departures from both lanes with their last rank, thesis and exit date", () => {
    const old = snapshot(1, ["MU", "META"], ["ASML"]);
    const next = snapshot(2, ["META"], ["TSM"]);
    const entries = buildRevisitIdeas([next, old]);
    expect(entries.map(({ idea }) => idea.ticker)).toEqual(["ASML", "MU"]);
    expect(entries.find(({ idea }) => idea.ticker === "MU")).toMatchObject({
      idea: { rank: 1, lane: "top-ten", thesis: "Thesis 1: MU", nextAction: "Review MU" },
      removedAt: next.lastUpdated,
      lastSnapshotId: old.snapshotId,
    });
    expect(entries[0]?.idea.lane).toBe("watchlist");
  });

  it("does not retire lane moves or equivalent exchange-prefixed tickers", () => {
    expect(buildRevisitIdeas([snapshot(2, ["ASML"], ["NAS:MU"]), snapshot(1, ["mu"], ["ASML"])])).toEqual([]);
  });

  it("removes re-entries and records the newest departure after a second exit", () => {
    const history = [snapshot(3, [], ["MU"]), snapshot(2, ["META"]), snapshot(1, ["MU"])];
    expect(buildRevisitIdeas(history).map(({ idea }) => idea.ticker)).toEqual(["META"]);
    const later = buildRevisitIdeas([snapshot(5, ["META"]), snapshot(4, ["MU"]), ...history]);
    expect(later).toHaveLength(1);
    expect(later[0]).toMatchObject({ idea: { ticker: "MU", thesis: "Thesis 4: MU", lane: "top-ten" }, removedAt: snapshot(5, []).lastUpdated, lastSnapshotId: "snapshot-4" });
  });

  it("keeps old departures through unchanged refreshes without adding never-ranked companies", () => {
    const entries = buildRevisitIdeas([snapshot(4, ["META"]), snapshot(3, ["META"]), snapshot(2, ["META"]), snapshot(1, ["MU"])]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.removedAt).toBe(snapshot(2, []).lastUpdated);
    expect(buildRevisitIdeas([snapshot(1, ["MU"])])).toEqual([]);
    expect(buildBestIdeas([idea({ ticker: "ARCH", stage: "archive" })]).revisit).toEqual([]);
  });

  function database(history: ReturnType<typeof snapshot>[], failPage = -1) {
    const rows = history.map((entry) => ({ id: entry.snapshotId, metadata: { bestIdeas: { asOf: entry.lastUpdated, topTen: entry.topTen, watchlistTen: entry.watchlistTen } } }));
    const query = {
      select: vi.fn().mockReturnThis(), contains: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows.slice(0, 1), error: null }),
      range: vi.fn((from: number, to: number) => Promise.resolve(from === failPage
        ? { data: null, error: { message: "History unavailable", code: "NETWORK" } }
        : { data: rows.slice(from, to + 1), error: null })),
    };
    return { db: { from: vi.fn(() => query) } as unknown as Db, query };
  }

  it("loads past the first history page so long-absent companies stay visible", async () => {
    const history = Array.from({ length: 102 }, (_, index) => snapshot(102 - index, index === 101 ? ["MU"] : ["META"]));
    const { db, query } = database(history);
    const dashboard = await getBestIdeasDashboard(db);
    expect(query.range.mock.calls).toEqual([[0, 99], [100, 199]]);
    expect(dashboard.topTen[0]?.ticker).toBe("META");
    expect(dashboard.revisit[0]?.idea.ticker).toBe("MU");
    expect(dashboard.revisitError).toBeNull();
  });

  it("keeps current rankings and shows a history error instead of a partial or empty success", async () => {
    const { db } = database([snapshot(2, ["META"]), snapshot(1, ["MU"])], 0);
    const dashboard = await getBestIdeasDashboard(db);
    expect(dashboard.topTen[0]?.ticker).toBe("META");
    expect(dashboard.revisit).toEqual([]);
    expect(dashboard.revisitError).toContain("could not be loaded");
  });
});

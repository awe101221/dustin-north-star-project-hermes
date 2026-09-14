import { describe, expect, it } from "vitest";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import { buildChallengerBoard } from "@/lib/challengers";

function idea(overrides: Partial<Idea> & Pick<Idea, "ticker">): Idea {
  const ticker = overrides.ticker;
  return {
    id: overrides.id ?? `idea-${ticker}`,
    ticker,
    symbol: overrides.symbol ?? ticker.split(":").pop()!,
    companyName: overrides.companyName ?? `${ticker} Company`,
    stage: overrides.stage ?? "sourcing",
    sortOrder: overrides.sortOrder ?? 0,
    conviction: overrides.conviction ?? 70,
    risk: overrides.risk ?? 45,
    targetWeight: overrides.targetWeight ?? null,
    currentWeight: overrides.currentWeight ?? null,
    thesis: overrides.thesis ?? "A credible challenger thesis with durable compounding potential.",
    whyBeatQqq: overrides.whyBeatQqq ?? "A lower starting valuation and company-specific growth can beat QQQ.",
    falsifier: overrides.falsifier ?? "QQQ is better if growth and owner earnings fail to compound.",
    catalyst: overrides.catalyst ?? "An earnings and margin inflection can close the gap.",
    nextAction: overrides.nextAction ?? "Complete the independent underwriting chain.",
    persona: overrides.persona ?? "hermes-pm",
    memoId: overrides.memoId ?? null,
    theme: overrides.theme ?? "quality-drawdown",
    tags: overrides.tags ?? ["quality-drawdown"],
    source: overrides.source ?? "screen",
    sourceRef: overrides.sourceRef ?? { url: "https://example.com/source" },
    owner: overrides.owner ?? "hermes",
    archivedReason: overrides.archivedReason ?? null,
    metadata: overrides.metadata ?? {},
    stageChangedAt: overrides.stageChangedAt ?? "2026-09-01T00:00:00Z",
    createdAt: overrides.createdAt ?? "2026-09-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-09-10T00:00:00Z",
  };
}

function dashboard() {
  return snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: "2026-09-10T00:00:00Z",
    topTen: [{ ticker: "NAS:MNDY", modeledReturn: 0.16, score: 84 }],
    watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 71 }],
  }));
}

function challengerMetadata(overrides: Record<string, unknown> = {}) {
  return {
    challenger: {
      discoveryLane: "quality-drawdown",
      expectedIrr: 18,
      requiredIrr: 0.15,
      hurdlePrice: 80,
      currentPrice: 95,
      evidenceGrade: "B",
      portfolioFit: 75,
      modelAsOf: "2026-09-10T00:00:00Z",
      nextEventAt: "2026-10-15T00:00:00Z",
      reviewStatus: "reviewed",
      ...overrides,
    },
  };
}

describe("10 + 10 challenger board", () => {
  it("excludes current members, normalizes returns, deduplicates tickers, and compares the challenger with incumbent floors", () => {
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-14T12:00:00Z",
      ideas: [
        idea({ ticker: "mndy", metadata: challengerMetadata() }),
        idea({ ticker: "NAS:ADBE", id: "older-adbe", updatedAt: "2026-09-08T00:00:00Z", metadata: challengerMetadata() }),
        idea({ ticker: "ADBE", id: "newer-adbe", updatedAt: "2026-09-12T00:00:00Z", metadata: challengerMetadata() }),
      ],
    });

    expect(board.candidates).toHaveLength(1);
    expect(board.candidates[0]).toMatchObject({
      id: "newer-adbe",
      ticker: "ADBE",
      discoveryLane: "quality-drawdown",
      expectedIrr: 0.18,
      requiredIrr: 0.15,
      gateStatus: "clear",
      disposition: "first alternate",
      topTenComparison: "above",
      watchlistComparison: "above",
    });
    expect(board.incumbentFloors).toMatchObject({ topTenTicker: "NAS:MNDY", topTenReturn: 0.16, watchlistTicker: "CRM", watchlistReturn: 0.12 });
  });

  it("fails closed when evidence or return inputs are missing", () => {
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-14T12:00:00Z",
      ideas: [idea({ ticker: "DATA", metadata: challengerMetadata({ expectedIrr: undefined, evidenceGrade: "ungraded" }) })],
    });
    const [candidate] = board.candidates;
    expect(candidate).toMatchObject({ gateStatus: "evidence blocked", disposition: "watch / price trigger" });
    expect(candidate?.missing).toEqual(expect.arrayContaining(["expected IRR", "evidence grade"]));
  });

  it("blocks grade C or D evidence even when every field is present", () => {
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-14T12:00:00Z",
      ideas: [idea({ ticker: "WEAK", metadata: challengerMetadata({ evidenceGrade: "C" }) })],
    });
    const [candidate] = board.candidates;
    expect(candidate).toMatchObject({ gateStatus: "evidence blocked", clearsHurdle: false });
    expect(candidate?.gateReasons).toContain("Evidence must reach grade A or B");
  });

  it("gates stale models and candidates with an imminent or passed event", () => {
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-14T12:00:00Z",
      ideas: [
        idea({ ticker: "STALE", metadata: challengerMetadata({ modelAsOf: "2026-07-01T00:00:00Z" }) }),
        idea({ ticker: "EVENT", metadata: challengerMetadata({ nextEventAt: "2026-09-20T00:00:00Z" }) }),
        idea({ ticker: "PASSED", metadata: challengerMetadata({ nextEventAt: "2026-09-13T00:00:00Z" }) }),
      ],
    });
    expect(board.candidates.find((x) => x.ticker === "STALE")?.gateStatus).toBe("stale model");
    expect(board.candidates.find((x) => x.ticker === "EVENT")?.gateStatus).toBe("pending refresh");
    expect(board.candidates.find((x) => x.ticker === "PASSED")?.gateStatus).toBe("pending refresh");
  });

  it("uses the admission taxonomy without silently admitting a candidate", () => {
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-14T12:00:00Z",
      ideas: [
        idea({ ticker: "OWNED", currentWeight: 0.02, metadata: challengerMetadata() }),
        idea({ ticker: "WATCH", metadata: challengerMetadata({ expectedIrr: 13 }) }),
        idea({ ticker: "REJECT", metadata: challengerMetadata({ expectedIrr: 8 }) }),
        idea({ ticker: "APPROVED", metadata: challengerMetadata({ admissionDecision: "admit", reviewStatus: "pm-approved" }) }),
      ],
    });
    expect(board.candidates.find((x) => x.ticker === "OWNED")?.disposition).toBe("owned-position review");
    expect(board.candidates.find((x) => x.ticker === "WATCH")?.disposition).toBe("watch / price trigger");
    expect(board.candidates.find((x) => x.ticker === "REJECT")?.disposition).toBe("reject");
    expect(board.candidates.find((x) => x.ticker === "APPROVED")?.disposition).toBe("admit");
  });

  it("summarizes source lanes and gates for PM triage", () => {
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-14T12:00:00Z",
      ideas: [
        idea({ ticker: "ONE", metadata: challengerMetadata() }),
        idea({ ticker: "TWO", tags: ["estimate-inflection"], metadata: challengerMetadata({ discoveryLane: "estimate-inflection", expectedIrr: 13 }) }),
      ],
    });
    expect(board.summary).toMatchObject({ total: 2, clearsHurdle: 1, firstAlternates: 1, blocked: 0 });
    expect(board.lanes).toEqual(expect.arrayContaining([
      expect.objectContaining({ lane: "quality-drawdown", count: 1 }),
      expect.objectContaining({ lane: "estimate-inflection", count: 1 }),
    ]));
  });
});

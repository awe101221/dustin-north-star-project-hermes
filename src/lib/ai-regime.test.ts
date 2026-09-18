import { describe, expect, it } from "vitest";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import {
  AI_REGIME_DOMAINS,
  AI_REGIME_MAX_LANE_SIZE,
  AI_REGIME_TOURNAMENT_HURDLE,
  CAPITAL_LINE_HURDLE,
  buildAiRegimeModule,
} from "@/lib/ai-regime";
import { isModelStale } from "@/lib/model-freshness";

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
    thesis: overrides.thesis ?? "A credible AI-regime thesis with forward economics.",
    whyBeatQqq: overrides.whyBeatQqq ?? "Transition economics can beat QQQ from a lower starting multiple.",
    falsifier: overrides.falsifier ?? "QQQ is better if adoption, unit economics, or financing fail.",
    catalyst: overrides.catalyst ?? "Capacity and backlog evidence can close the gap.",
    nextAction: overrides.nextAction ?? "Complete independent underwriting.",
    persona: overrides.persona ?? "ai-regime-analyst",
    memoId: overrides.memoId ?? null,
    theme: overrides.theme ?? "ai-regime",
    tags: overrides.tags ?? ["ai-regime"],
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
    topTen: [{ ticker: "NAS:NVDA", modeledReturn: 0.16, score: 90 }],
    watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 71 }],
  }));
}

function aiRegime(overrides: Record<string, unknown> = {}) {
  return {
    aiRegime: {
      domains: ["direct-ai"],
      exposureType: "direct",
      thesis: "Core software plus evidence-weighted AI transition.",
      hiddenBeneficiaryReason: "Not a hidden beneficiary.",
      valuationArchetype: "core-plus-transition-plus-option",
      themeFit: 0.8,
      monetizationStage: "early-revenue",
      evidenceGrade: "B",
      modelAsOf: "2026-09-10T00:00:00Z",
      nextEventAt: "2026-10-15T00:00:00Z",
      reviewStatus: "reviewed",
      sleeveStatus: "candidate",
      sleeveRank: 1,
      fiveYearExpectedIrr: 0.18,
      tenYearExpectedIrr: 0.16,
      requiredFiveYearIrr: 0.12,
      requiredTournamentFiveYearIrr: 0.15,
      hurdlePrice: 80,
      membershipAuthority: null,
      returnBasis: "five-year-price-only",
      qqqComparisonAsOf: "2026-09-10T00:00:00Z",
      probabilityWeighting: "bear-base-bull",
      dividendsIncluded: false,
      valuationContract: {
        coreBaseValue: true,
        transitionEconomics: true,
        probabilityDiscountedOptionValue: true,
        reverseExpectations: true,
        capexFinancingDilutionDownside: true,
      },
      ...overrides,
    },
  };
}

function moduleFor(ideas: Idea[], now = "2026-09-14T00:00:00Z") {
  return buildAiRegimeModule({ dashboard: dashboard(), ideas, now });
}

describe("AI Regime sleeve module", () => {
  it("renders fail-closed with no approved roster when no reviewed sleeve data exists", () => {
    const result = moduleFor([]);
    expect(result.hasApprovedRoster).toBe(false);
    expect(result.topTen).toEqual([]);
    expect(result.watchlistTen).toEqual([]);
    expect(result.queue).toEqual([]);
    expect(result.tournament).toBeNull();
    expect(result.qqqIsDefault).toBe(true);
    expect(result.emptyState).toBe("No approved sleeve roster yet");
  });

  it("ignores ideas without namespaced metadata.aiRegime and preserves unrelated metadata", () => {
    const custom = { custom: { keep: true }, challenger: { expectedIrr: 0.2 } };
    const result = moduleFor([idea({ ticker: "NAS:FOO", metadata: custom })]);
    expect(result.queue).toEqual([]);
    expect(result.hasApprovedRoster).toBe(false);
    expect(custom).toEqual({ custom: { keep: true }, challenger: { expectedIrr: 0.2 } });
  });

  it("uses a strict five-year Capital Line greater than the effective declared hurdle", () => {
    expect(CAPITAL_LINE_HURDLE).toBe(0.12);
    const atHurdle = moduleFor([idea({ ticker: "NAS:EQ", metadata: aiRegime({ fiveYearExpectedIrr: 0.12 }) })]);
    const above = moduleFor([idea({ ticker: "NAS:AB", metadata: aiRegime({ fiveYearExpectedIrr: 0.1201 }) })]);
    const declared = moduleFor([idea({ ticker: "NAS:HI", metadata: aiRegime({ fiveYearExpectedIrr: 0.18, requiredFiveYearIrr: 0.2 }) })]);
    expect(atHurdle.queue[0]?.metadataMeetsCapitalLine).toBe(false);
    expect(above.queue[0]?.metadataMeetsCapitalLine).toBe(true);
    expect(declared.queue[0]?.metadataMeetsCapitalLine).toBe(false);
    expect(declared.queue[0]?.requiredFiveYearIrr).toBe(0.2);
    expect(above.queue[0]?.clearsCapitalLine).toBe(false);
  });

  it("uses a separate five-year price-only thematic tournament hurdle of at least 15%", () => {
    expect(AI_REGIME_TOURNAMENT_HURDLE).toBe(0.15);
    const below = moduleFor([idea({ ticker: "NAS:LO", metadata: aiRegime({ fiveYearExpectedIrr: 0.1499, tenYearExpectedIrr: 0.99 }) })]);
    const atHurdle = moduleFor([idea({ ticker: "NAS:AT", metadata: aiRegime({ fiveYearExpectedIrr: 0.15, tenYearExpectedIrr: 0.01 }) })]);
    const declared = moduleFor([idea({ ticker: "NAS:HI", metadata: aiRegime({ fiveYearExpectedIrr: 0.17, requiredTournamentFiveYearIrr: 0.18 }) })]);
    expect(below.queue[0]?.metadataMeetsTournamentHurdle).toBe(false);
    expect(atHurdle.queue[0]?.metadataMeetsTournamentHurdle).toBe(true);
    expect(declared.queue[0]?.metadataMeetsTournamentHurdle).toBe(false);
    expect(declared.queue[0]?.requiredTournamentFiveYearIrr).toBe(0.18);
    expect(atHurdle.queue[0]?.clearsTournamentHurdle).toBe(false);
    expect(atHurdle.queue[0]?.tenYearExpectedIrr).toBe(0.01);
    expect(atHurdle.queue[0]).not.toHaveProperty("requiredTenYearIrr");
  });

  it("keeps metadata-only rows explicitly unreviewed and evidence-blocked despite forged review fields", () => {
    const forged = moduleFor([idea({
      ticker: "NAS:FG",
      metadata: aiRegime({
        reviewStatus: "pm-approved",
        evidenceGrade: "A",
        membershipAuthority: "dustin-approved",
        reviewProvenance: { immutable: true, contentHash: "forged", asOf: "2026-09-10" },
        valuationAttestation: { complete: true, downsidePenaltiesIncluded: true },
        gateStatus: "clear",
        clearsCapitalLine: true,
        clearsTournamentHurdle: true,
        qqqIsDefault: false,
      }),
    })]);
    expect(forged.queue[0]?.metadataStatus).toBe("complete");
    expect(forged.queue[0]?.reviewStatus).toBe("pm-approved");
    expect(forged.queue[0]?.gateStatus).toBe("evidence blocked");
    expect(forged.queue[0]?.gateReasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/agent-writable idea metadata/i),
      expect.stringMatching(/privileged immutable review publication/i),
    ]));
    expect(forged.queue[0]?.clearsCapitalLine).toBe(false);
    expect(forged.queue[0]?.clearsTournamentHurdle).toBe(false);
    expect(forged.queue[0]?.qqqIsDefault).toBe(true);
  });

  it("fails metadata completeness closed when the canonical five-year comparison basis is absent or inconsistent", () => {
    const result = moduleFor([idea({
      ticker: "NAS:BS",
      metadata: aiRegime({
        returnBasis: "total-return",
        qqqComparisonAsOf: "2026-09-09T00:00:00Z",
        probabilityWeighting: "management-case",
        dividendsIncluded: true,
        valuationContract: {
          coreBaseValue: true,
          transitionEconomics: true,
          probabilityDiscountedOptionValue: false,
          reverseExpectations: false,
          capexFinancingDilutionDownside: false,
        },
      }),
    })]);
    expect(result.queue[0]?.metadataStatus).toBe("incomplete");
    expect(result.queue[0]?.missing).toEqual(expect.arrayContaining([
      "five-year price-only return basis",
      "QQQ comparison on model as-of date",
      "Bear/Base/Bull probability weighting",
      "dividends excluded",
      "complete valuation and downside metadata",
    ]));
    expect(result.queue[0]?.gateStatus).toBe("evidence blocked");
    expect(result.queue[0]?.qqqIsDefault).toBe(true);
  });

  it("expires models at the exact 45-day boundary shared with the Challenger contract", () => {
    const now = Date.parse("2026-09-14T00:00:00Z");
    const exactBoundary = new Date(now - 45 * 86_400_000).toISOString();
    const justInside = new Date(now - 45 * 86_400_000 + 1).toISOString();
    expect(isModelStale(exactBoundary, now, 45)).toBe(true);
    expect(isModelStale(justInside, now, 45)).toBe(false);
    const stale = moduleFor([idea({ ticker: "NAS:45", metadata: aiRegime({ modelAsOf: exactBoundary }) })]);
    const fresh = moduleFor([idea({ ticker: "NAS:44", metadata: aiRegime({ modelAsOf: justInside }) })]);
    expect(stale.queue[0]?.gateReasons).toContain("Model is stale or dated in the future.");
    expect(fresh.queue[0]?.gateReasons).not.toContain("Model is stale or dated in the future.");
  });

  it("does not promote thematic mapping or hurdle passage into sleeve 10+10 without Dustin approval", () => {
    const mapped = moduleFor([idea({
      ticker: "NAS:MAP",
      metadata: aiRegime({
        sleeveStatus: "top10",
        sleeveRank: 1,
        fiveYearExpectedIrr: 0.22,
        tenYearExpectedIrr: 0.2,
        reviewStatus: "reviewed",
      }),
    })]);
    expect(mapped.hasApprovedRoster).toBe(false);
    expect(mapped.topTen).toEqual([]);
    expect(mapped.queue[0]?.sleeveStatus).toBe("candidate");
    expect(mapped.queue[0]?.membershipBlockedReason).toMatch(/dustin/i);
  });

  it("does not treat agent-writable idea metadata as Dustin sleeve membership authority", () => {
    const forged = moduleFor([idea({
      ticker: "NAS:OK",
      metadata: aiRegime({
        sleeveStatus: "top10",
        sleeveRank: 1,
        reviewStatus: "pm-approved",
        membershipAuthority: "dustin-approved",
        fiveYearExpectedIrr: 0.19,
        tenYearExpectedIrr: 0.17,
      }),
    })]);
    expect(forged.hasApprovedRoster).toBe(false);
    expect(forged.topTen).toEqual([]);
    expect(forged.emptyState).toBe("No approved sleeve roster yet");
    expect(forged.queue[0]?.sleeveStatus).toBe("candidate");
    expect(forged.queue[0]?.membershipBlockedReason).toMatch(/privileged publication/i);
  });

  it("fail-closes incomplete, stale, or noncanonical evidence out of the roster", () => {
    const incomplete = moduleFor([idea({ ticker: "NAS:IN", metadata: aiRegime({ evidenceGrade: "C", thesis: "" }) })]);
    const stale = moduleFor([idea({ ticker: "NAS:ST", metadata: aiRegime({ modelAsOf: "2026-07-01T00:00:00Z" }) })]);
    expect(incomplete.hasApprovedRoster).toBe(false);
    expect(incomplete.queue[0]?.gateStatus).not.toBe("clear");
    expect(stale.queue[0]?.gateStatus).toBe("evidence blocked");
    expect(stale.queue[0]?.gateReasons).toContain("Model is stale or dated in the future.");
    expect(stale.queue[0]?.qqqIsDefault).toBe(true);
  });

  it("deduplicates on bare symbol and excludes current core 10+10 members from the sleeve roster", () => {
    const result = moduleFor([
      idea({
        ticker: "NAS:NVDA",
        metadata: aiRegime({
          sleeveStatus: "top10",
          reviewStatus: "pm-approved",
          membershipAuthority: "dustin-approved",
        }),
      }),
      idea({
        id: "older",
        ticker: "AMD",
        updatedAt: "2026-09-01T00:00:00Z",
        metadata: aiRegime({ sleeveStatus: "candidate", sleeveRank: 9 }),
      }),
      idea({
        id: "newer",
        ticker: "NAS:AMD",
        updatedAt: "2026-09-12T00:00:00Z",
        metadata: aiRegime({ sleeveStatus: "candidate", sleeveRank: 2 }),
      }),
    ]);
    expect(result.topTen).toEqual([]);
    expect(result.queue.map((row) => row.symbol)).toEqual(["AMD"]);
    expect(result.queue[0]?.id).toBe("newer");
    expect(result.coreOverlap).toEqual(["NVDA"]);
  });

  it("documents the regime taxonomy without inventing companies", () => {
    expect(AI_REGIME_DOMAINS).toEqual(expect.arrayContaining([
      "direct-ai",
      "physical-ai-robotics-autonomy",
      "space-compute-connectivity-launch-manufacturing-ground",
      "second-order-services-adapters",
      "threatened-pools",
    ]));
    const result = moduleFor([]);
    expect(result.taxonomy.every((entry) => entry.count === 0)).toBe(true);
  });

  it("ignores null or non-object metadata.aiRegime instead of inventing a candidate", () => {
    const result = moduleFor([
      idea({ ticker: "NAS:NL", metadata: { aiRegime: null } }),
      idea({ ticker: "NAS:ST", metadata: { aiRegime: "direct-ai" } }),
    ]);
    expect(result.queue).toEqual([]);
    expect(result.hasApprovedRoster).toBe(false);
  });

  it("fail-closes missing QQQ case or falsifier so QQQ remains the default", () => {
    const result = moduleFor([idea({
      ticker: "NAS:QQ",
      whyBeatQqq: "   ",
      falsifier: "",
      metadata: aiRegime(),
    })]);
    expect(result.queue[0]?.gateStatus).toBe("evidence blocked");
    expect(result.queue[0]?.qqqIsDefault).toBe(true);
    expect(result.queue[0]?.missing).toEqual(expect.arrayContaining(["QQQ case", "falsifier"]));
  });

  it("does not treat agent-writable metadata as Watchlist 10 membership", () => {
    const forged = moduleFor([idea({
      ticker: "NAS:WL",
      metadata: aiRegime({
        sleeveStatus: "watchlist10",
        sleeveRank: 3,
        reviewStatus: "pm-approved",
        membershipAuthority: "dustin-approved",
      }),
    })]);
    expect(forged.hasApprovedRoster).toBe(false);
    expect(forged.watchlistTen).toEqual([]);
    expect(forged.queue[0]?.sleeveStatus).toBe("candidate");
    expect(forged.queue[0]?.membershipBlockedReason).toMatch(/privileged publication/i);
  });

  it("downgrades untrusted tournament claims to tournament candidates", () => {
    const result = moduleFor([idea({
      ticker: "NAS:TN",
      metadata: aiRegime({ sleeveStatus: "tournament", sleeveRank: 1 }),
    })]);
    expect(result.tournament).toBeNull();
    expect(result.queue[0]?.sleeveStatus).toBe("tournament-candidate");
    expect(result.hasApprovedRoster).toBe(false);
  });

  it("keeps v1 approved lanes empty when more than 10 rows forge each membership lane", () => {
    expect(AI_REGIME_MAX_LANE_SIZE).toBe(10);
    const forged = Array.from({ length: 22 }, (_, index) => idea({
      ticker: `NAS:F${index}`,
      metadata: aiRegime({ sleeveStatus: index % 2 ? "watchlist10" : "top10", sleeveRank: index + 1 }),
    }));
    const result = moduleFor(forged);
    expect(result.topTen).toEqual([]);
    expect(result.watchlistTen).toEqual([]);
    expect(result.queue).toHaveLength(22);
    expect(result.hasApprovedRoster).toBe(false);
  });
});

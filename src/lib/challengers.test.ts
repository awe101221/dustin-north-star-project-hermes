import { createHash } from "node:crypto";
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

function canonicalJson(value: unknown): string {
  if (value === null) return '["null"]';
  if (Array.isArray(value)) return `["array",[${value.map(canonicalJson).join(",")}]]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort()
      .map((key) => `[${JSON.stringify(key)},${canonicalJson(record[key])}]`).join(",");
    return `["object",[${entries}]]`;
  }
  if (typeof value === "number") {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value === 0 ? 0 : value, false);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `["number","${hex}"]`;
  }
  if (typeof value === "string") return `["string",${JSON.stringify(value)}]`;
  if (typeof value === "boolean") return `["boolean",${value}]`;
  throw new Error("Unsupported test hash value");
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function sealTournament(sourceTaskId: string, sourceRunId: number, shared: Record<string, unknown>, candidates: Record<string, unknown>[]) {
  const orderedCandidateIdentities = candidates.map((candidate) => candidate.candidateIdentity as string);
  const candidateSetHash = digest(orderedCandidateIdentities);
  const expectedCandidateCount = candidates.length;
  const contentCandidates = candidates.map((candidate) => ({
    acceptedReviewRunId: candidate.acceptedReviewRunId,
    acceptedReviewTaskId: candidate.acceptedReviewTaskId,
    basis: candidate.basis,
    candidateIdentity: candidate.candidateIdentity,
    currentPrice: candidate.currentPrice,
    disposition: candidate.disposition,
    evidenceGrade: candidate.evidenceGrade,
    expectedIrr: candidate.expectedIrr,
    fiveYearExpectedIrr: candidate.fiveYearExpectedIrr ?? null,
    fiveYearHurdlePrice: candidate.fiveYearHurdlePrice ?? null,
    hurdlePrice: candidate.hurdlePrice,
    hurdlePriceExpectedTerminalValueConvention: candidate.hurdlePriceExpectedTerminalValueConvention ?? null,
    modelAsOf: candidate.modelAsOf,
    nextEventAt: candidate.nextEventAt ?? null,
    nextEventEstimated: candidate.nextEventEstimated ?? null,
    nextEventStatus: candidate.nextEventStatus ?? null,
    nextEvidenceTrigger: candidate.nextEvidenceTrigger ?? null,
    portfolioFitAssessment: candidate.portfolioFitAssessment ?? null,
    priceOnlyExpectedIrr: candidate.priceOnlyExpectedIrr ?? null,
    rank: candidate.rank,
    requiredIrr: candidate.requiredIrr,
    reviewVerdict: candidate.reviewVerdict,
  }));
  const reviewedContentHash = digest({
    asOf: shared.asOf,
    candidates: contentCandidates,
    completedAt: shared.completedAt,
    incumbentTicker: shared.incumbentTicker,
    sourceCommentId: shared.sourceCommentId,
    summary: shared.summary,
    terminalLabel: shared.terminalLabel,
  });
  const manifestHash = digest({
    candidateSetHash, expectedCandidateCount, orderedCandidateIdentities, reviewedContentHash, sourceRunId, sourceTaskId,
  });
  const publication = { sourceRunId, expectedCandidateCount, orderedCandidateIdentities, candidateSetHash, reviewedContentHash, manifestHash, publicationComplete: true };
  return contentCandidates.map(({ candidateIdentity: _candidateIdentity, ...candidate }) => ({
    id: sourceTaskId, sourceTaskId, ...shared, ...publication, ...candidate,
  }));
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

  it("lets a 14% name enter when it beats a weaker incumbent", () => {
    const weakBoard = snapshotToDashboard(normalizeBestIdeasSnapshot({
      asOf: "2026-09-10T00:00:00Z",
      topTen: [{ ticker: "NAS:WEAK", modeledReturn: 0.06, score: 40 }],
      watchlistTen: [{ ticker: "WEAKER", modeledReturn: 0.05, score: 30 }],
    }));
    const board = buildChallengerBoard({
      dashboard: weakBoard,
      now: "2026-09-14T12:00:00Z",
      ideas: [idea({ ticker: "FOURTEEN", metadata: challengerMetadata({ expectedIrr: 0.14, requiredIrr: 0.15 }) })],
    });
    expect(board.candidates[0]?.disposition).toBe("first alternate");
    expect(board.candidates[0]?.requiredIrr).toBe(0.15);
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
    expect(board.candidates.map((x) => x.ticker)).toEqual(["APPROVED", "OWNED", "WATCH", "REJECT"]);
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

  it("surfaces the latest reviewed tournament in PM rank order without overwriting live-position posture", () => {
    const [kspiTournament, gpnTournament] = sealTournament("t_212455d3", 47, {
      asOf: "2026-09-15T04:39:07.420Z",
      completedAt: "2026-09-16T01:13:27Z",
      incumbentTicker: "ACN",
      terminalLabel: "no change",
      summary: "Retain ACN; QQQ remains the practical default for new capital.",
      sourceCommentId: 56,
    }, [
      {
        candidateIdentity: "KSPI", rank: 1, disposition: "first alternate", expectedIrr: 0.1380627054,
        requiredIrr: 0.15, currentPrice: 98.75, hurdlePrice: 90.76082621, evidenceGrade: "B",
        modelAsOf: "2026-09-16T01:08:47.000Z", acceptedReviewTaskId: "t_review_kspi",
        acceptedReviewRunId: 101, reviewVerdict: "PASS WITH CAVEATS", priceOnlyExpectedIrr: 0.0876468856,
        basis: "Dividend-inclusive bank return model.",
      },
      {
        candidateIdentity: "GPN", rank: 2, disposition: "watch / price trigger", expectedIrr: 0.1161686759,
        requiredIrr: 0.15, currentPrice: 88.98, hurdlePrice: 66.01039038, evidenceGrade: "B",
        modelAsOf: "2026-09-15", acceptedReviewTaskId: "t_review_gpn", acceptedReviewRunId: 102,
        reviewVerdict: "PASS WITH CAVEATS", basis: "Continuing owner-FCF model.",
      },
    ]);
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-16T12:00:00Z",
      ideas: [
        idea({
          ticker: "NAS:KSPI",
          currentWeight: 0.013,
          metadata: challengerMetadata({
            expectedIrr: 0.20,
            currentPrice: 120,
            hurdlePrice: 100,
            admissionDecision: "first alternate",
            tournament: kspiTournament,
          }),
        }),
        idea({
          ticker: "NYSE:GPN",
          metadata: challengerMetadata({
            expectedIrr: 0.1161686759,
            currentPrice: 88.98,
            hurdlePrice: 66.01039038,
            admissionDecision: "watch / price trigger",
            tournament: gpnTournament,
          }),
        }),
      ],
    });

    expect(board.latestTournament).toMatchObject({
      id: "t_212455d3",
      incumbentTicker: "ACN",
      terminalLabel: "no change",
      sourceCommentId: 56,
    });
    expect(board.latestTournament?.candidates.map((candidate) => [candidate.symbol, candidate.tournamentRank, candidate.tournamentDisposition])).toEqual([
      ["KSPI", 1, "first alternate"],
      ["GPN", 2, "watch / price trigger"],
    ]);
    expect(board.latestTournament?.candidates[0]).toMatchObject({
      priceOnlyExpectedIrr: 0.0876468856,
      tournamentExpectedIrr: 0.1380627054,
      tournamentCurrentPrice: 98.75,
      expectedIrr: 0.20,
      currentPrice: 120,
    });
    expect(board.candidates.find((candidate) => candidate.symbol === "KSPI")?.disposition).toBe("owned-position review");
  });

  it("keeps current members in the frozen tournament while excluding them from the live candidate queue", () => {
    const [mndyTournament, gpnTournament] = sealTournament("t_current_member", 48, {
      asOf: "2026-09-15T04:39:07.420Z",
      completedAt: "2026-09-16T01:13:27Z",
      incumbentTicker: "ACN",
      terminalLabel: "no change",
      summary: "No roster change.",
      sourceCommentId: 56,
    }, [
      { candidateIdentity: "MNDY", rank: 1, disposition: "owned-position review", expectedIrr: 0.08,
        requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B", modelAsOf: "2026-09-15",
        acceptedReviewTaskId: "t_review_1", acceptedReviewRunId: 101, reviewVerdict: "PASS WITH CAVEATS", basis: "Frozen reviewed model." },
      { candidateIdentity: "GPN", rank: 2, disposition: "watch / price trigger", expectedIrr: 0.11,
        requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B", modelAsOf: "2026-09-15",
        acceptedReviewTaskId: "t_review_2", acceptedReviewRunId: 102, reviewVerdict: "PASS WITH CAVEATS", basis: "Frozen reviewed model." },
    ]);
    const board = buildChallengerBoard({
      dashboard: dashboard(),
      now: "2026-09-16T12:00:00Z",
      ideas: [
        idea({ ticker: "NAS:MNDY", metadata: challengerMetadata({ admissionDecision: "owned-position review", tournament: mndyTournament }) }),
        idea({ ticker: "NYSE:GPN", metadata: challengerMetadata({ admissionDecision: "watch / price trigger", tournament: gpnTournament }) }),
      ],
    });
    expect(board.candidates.map((candidate) => candidate.symbol)).toEqual(["GPN"]);
    expect(board.latestTournament?.candidates.map((candidate) => candidate.symbol)).toEqual(["MNDY", "GPN"]);
  });

  it("requires exact raw shared provenance types and values on every published row", () => {
    const rows = sealTournament("t_shared_raw", 55, {
      asOf: "2026-09-15T04:39:07.000Z", completedAt: "2026-09-16T01:13:27.000Z",
      incumbentTicker: "ACN", terminalLabel: "no change", summary: "No roster change.", sourceCommentId: 56,
    }, [
      { candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "watch / price trigger",
        expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
        modelAsOf: "2026-09-15", acceptedReviewTaskId: "review-KSPI", acceptedReviewRunId: 101,
        basis: "Frozen reviewed model." },
      { candidateIdentity: "GPN", reviewVerdict: "PASS", rank: 2, disposition: "watch / price trigger",
        expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
        modelAsOf: "2026-09-15", acceptedReviewTaskId: "review-GPN", acceptedReviewRunId: 102,
        basis: "Frozen reviewed model." },
    ]);
    const render = (second: Record<string, unknown>) => buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [
        idea({ ticker: "KSPI", metadata: challengerMetadata({ tournament: rows[0] }) }),
        idea({ ticker: "GPN", metadata: challengerMetadata({ tournament: { ...rows[1], ...second } }) }),
      ],
    }).latestTournament;
    expect(render({})).not.toBeNull();
    for (const mutation of [
      { sourceRunId: "55" }, { expectedCandidateCount: "2" }, { sourceCommentId: "56" },
      { asOf: "2026-09-14T23:39:07.000-05:00" }, { incumbentTicker: "acn" },
      { terminalLabel: "NO CHANGE" }, { candidateSetHash: String(rows[1]!.candidateSetHash).toUpperCase() },
    ]) expect(render(mutation)).toBeNull();
  });

  it("fails closed on incomplete, inconsistent, or unreviewed tournament provenance", () => {
    const [baseTournament] = sealTournament("t_invalid", 49, {
      asOf: "2026-09-15T04:39:07.420Z",
      completedAt: "2026-09-16T01:13:27Z",
      incumbentTicker: "ACN",
      terminalLabel: "no change",
      summary: "No roster change.",
      sourceCommentId: 56,
    }, [{
      candidateIdentity: "KSPI", rank: 1, disposition: "first alternate", reviewVerdict: "PASS WITH CAVEATS",
      expectedIrr: 0.13, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
      modelAsOf: "2026-09-15", acceptedReviewTaskId: "t_review_invalid", acceptedReviewRunId: 103,
      basis: "Frozen reviewed model.",
    }]);
    for (const tournament of [
      { ...baseTournament, rank: 2, disposition: "first alternate" },
      { ...baseTournament, rank: 1, disposition: "first alternate", reviewVerdict: "CHANGES REQUIRED" },
      { ...baseTournament, rank: 1, disposition: "first alternate", sourceTaskId: "different-task" },
    ]) {
      const board = buildChallengerBoard({
        dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
        ideas: [idea({ ticker: "KSPI", metadata: challengerMetadata({ admissionDecision: "first alternate", tournament }) })],
      });
      expect(board.latestTournament).toBeNull();
    }
  });

  it("renders only a complete immutable publication whose count, ordered identities, and hashes verify", () => {
    const sourceTaskId = "t_manifest";
    const complete = sealTournament(sourceTaskId, 47, {
      asOf: "2026-09-15T04:39:07.420Z",
      completedAt: "2026-09-16T01:13:27Z",
      incumbentTicker: "ACN",
      terminalLabel: "no change",
      summary: "No roster change.",
      sourceCommentId: 56,
    }, [{
      candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "first alternate",
      expectedIrr: 0.13, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
      modelAsOf: "2026-09-15T00:00:00.000Z", acceptedReviewTaskId: "t_review", acceptedReviewRunId: 103,
      basis: "Frozen reviewed model.",
    }])[0]!;
    const render = (tournament: Record<string, unknown>) => buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [idea({ ticker: "KSPI", metadata: challengerMetadata({ admissionDecision: "first alternate", tournament }) })],
    }).latestTournament;
    expect(render(complete)?.candidates.map((candidate) => candidate.symbol)).toEqual(["KSPI"]);
    const mismatchedReviewedContent = { ...complete, reviewedContentHash: "1".repeat(64) };
    mismatchedReviewedContent.manifestHash = digest({
      candidateSetHash: mismatchedReviewedContent.candidateSetHash,
      expectedCandidateCount: mismatchedReviewedContent.expectedCandidateCount,
      orderedCandidateIdentities: mismatchedReviewedContent.orderedCandidateIdentities,
      reviewedContentHash: mismatchedReviewedContent.reviewedContentHash,
      sourceRunId: mismatchedReviewedContent.sourceRunId,
      sourceTaskId: mismatchedReviewedContent.sourceTaskId,
    });
    expect(render(mismatchedReviewedContent)).toBeNull();
    for (const tournament of [
      { ...complete, expectedCandidateCount: 2 },
      { ...complete, orderedCandidateIdentities: ["GPN"] },
      { ...complete, candidateSetHash: "0".repeat(64) },
      { ...complete, manifestHash: "0".repeat(64) },
      { ...complete, publicationComplete: false },
      { ...complete, sourceRunId: true },
      { ...complete, sourceCommentId: true },
      { ...complete, incumbentTicker: " " },
      { ...complete, terminalLabel: " " },
      { ...complete, summary: " " },
      { ...complete, evidenceGrade: "B-" },
      { ...complete, asOf: "2026-09-15" },
      { ...complete, completedAt: "2026-09-16T01:13:27" },
    ]) expect(render(tournament)).toBeNull();
  });

  it("accepts a Python-published Unicode and numeric canonical hash fixture", () => {
    const sourceTaskId = "t_cross_language";
    const tournament = {
      id: sourceTaskId,
      sourceTaskId,
      sourceRunId: 47,
      asOf: "2026-09-15T04:39:07.420Z",
      completedAt: "2026-09-16T01:13:27Z",
      incumbentTicker: "ACN",
      terminalLabel: "no change",
      summary: "Mañana 市場",
      sourceCommentId: 56,
      expectedCandidateCount: 1,
      orderedCandidateIdentities: ["XLG"],
      candidateSetHash: "8ff27cee95f777c1f7d12b2f2edea78d5c40151a3ab1850eab88cab3b5630e2a",
      reviewedContentHash: "a166d6eecfab6bec946d25ee703d7ff5daf2b1bbd996fb98d0061a2b47068807",
      manifestHash: "228e8587a9120e7b8543c54adebbe7b2e21124e6f337f32a7069a692064a16a2",
      publicationComplete: true,
      acceptedReviewRunId: 101,
      acceptedReviewTaskId: "t_review_xlg",
      basis: "Café basis",
      currentPrice: 100.0,
      disposition: "watch / price trigger",
      evidenceGrade: "B",
      expectedIrr: 0.000001,
      fiveYearExpectedIrr: null,
      fiveYearHurdlePrice: null,
      hurdlePrice: 70.0,
      hurdlePriceExpectedTerminalValueConvention: null,
      modelAsOf: "2026-09-15",
      nextEventAt: null,
      nextEventEstimated: null,
      nextEventStatus: null,
      nextEvidenceTrigger: null,
      portfolioFitAssessment: null,
      priceOnlyExpectedIrr: 0,
      rank: 1,
      requiredIrr: 0.15,
      reviewVerdict: "PASS",
    };
    const board = buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [idea({ ticker: "XLG", metadata: challengerMetadata({ tournament }) })],
    });
    expect(board.latestTournament).toMatchObject({ id: sourceTaskId, summary: "Mañana 市場" });
  });

  it("rejects an invalid frozen next-event date instead of displaying it as no event", () => {
    const [tournament] = sealTournament("t_invalid_event", 52, {
      asOf: "2026-09-15T04:39:07.000Z", completedAt: "2026-09-16T01:13:27.000Z",
      incumbentTicker: "ACN", terminalLabel: "no change", summary: "No roster change.", sourceCommentId: 56,
    }, [{
      candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "watch / price trigger",
      expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
      modelAsOf: "2026-09-15", nextEventAt: "not-a-date", acceptedReviewTaskId: "review-KSPI",
      acceptedReviewRunId: 101, basis: "Frozen reviewed model.",
    }]);
    const board = buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [idea({ ticker: "KSPI", metadata: challengerMetadata({ tournament }) })],
    });
    expect(board.latestTournament).toBeNull();
  });

  it("rejects invalid optional frozen values even when their hashes match", () => {
    const render = (candidate: Record<string, unknown>) => {
      const [tournament] = sealTournament("t_invalid_optional", 53, {
        asOf: "2026-09-15T04:39:07.000Z", completedAt: "2026-09-16T01:13:27.000Z",
        incumbentTicker: "ACN", terminalLabel: "no change", summary: "No roster change.", sourceCommentId: 56,
      }, [{
        candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "watch / price trigger",
        expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
        modelAsOf: "2026-09-15", nextEventAt: null, acceptedReviewTaskId: "review-KSPI",
        acceptedReviewRunId: 101, basis: "Frozen reviewed model.", ...candidate,
      }]);
      return buildChallengerBoard({
        dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
        ideas: [idea({ ticker: "KSPI", metadata: challengerMetadata({ tournament }) })],
      }).latestTournament;
    };
    for (const candidate of [
      { expectedIrr: Number.MAX_SAFE_INTEGER + 1 },
      { portfolioFitAssessment: { unexpected: "object" } },
      { nextEventStatus: 7 },
      { nextEventEstimated: "not-a-boolean" },
      { nextEvidenceTrigger: [] },
      { priceOnlyExpectedIrr: "not-a-number" },
      { fiveYearExpectedIrr: "not-a-number" },
      { fiveYearHurdlePrice: -1 },
      { hurdlePriceExpectedTerminalValueConvention: 0 },
    ]) expect(render(candidate)).toBeNull();
  });

  it("does not conflate a frozen number with a number-marker string", () => {
    const [sealed] = sealTournament("t_typed_hash", 54, {
      asOf: "2026-09-15T04:39:07.000Z", completedAt: "2026-09-16T01:13:27.000Z",
      incumbentTicker: "ACN", terminalLabel: "no change", summary: "No roster change.", sourceCommentId: 56,
    }, [{
      candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "watch / price trigger",
      expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
      modelAsOf: "2026-09-15", nextEventAt: null, acceptedReviewTaskId: "review-KSPI",
      acceptedReviewRunId: 101, basis: "Frozen reviewed model.", priceOnlyExpectedIrr: 1,
    }]);
    const tampered = { ...sealed, priceOnlyExpectedIrr: "~number:3ff0000000000000" };
    const board = buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [idea({ ticker: "KSPI", metadata: challengerMetadata({ tournament: tampered }) })],
    });
    expect(board.latestTournament).toBeNull();
  });

  it("rejects missing frozen fields without throwing from the board projection", () => {
    const complete = sealTournament("t_missing_frozen", 51, {
      asOf: "2026-09-15T04:39:07.000Z", completedAt: "2026-09-16T01:13:27.000Z",
      incumbentTicker: "ACN", terminalLabel: "no change", summary: "No roster change.", sourceCommentId: 56,
    }, [{
      candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "watch / price trigger",
      expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
      modelAsOf: "2026-09-15", nextEventAt: null, acceptedReviewTaskId: "review-KSPI",
      acceptedReviewRunId: 101, basis: "Frozen reviewed model.",
    }])[0]!;
    const render = (tournament: Record<string, unknown>) => buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [idea({ ticker: "KSPI", metadata: challengerMetadata({ tournament }) })],
    }).latestTournament;
    for (const field of [
      "nextEventAt", "nextEventEstimated", "nextEventStatus", "nextEvidenceTrigger",
      "portfolioFitAssessment", "priceOnlyExpectedIrr", "fiveYearExpectedIrr",
      "fiveYearHurdlePrice", "hurdlePriceExpectedTerminalValueConvention",
    ]) {
      const incomplete: Record<string, unknown> = { ...complete };
      delete incomplete[field];
      expect(() => render(incomplete)).not.toThrow();
      expect(render(incomplete)).toBeNull();
    }
  });

  it("does not expose a partially completed sequential publication", () => {
    const sourceTaskId = "t_partial";
    const rows = sealTournament(sourceTaskId, 50, {
      asOf: "2026-09-15T04:39:07.000Z", completedAt: "2026-09-16T01:13:27.000Z",
      incumbentTicker: "ACN", terminalLabel: "no change", summary: "No roster change.", sourceCommentId: 56,
    }, [
      { candidateIdentity: "KSPI", reviewVerdict: "PASS", rank: 1, disposition: "watch / price trigger",
        expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
        modelAsOf: "2026-09-15T00:00:00.000Z", acceptedReviewTaskId: "review-KSPI",
        acceptedReviewRunId: 101, basis: "Frozen reviewed model." },
      { candidateIdentity: "GPN", reviewVerdict: "PASS", rank: 2, disposition: "watch / price trigger",
        expectedIrr: 0.1, requiredIrr: 0.15, currentPrice: 90, hurdlePrice: 70, evidenceGrade: "B",
        modelAsOf: "2026-09-15T00:00:00.000Z", acceptedReviewTaskId: "review-GPN",
        acceptedReviewRunId: 102, basis: "Frozen reviewed model." },
    ]);
    const frozen = (index: number, publicationComplete: boolean) => ({ ...rows[index]!, publicationComplete });
    const board = buildChallengerBoard({
      dashboard: dashboard(), now: "2026-09-16T12:00:00Z",
      ideas: [
        idea({ ticker: "KSPI", metadata: challengerMetadata({ tournament: frozen(0, true) }) }),
        idea({ ticker: "GPN", metadata: challengerMetadata({ tournament: frozen(1, false) }) }),
      ],
    });
    expect(board.latestTournament).toBeNull();
  });
});

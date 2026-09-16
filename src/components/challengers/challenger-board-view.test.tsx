import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import { buildChallengerBoard } from "@/lib/challengers";
import { ChallengerBoardView } from "./challenger-board-view";

const idea: Idea = {
  id: "idea-adbe",
  ticker: "NAS:ADBE",
  symbol: "ADBE",
  companyName: "Adobe",
  stage: "diligence",
  sortOrder: 0,
  conviction: 78,
  risk: 42,
  targetWeight: null,
  currentWeight: null,
  thesis: "A durable creative platform at a reset valuation with AI monetization optionality.",
  whyBeatQqq: "Owner earnings can compound faster than QQQ from a lower starting multiple.",
  falsifier: "QQQ is better if AI weakens pricing power or owner earnings fail to grow.",
  catalyst: "Paid AI adoption and margin durability create an estimate inflection.",
  nextAction: "Complete the independent review chain.",
  persona: "hermes-pm",
  memoId: null,
  theme: "application-software",
  tags: ["quality-drawdown"],
  source: "screen",
  sourceRef: { url: "https://example.com/adbe" },
  owner: "hermes",
  archivedReason: null,
  metadata: { challenger: { discoveryLane: "quality-drawdown", expectedIrr: 18, requiredIrr: 15, hurdlePrice: 410, currentPrice: 480, evidenceGrade: "B", portfolioFit: 70, modelAsOf: "2026-09-10T00:00:00Z", nextEventAt: "2026-10-20T00:00:00Z", reviewStatus: "reviewed" } },
  stageChangedAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

function board(ideas: Idea[] = [idea]) {
  const dashboard = snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: "2026-09-10T00:00:00Z",
    topTen: [{ ticker: "META", modeledReturn: 0.16, score: 84 }],
    watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 72 }],
  }));
  return buildChallengerBoard({ dashboard, ideas, now: "2026-09-14T00:00:00Z" });
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

function sealedTournament(sourceTaskId: string, sourceRunId: number, shared: Record<string, unknown>, input: Record<string, unknown>) {
  const candidateIdentity = input.candidateIdentity as string;
  const candidate = {
    acceptedReviewRunId: input.acceptedReviewRunId,
    acceptedReviewTaskId: input.acceptedReviewTaskId,
    basis: input.basis,
    candidateIdentity,
    currentPrice: input.currentPrice,
    disposition: input.disposition,
    evidenceGrade: input.evidenceGrade,
    expectedIrr: input.expectedIrr,
    fiveYearExpectedIrr: input.fiveYearExpectedIrr ?? null,
    fiveYearHurdlePrice: input.fiveYearHurdlePrice ?? null,
    hurdlePrice: input.hurdlePrice,
    hurdlePriceExpectedTerminalValueConvention: input.hurdlePriceExpectedTerminalValueConvention ?? null,
    modelAsOf: input.modelAsOf,
    nextEventAt: input.nextEventAt ?? null,
    nextEventEstimated: input.nextEventEstimated ?? null,
    nextEventStatus: input.nextEventStatus ?? null,
    nextEvidenceTrigger: input.nextEvidenceTrigger ?? null,
    portfolioFitAssessment: input.portfolioFitAssessment ?? null,
    priceOnlyExpectedIrr: input.priceOnlyExpectedIrr ?? null,
    rank: input.rank,
    requiredIrr: input.requiredIrr,
    reviewVerdict: input.reviewVerdict,
  };
  const orderedCandidateIdentities = [candidateIdentity];
  const candidateSetHash = digest(orderedCandidateIdentities);
  const reviewedContentHash = digest({
    asOf: shared.asOf, candidates: [candidate], completedAt: shared.completedAt,
    incumbentTicker: shared.incumbentTicker, sourceCommentId: shared.sourceCommentId,
    summary: shared.summary, terminalLabel: shared.terminalLabel,
  });
  const expectedCandidateCount = 1;
  const manifestHash = digest({ candidateSetHash, expectedCandidateCount, orderedCandidateIdentities, reviewedContentHash, sourceRunId, sourceTaskId });
  const { candidateIdentity: _candidateIdentity, ...frozen } = candidate;
  return {
    id: sourceTaskId, sourceTaskId, ...shared, sourceRunId, expectedCandidateCount,
    orderedCandidateIdentities, candidateSetHash, reviewedContentHash, manifestHash,
    publicationComplete: true, ...frozen,
  };
}

describe("Challenger Board view", () => {
  it("shows the hurdle, incumbent comparisons, evidence gate, and workflow links", () => {
    const markup = renderToStaticMarkup(<ChallengerBoardView board={board()} />);
    expect(markup).toContain("10 + 10 Challenger Board");
    expect(markup).toContain("15% admission hurdle");
    expect(markup).toContain("QQQ remains the default");
    expect(markup).toContain("Weakest Top 10");
    expect(markup).toContain("Weakest Watchlist 10");
    expect(markup).toContain("Evidence grade B");
    expect(markup).toContain('href="/companies/NAS%3AADBE"');
    expect(markup).toContain('href="/pipeline?idea=idea-adbe"');
    expect(markup).toContain('href="/quant"');
  });

  it("keeps dense underwriting details behind a candidate disclosure at every viewport", () => {
    const markup = renderToStaticMarkup(<ChallengerBoardView board={board()} />);
    expect(markup).toContain("Underwriting gates and details");
    expect(markup).not.toContain("sm:hidden");
    expect(markup).not.toContain("hidden sm:grid");
    expect(markup).toContain("sm:grid-cols-2");
  });

  it("keeps the long candidate backlog collapsed after the first ten rows", () => {
    const ideas = Array.from({ length: 11 }, (_, index) => ({
      ...idea,
      id: `idea-${index}`,
      ticker: `CH${index}`,
      symbol: `CH${index}`,
      companyName: `Challenger ${index}`,
    }));
    const markup = renderToStaticMarkup(<ChallengerBoardView board={board(ideas)} />);
    expect(markup).toContain("Show 1 more challenger");
    expect(markup).toContain("Backlog is collapsed to keep PM triage usable");
  });

  it("renders the latest reviewed tournament ahead of the general candidate queue", () => {
    const tournament = sealedTournament("t_212455d3", 47, {
      asOf: "2026-09-15T04:39:07.420Z", completedAt: "2026-09-16T01:13:27Z",
      incumbentTicker: "ACN", terminalLabel: "no change",
      summary: "Retain ACN; QQQ remains the practical default for new capital.", sourceCommentId: 56,
    }, {
      candidateIdentity: "KSPI", reviewVerdict: "PASS WITH CAVEATS", rank: 1,
      disposition: "first alternate", expectedIrr: 0.1380627054, requiredIrr: 0.15,
      currentPrice: 98.75, hurdlePrice: 90.76082621, evidenceGrade: "B",
      modelAsOf: "2026-09-15T21:08:47-04:00", nextEventAt: "2026-11-10T00:00:00-05:00",
      acceptedReviewTaskId: "t_review_kspi", acceptedReviewRunId: 101,
      priceOnlyExpectedIrr: 0.0876468856, basis: "Dividend-inclusive bank return model.",
    });
    const tournamentIdea: Idea = {
      ...idea,
      id: "idea-kspi",
      ticker: "NAS:KSPI",
      symbol: "KSPI",
      companyName: "Kaspi.kz",
      currentWeight: 0.013,
      metadata: {
        challenger: {
          discoveryLane: "acn-challenger-tournament",
          expectedIrr: 0.1380627054,
          requiredIrr: 0.15,
          hurdlePrice: 90.76082621,
          currentPrice: 98.75,
          evidenceGrade: "B",
          portfolioFit: 0,
          modelAsOf: "2026-09-15T21:08:47-04:00",
          nextEventAt: "2026-11-10T00:00:00-05:00",
          reviewStatus: "reviewed",
          admissionDecision: "first alternate",
          tournament,
        },
      },
    };
    const markup = renderToStaticMarkup(<ChallengerBoardView board={board([tournamentIdea])} />);
    expect(markup).toContain("Latest reviewed tournament");
    expect(markup).toContain("ACN vs challengers");
    expect(markup).toContain("Rank 1");
    expect(markup).toContain("first alternate");
    expect(markup).toContain("13.81%");
    expect(markup).toContain("8.76% price-only");
    expect(markup).toContain("Live candidate status");
    expect(markup).toContain("Live first alternates");
    expect(markup).toContain("Live counts below are separate");
    expect(markup).toContain("PM run 47");
    expect(markup).toContain("verified 1/1 candidates");
    expect(markup).toContain("Frozen evidence");
    expect(markup).toContain("Grade B");
    expect(markup).toContain("Model as of");
    expect(markup).toContain("Next-event freshness");
    expect(markup).toContain("Fresh at review");
    expect(markup).toContain("Accepted review");
    expect(markup).toContain("t_review_kspi · run 101");
    expect(markup).toContain("grid-cols-1");
    expect(markup).not.toContain("sm:min-w-64");
    expect(markup.indexOf("Latest reviewed tournament")).toBeLessThan(markup.indexOf("Candidate review queue"));
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rankingDraftSchema, rankingPublicationSchema, exactAuthorDraft, type RankingPublication } from "./qqq-rankings";
import { prepareRankingRelease, decodeRankingRelease } from "./ranking-release";

const now = "2026-10-08T00:00:00Z";
const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

/** Synthetic unit data only; never a publication or browser QA artifact. */
export function releaseFixture() {
  const forecasts = Array.from({ length: 50 }, (_, i) => ({
    securityId: `SEC:0000000001:FIXTURE-${i}`, ticker: `TEST${i}`, companyName: `Synthetic test ${i}`,
    modelAsOf: "2026-10-07T20:00:00Z", priceAsOf: "2026-10-07T20:00:00Z", currentPrice: 100, currency: "USD",
    thesis: "Synthetic", whyBeatQqq: "Synthetic", falsifier: "Synthetic", nextAction: "Synthetic", theme: "Synthetic",
    evidenceUrls: ["https://example.com/test-only"], limitations: "Test only", capitalStructure: "Test only", probabilityRationale: "Test only",
    scenarios: [-0.1, 0.12, 0.2].map((r, n) => ({ name: ["Bear", "Base", "Bull"][n]!, benchmarkScenario: ["Bear", "Base", "Bull"][n]!,
      probability: [0.2, 0.5, 0.3][n]!, stockAnnualizedReturn: r, stockTerminalPrice: 100 * (1 + r) ** 5,
      qqqAnnualizedReturn: [-0.04, 0.1, 0.18][n]!, rationale: "Synthetic test outcome" })),
  }));
  const publications: RankingPublication[] = (["core", "ai-regime"] as const).map((sleeve, n) => {
    const draft = rankingDraftSchema.parse({ schemaVersion: "qqq-top50/v1", sleeve, asOf: "2026-10-07T20:00:00Z", horizonYears: 5,
      returnBasis: "price-only", benchmark: "QQQ", benchmarkAsOf: "2026-10-07T20:00:00Z", benchmarkPrice: 750,
      benchmarkEvidenceUrls: ["https://example.com/test-only"], methodology: "Synthetic unit model",
      benchmarkScenarios: forecasts[0]!.scenarios.map((s) => ({ name: s.benchmarkScenario, probability: s.probability, annualizedReturn: s.qqqAnnualizedReturn, rationale: s.rationale })), forecasts });
    return rankingPublicationSchema.parse({ draft,
      author: { submissions: forecasts.map((f, i) => ({ actor: "investment-underwriter", securityId: f.securityId,
        taskId: `t_${(i + 1).toString(16).padStart(8, "0")}`, runId: String(i + 1), contentHash: sha(exactAuthorDraft(draft, f.securityId)),
        submittedAt: "2026-10-07T20:10:00Z", decision: "AUTHOR FORECAST SUBMISSION" })) },
      review: { actor: "evidence-risk-reviewer", taskId: `t_${(100 + n).toString(16).padStart(8, "0")}`, runId: String(100 + n),
        contentHash: sha(draft), reviewedAt: "2026-10-07T20:20:00Z", verdict: "PASS" },
      approval: { actor: "north-star-pm", taskId: "t_00000200", runId: "512", contentHash: sha(draft), reviewedAt: "2026-10-07T20:30:00Z", decision: "APPROVE RANKING PUBLICATION" } });
  });
  const authorities = publications.flatMap((p) => [...p.author.submissions, p.review, p.approval].map((r) => ({
    taskId: r.taskId, runId: r.runId, actor: r.actor, taskStatus: "done", runStatus: "done", runOutcome: "completed",
    startedAt: Date.parse("submittedAt" in r ? r.submittedAt : r.reviewedAt) / 1000 - 60,
    endedAt: Date.parse("submittedAt" in r ? r.submittedAt : r.reviewedAt) / 1000,
    recordedAt: "submittedAt" in r ? r.submittedAt : r.reviewedAt, contentHash: r.contentHash, decision: "verdict" in r ? r.verdict : r.decision,
  })));
  const securities = forecasts.map((f) => ({ canonicalId: f.securityId, ticker: f.ticker, identifiers: [f.securityId], tickerAliases: [f.ticker], evidenceUrls: f.evidenceUrls }));
  return { publications, securities, authorities };
}

function reorderJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, reorderJson(v)]));
  return value;
}

describe("atomic live ranking releases", () => {
  it("preserves exact hashes after JSONB key ordering and timestamp normalization", () => {
    const row = prepareRankingRelease(releaseFixture(), now);
    const roundTrip = reorderJson(JSON.parse(JSON.stringify(row))) as typeof row;
    roundTrip.as_of = "2026-10-07T20:00:00+00:00";
    roundTrip.approved_at = "2026-10-07T20:30:00+00:00";
    expect(decodeRankingRelease(roundTrip, now).publications.map((p) => p.review.contentHash)).toEqual(releaseFixture().publications.map((p) => p.review.contentHash));
  });
  it("rejects altered forecast text and stored activation metadata", () => {
    const row = prepareRankingRelease(releaseFixture(), now);
    const changed = structuredClone(row);
    (changed.publications as RankingPublication[])[0]!.draft.forecasts[0]!.capitalStructure = "Changed financing";
    expect(() => decodeRankingRelease(changed, now)).toThrow(/differs/);
    expect(() => decodeRankingRelease({ ...row, approved_at: "2026-10-07T20:00:00Z" }, now)).toThrow(/activation timestamps/);
    expect(() => decodeRankingRelease({ ...row, release_hash: "0".repeat(64) }, now)).toThrow(/signed content/);
  });
  it("rejects partial sleeves, different PM decisions and future activation", () => {
    const f = releaseFixture();
    expect(() => prepareRankingRelease({ ...f, publications: [f.publications[0]] }, now)).toThrow();
    f.publications[1]!.approval.runId = "513";
    expect(() => prepareRankingRelease(f, now)).toThrow(/one completed/);
    expect(() => prepareRankingRelease(releaseFixture(), "2026-10-07T20:25:00Z")).toThrow(/activated/);
  });
  it("retains historical releases but rejects publishing stale lists", () => {
    const row = prepareRankingRelease(releaseFixture(), now);
    expect(decodeRankingRelease(row, "2026-12-08T00:00:00Z").publications).toHaveLength(2);
    expect(() => prepareRankingRelease(releaseFixture(), "2026-12-08T00:00:00Z")).toThrow(/fresh/);
  });
});

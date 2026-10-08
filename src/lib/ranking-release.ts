import { createHash } from "node:crypto";
import { z } from "zod";
import { rankingAuthoritySchema, verifyRankingAuthorities } from "./ranking-authority";
import { rankingSecuritySchema, requireCanonicalRankingSecurities } from "./ranking-securities";
import { rankingPublicationSchema, exactAuthorDraft, assertSharedForecastConsistency, buildSleeveRanking, type RankingPublication } from "./qqq-rankings";
import type { QqqRankingReleaseRow } from "./db/types";

/** Actual completed-run readbacks are published only by the privileged release
 * command. Neither idea metadata nor a caller-supplied role name is authority. */
export function loadReviewedRankings(input: unknown, authorityInput: unknown, securityInput: unknown, now = new Date().toISOString()): RankingPublication[] {
  if (!Array.isArray(input)) throw new Error("Reviewed rankings must be an array");
  const verified = input.map((raw) => {
    const p = rankingPublicationSchema.parse(raw);
    p.draft = requireCanonicalRankingSecurities(p.draft, securityInput);
    for (const submission of p.author.submissions) {
      const authoredHash = createHash("sha256").update(JSON.stringify(exactAuthorDraft(p.draft, submission.securityId))).digest("hex");
      if (authoredHash !== submission.contentHash) throw new Error("Forecast differs from the exact content submitted by its underwriter");
    }
    const hash = createHash("sha256").update(JSON.stringify(p.draft)).digest("hex");
    if (hash !== p.review.contentHash) throw new Error("Ranking content differs from the independently reviewed draft");
    return p;
  });
  verifyRankingAuthorities(verified, authorityInput);
  assertSharedForecastConsistency(verified, now);
  return verified.filter((p) => Date.parse(p.approval.reviewedAt) <= Date.parse(now));
}

export const rankingReleaseSchema = z.object({
  publications: z.array(rankingPublicationSchema).length(2),
  securities: z.array(rankingSecuritySchema).min(1),
  authorities: z.array(rankingAuthoritySchema).min(1),
}).strict();

export function prepareRankingRelease(input: unknown, now: string, requireFull = true): QqqRankingReleaseRow {
  const bundle = rankingReleaseSchema.parse(input);
  const [core, ai] = bundle.publications;
  if (core!.draft.sleeve !== "core" || ai!.draft.sleeve !== "ai-regime") throw new Error("Publish both sleeves together, Core followed by AI Regime");
  if (bundle.publications.some((p) => p.draft.forecasts.length !== 50)) throw new Error("A stored release contains exactly fifty authored forecasts per sleeve");
  if (core!.draft.asOf !== ai!.draft.asOf) throw new Error("Both sleeves require the same release as-of");
  if (core!.approval.taskId !== ai!.approval.taskId || core!.approval.runId !== ai!.approval.runId || core!.approval.reviewedAt !== ai!.approval.reviewedAt)
    throw new Error("Both sleeves require one completed exact-hash PM publication decision");
  const verified = loadReviewedRankings(bundle.publications, bundle.authorities, bundle.securities, now);
  if (verified.length !== 2) throw new Error("Release has not activated at this verification timestamp");
  if (requireFull && (["core", "ai-regime"] as const).some((s) => buildSleeveRanking(s, verified, [], now, bundle.securities).rows.length !== 50))
    throw new Error("Release requires fifty fresh accepted forecasts in each sleeve");
  // Schema parsing restores canonical field order after Postgres JSONB reorders
  // object keys. Array order and every authored value remain bound to this hash.
  return { release_hash: createHash("sha256").update(JSON.stringify(bundle)).digest("hex"),
    as_of: core!.draft.asOf, approved_at: core!.approval.reviewedAt, ...bundle };
}

export function decodeRankingRelease(row: QqqRankingReleaseRow, now: string) {
  const verified = prepareRankingRelease({ publications: row.publications, securities: row.securities, authorities: row.authorities }, now, false);
  if (row.release_hash !== verified.release_hash || Date.parse(row.as_of) !== Date.parse(verified.as_of) || Date.parse(row.approved_at) !== Date.parse(verified.approved_at))
    throw new Error("Stored ranking release differs from its signed content or activation timestamps");
  return rankingReleaseSchema.parse({ publications: verified.publications, securities: verified.securities, authorities: verified.authorities });
}

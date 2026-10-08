import "server-only";
import { createHash } from "node:crypto";
import publications from "@/lib/reviewed-qqq-rankings.json";
import authorities from "@/lib/reviewed-ranking-authorities.json";
import { verifyRankingAuthorities } from "@/lib/ranking-authority";
import securities from "@/lib/reviewed-ranking-securities.json";
import { requireCanonicalRankingSecurities } from "@/lib/ranking-securities";
import { rankingPublicationSchema, exactAuthorDraft, assertSharedForecastConsistency, type RankingPublication } from "@/lib/qqq-rankings";

/** Exact draft bytes are canonical JSON produced by JSON.stringify(schema.parse).
 * The repository is the privileged publication boundary, as for the former
 * reviewed sleeve roster. Agent notes and idea metadata cannot publish ranks. */
export function loadReviewedRankings(input: unknown = publications, authorityInput: unknown = authorities, securityInput: unknown = securities, now = new Date().toISOString()): RankingPublication[] {
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
  // A caller cannot activate a future record after this validation snapshot.
  return verified.filter((p) => Date.parse(p.approval.reviewedAt) <= Date.parse(now));
}

import { z } from "zod";
import type { RankingPublication } from "./qqq-rankings";

/** Readbacks exported from actual Hermes task/run records. The privileged
 * publication CLI rechecks the live board before appending a Supabase release;
 * strings inside a draft cannot create an authority record. */
export const rankingAuthoritySchema = z.object({
  taskId: z.string().regex(/^t_[a-f0-9]{8}$/),
  runId: z.string().regex(/^[1-9][0-9]*$/),
  actor: z.enum(["investment-underwriter", "evidence-risk-reviewer", "north-star-pm"]),
  taskStatus: z.literal("done"),
  runStatus: z.literal("done"),
  runOutcome: z.literal("completed"),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  recordedAt: z.iso.datetime({ offset: true }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["AUTHOR FORECAST SUBMISSION", "PASS", "PASS WITH CAVEATS", "APPROVE RANKING PUBLICATION"]),
}).strict().superRefine((r, ctx) => {
  const at = Date.parse(r.recordedAt) / 1000;
  if (at !== r.endedAt || r.endedAt < r.startedAt)
    ctx.addIssue({ code: "custom", path: ["recordedAt"], message: "Attestation time must equal the authoritative completed-run timestamp" });
});

export type RankingAuthority = z.infer<typeof rankingAuthoritySchema>;

export function verifyRankingAuthorities(publications: RankingPublication[], input: unknown): RankingAuthority[] {
  const authorities = z.array(rankingAuthoritySchema).parse(input);
  for (const p of publications) {
    let acceptedReviewEnd: number | null = null;
    let authorEnd = 0;
    for (const record of [...p.author.submissions, p.review, p.approval]) {
      const authority = authorities.find((r) => r.taskId === record.taskId && r.runId === record.runId && r.contentHash === record.contentHash);
      const decision = "verdict" in record ? record.verdict : record.decision;
      if (!authority || authority.actor !== record.actor || authority.contentHash !== record.contentHash ||
        Date.parse(authority.recordedAt) !== Date.parse("submittedAt" in record ? record.submittedAt : record.reviewedAt) || authority.decision !== decision)
        throw new Error("Ranking approval lacks a matching completed Hermes task/run authority readback");
      if ("submittedAt" in record) authorEnd = Math.max(authorEnd, authority.endedAt);
      else if ("verdict" in record) {
        if (authorEnd >= authority.startedAt) throw new Error("Independent review must start after all exact-content author submissions completed");
        acceptedReviewEnd = authority.endedAt;
      }
      else if (acceptedReviewEnd === null || acceptedReviewEnd >= authority.startedAt)
        throw new Error("PM approval run must start after the accepted independent review completed");
    }
  }
  return authorities;
}

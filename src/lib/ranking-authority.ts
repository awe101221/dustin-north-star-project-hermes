import { z } from "zod";
import type { RankingPublication } from "./qqq-rankings";

/** Readbacks exported from the actual Hermes task/run records. The reviewed
 * repository is the publication trust boundary; strings inside a draft cannot
 * create an authority record. Export from the live board before merging. */
export const rankingAuthoritySchema = z.object({
  taskId: z.string().regex(/^t_[a-f0-9]{8}$/),
  runId: z.string().regex(/^[1-9][0-9]*$/),
  actor: z.enum(["evidence-risk-reviewer", "north-star-pm"]),
  taskStatus: z.literal("done"),
  runStatus: z.literal("done"),
  runOutcome: z.literal("completed"),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  recordedAt: z.iso.datetime({ offset: true }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["PASS", "PASS WITH CAVEATS", "APPROVE RANKING PUBLICATION"]),
}).strict().superRefine((r, ctx) => {
  const at = Date.parse(r.recordedAt) / 1000;
  if (r.startedAt > at || r.endedAt < at || r.endedAt < r.startedAt)
    ctx.addIssue({ code: "custom", path: ["recordedAt"], message: "Attestation must fall inside its completed worker run" });
});

export type RankingAuthority = z.infer<typeof rankingAuthoritySchema>;

export function verifyRankingAuthorities(publications: RankingPublication[], input: unknown): RankingAuthority[] {
  const authorities = z.array(rankingAuthoritySchema).parse(input);
  for (const p of publications) {
    for (const record of [p.review, p.approval]) {
      const authority = authorities.find((r) => r.taskId === record.taskId && r.runId === record.runId && r.contentHash === record.contentHash);
      const decision = "verdict" in record ? record.verdict : record.decision;
      if (!authority || authority.actor !== record.actor || authority.contentHash !== record.contentHash ||
        Date.parse(authority.recordedAt) !== Date.parse(record.reviewedAt) || authority.decision !== decision)
        throw new Error("Ranking approval lacks a matching completed Hermes task/run authority readback");
    }
  }
  return authorities;
}

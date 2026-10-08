import { unwrap, type Db } from "./query";
import { REVIEWED_SLEEVE_ROSTER } from "@/lib/reviewed-sleeve-roster";
import type { RankingCandidate, RankingSleeve } from "@/lib/qqq-rankings";

/** Pipeline metadata supplies research coverage only; it never supplies ranks. */
export async function getRankingCandidates(db: Db, sleeve: RankingSleeve): Promise<RankingCandidate[]> {
  const ideas = unwrap(await db.from("hermes_ideas")
    .select(sleeve === "core" ? "ticker,company_name" : "ticker,company_name,metadata")
    .neq("stage", "archive").order("ticker").limit(2000)
    .abortSignal(AbortSignal.timeout(5000)), "ranking research coverage") as unknown as {
      ticker: string; company_name: string | null; metadata?: Record<string, unknown>;
    }[];
  const candidates: RankingCandidate[] = ideas.filter((idea) => sleeve === "core" || Boolean(idea.metadata?.aiRegime))
    .map(({ ticker, company_name }) => ({ ticker, companyName: company_name, thesis: null, nextAction: null }));
  if (sleeve === "ai-regime") candidates.push(...REVIEWED_SLEEVE_ROSTER.map((r) => ({
    ticker: r.ticker, companyName: r.companyName, thesis: r.thesis,
    nextAction: "Add a reviewed matched-scenario QQQ likelihood forecast.",
  })));
  return candidates;
}

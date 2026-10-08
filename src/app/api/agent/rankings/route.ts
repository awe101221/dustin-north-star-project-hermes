import { json, withAgent } from "@/lib/server/handlers";
import { buildSleeveRanking } from "@/lib/qqq-rankings";
import { loadReviewedRankings } from "@/lib/server/qqq-rankings";

export const dynamic = "force-dynamic";
export const GET = withAgent(async () => {
  const now = new Date().toISOString();
  const publications = loadReviewedRankings(undefined, undefined, undefined, now);
  return json({ schemaVersion: "qqq-top50/v1", horizonYears: 5, benchmark: "QQQ", returnBasis: "price-only",
    sleeves: [buildSleeveRanking("core", publications, [], now), buildSleeveRanking("ai-regime", publications, [], now)],
    refreshContract: "docs/workflows/top-50-rankings.md" });
});

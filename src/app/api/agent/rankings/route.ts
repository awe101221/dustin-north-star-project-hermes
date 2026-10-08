import { json, withAgent } from "@/lib/server/handlers";
import { buildSleeveRanking } from "@/lib/qqq-rankings";
import { readLiveRankings } from "@/lib/server/qqq-rankings";
import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const GET = withAgent(async () => {
  const now = new Date().toISOString();
  const release = await readLiveRankings(now, requireAdmin());
  return json({ schemaVersion: "qqq-top50/v1", horizonYears: 5, benchmark: "QQQ", returnBasis: "price-only", releaseHash: release.releaseHash,
    sleeves: [buildSleeveRanking("core", release.publications, [], now, release.securities), buildSleeveRanking("ai-regime", release.publications, [], now, release.securities)],
    refreshContract: "docs/workflows/top-50-rankings.md" });
});

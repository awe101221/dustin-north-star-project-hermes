import type { Metadata } from "next";
import { SleeveRankingView } from "@/components/rankings/sleeve-ranking-view";
import { ErrorPanel, PageHeader } from "@/components/page-header";
import { getRankingCandidates } from "@/lib/db/rankings";
import { buildSleeveRanking } from "@/lib/qqq-rankings";
import { safeLoad } from "@/lib/server/safe";
import { readLiveRankings } from "@/lib/server/qqq-rankings";
import { serverReadClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Regime Top 50" };
export const dynamic = "force-dynamic";

export default async function AiRegimePage() {
  const now = new Date().toISOString();
  const db = serverReadClient();
  const header = <PageHeader eyebrow="Hermes · AI Regime sleeve" title="AI Regime · Top 50" description="The 50 AI, infrastructure, Physical AI, Space, and second-order beneficiaries most likely to beat QQQ over five years." />;
  const [publications, candidates] = await Promise.all([
    safeLoad(async () => readLiveRankings(now)),
    safeLoad(async () => db ? getRankingCandidates(db, "ai-regime") : []),
  ]);
  if (!publications.ok) return <>{header}<ErrorPanel title="Ranking publication unavailable" detail={publications.error} /></>;
  const ranking = buildSleeveRanking("ai-regime", publications.data.publications, candidates.ok ? candidates.data : [], now, publications.data.securities);
  return <>{header}<SleeveRankingView ranking={ranking} coverageError={candidates.ok ? null : candidates.error} /></>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, ErrorPanel } from "@/components/page-header";
import { SleeveRankingView } from "@/components/rankings/sleeve-ranking-view";
import { serverReadClient } from "@/lib/supabase/server";
import { getRankingCandidates } from "@/lib/db/rankings";
import { buildSleeveRanking } from "@/lib/qqq-rankings";
import { loadReviewedRankings } from "@/lib/server/qqq-rankings";
import { safeLoad } from "@/lib/server/safe";

export const metadata: Metadata = { title: "North Star Top 50" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = serverReadClient();
  const header = <PageHeader eyebrow="Hermes · North Star sleeve" title="North Star · Top 50" description="The 50 companies most likely to beat QQQ over five years." />;
  const [publications, candidates] = await Promise.all([
    safeLoad(async () => loadReviewedRankings()),
    safeLoad(async () => db ? getRankingCandidates(db, "core") : []),
  ]);
  if (!publications.ok) return <>{header}<ErrorPanel title="Ranking publication unavailable" detail={publications.error} /></>;
  const ranking = buildSleeveRanking("core", publications.data, candidates.ok ? candidates.data : []);
  return <>
    {header}
    <SleeveRankingView ranking={ranking} coverageError={candidates.ok ? null : candidates.error} />
    <div className="panel mt-5 p-4">
      <Link href="/rankings/history" className="text-[13px] font-medium text-cyan hover:underline">Historical rankings &amp; Revisit</Link>
      <p className="mt-2 text-[12px] text-muted">Prior 10+10 selections, company models, and research for reconsideration.</p>
    </div>
  </>;
}

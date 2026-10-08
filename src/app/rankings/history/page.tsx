import Link from "next/link";
import { PageHeader, ErrorPanel, NotConfigured } from "@/components/page-header";
import { RevisitList } from "@/components/best-ideas/revisit-list";
import { serverReadClient } from "@/lib/supabase/server";
import { BEST_IDEAS_SNAPSHOT_TAG, getBestIdeasDashboard } from "@/lib/best-ideas";
import { getLatestResearchForTickers } from "@/lib/db/research";
import { isWriteConfigured } from "@/lib/env";
import { safeLoad } from "@/lib/server/safe";

export const metadata = { title: "Historical rankings & Revisit" };
export const dynamic = "force-dynamic";

export default async function RankingHistoryPage() {
  const header = <PageHeader eyebrow="Hermes · research archive" title="Historical rankings & Revisit" description="Former 10+10 selections, retained models, and research for reconsideration." />;
  const db = serverReadClient();
  if (!db) return <>{header}<NotConfigured what="historical ranking research" /></>;
  const result = await safeLoad(() => getBestIdeasDashboard(db));
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  const research = await safeLoad(() => getLatestResearchForTickers(db, result.data.revisit.map(({ idea }) => idea.ticker), BEST_IDEAS_SNAPSHOT_TAG));
  return <>{header}
    <Link href="/" className="mb-4 inline-block text-[12px] text-cyan hover:underline">Back to North Star Top 50</Link>
    {result.data.snapshotId ? <p className="mb-4 text-[12px]"><Link href={`/research/${result.data.snapshotId}`} className="text-cyan hover:underline">Last historical 10+10 snapshot</Link></p> : null}
    <RevisitList dashboard={result.data} research={research.ok ? research.data : {}} canWrite={isWriteConfigured()} />
  </>;
}

import type { Metadata } from "next";
import { ChallengerBoardView } from "@/components/challengers/challenger-board-view";
import { ErrorPanel, NotConfigured, PageHeader } from "@/components/page-header";
import { getBestIdeasDashboard } from "@/lib/best-ideas";
import { buildChallengerBoard } from "@/lib/challengers";
import { getIdeas } from "@/lib/db/pipeline";
import { safeLoad } from "@/lib/server/safe";
import { serverReadClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Challengers" };
export const dynamic = "force-dynamic";

export default async function ChallengersPage() {
  const db = serverReadClient();
  const header = <PageHeader eyebrow="Hermes · research archive" title="Challenger research" description="Historical comparative underwriting and reviewed tournaments. The current North Star and AI Regime Top 50 lists rank only by modeled likelihood of beating QQQ; prior admission floors are historical context." />;
  if (!db) return <>{header}<NotConfigured what="the Dustin North Star Hermes brain" /></>;
  const result = await safeLoad(async () => {
    const [dashboard, ideas] = await Promise.all([getBestIdeasDashboard(db), getIdeas(db)]);
    return buildChallengerBoard({ dashboard, ideas });
  });
  if (!result.ok) return <>{header}<ErrorPanel title="Challenger Board failed to load" detail={result.error} /></>;
  return <ChallengerBoardView board={result.data} />;
}

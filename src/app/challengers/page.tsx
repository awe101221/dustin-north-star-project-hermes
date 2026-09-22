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
  const header = <PageHeader eyebrow="Hermes · comparative underwriting" title="10 + 10 Challenger Board" description="Find names to consider for the 10 + 10, and watch contenders and fallen names for price, earnings, or an announcement that could put them in. Entry is above 12% and does not require the Capital Line. The Capital Line is populated only above 15%. QQQ remains the default." />;
  if (!db) return <>{header}<NotConfigured what="the Dustin North Star Hermes brain" /></>;
  const result = await safeLoad(async () => {
    const [dashboard, ideas] = await Promise.all([getBestIdeasDashboard(db), getIdeas(db)]);
    return buildChallengerBoard({ dashboard, ideas });
  });
  if (!result.ok) return <>{header}<ErrorPanel title="Challenger Board failed to load" detail={result.error} /></>;
  return <ChallengerBoardView board={result.data} />;
}

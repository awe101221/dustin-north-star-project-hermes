import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getMandate, getNorthStarStats } from "@/lib/db/northstar";
import { getDecisionScorecard, getRecentAlerts } from "@/lib/db/portfolio";
import { isWriteConfigured } from "@/lib/env";
import { safeLoad } from "@/lib/server/safe";
import { fmtDate } from "@/lib/format";
import { NorthStarView } from "@/components/north-star/north-star-view";

export const metadata: Metadata = { title: "North Star" };
export const dynamic = "force-dynamic";

const DESCRIPTION = "The mission, the rules that protect it, and the numbers that say whether it is working: time-weighted return vs QQQ, year-over-year alpha, rolling Sharpe and Sortino, and the decision scorecard.";

export default async function NorthStarPage() {
  const db = serverReadClient();
  if (!db) return <><PageHeader eyebrow="Mandate, North Star & Stats" title="Beat QQQ over 10 years" description={DESCRIPTION} /><NotConfigured /></>;
  const result = await safeLoad(async () => {
    const [mandate, stats, decisions, alerts] = await Promise.all([getMandate(db), getNorthStarStats(db), getDecisionScorecard(db), getRecentAlerts(db, 60)]);
    return { mandate, stats, decisions, alerts };
  });
  if (!result.ok) return <><PageHeader eyebrow="Mandate, North Star & Stats" title="Beat QQQ over 10 years" description={DESCRIPTION} /><ErrorPanel detail={result.error} /></>;
  const { mandate, stats, decisions, alerts } = result.data;
  return (
    <>
      <PageHeader
        eyebrow={`Mandate v${mandate.version} · ${mandate.benchmark} · ${mandate.horizonYears}y`}
        title={mandate.mission.split(" — ")[0] ?? mandate.title}
        description={mandate.mission}
        meta={<><span>as of {fmtDate(stats.asOf, "long")}</span><span>·</span><span>daily series {stats.daily.available ? `${stats.daily.from} → ${stats.daily.to}` : "not imported (run npm run migrate:performance)"}</span></>}
      />
      <NorthStarView mandate={mandate} stats={stats} decisions={decisions} alerts={alerts} canWrite={isWriteConfigured()} />
    </>
  );
}

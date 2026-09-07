import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getGuruCrossover, getMasterScores, getQuantJobs, getUniverse } from "@/lib/db/quant";
import { getPerformancePoints } from "@/lib/db/portfolio";
import { guruFocusApiKey, isWriteConfigured, priceProvider } from "@/lib/env";
import { safeLoad } from "@/lib/server/safe";
import { QuantWorkbench } from "@/components/quant/quant-workbench";

export const metadata: Metadata = { title: "Quant / Alpha" };
export const dynamic = "force-dynamic";

export default async function QuantPage({ searchParams }: { searchParams: Promise<{ tab?: string; preset?: string }> }) {
  const sp = await searchParams;
  const db = serverReadClient();
  const header = (
    <PageHeader
      eyebrow="Quant Tools / Alpha Module"
      title="Alpha workbench"
      description="Screen the memo universe with live quotes, run deterministic backtests, read guru and insider flow, and pull alternative data. Every screen and backtest is stored as a job so agents can rerun or extend it."
    />
  );
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(async () => {
    const [universe, guru, scores, jobs, perf] = await Promise.all([
      getUniverse(db),
      getGuruCrossover(db, { minBuyers: 2, limit: 400 }),
      getMasterScores(db, 60),
      getQuantJobs(db, undefined, 60),
      getPerformancePoints(db).then((p) => p.filter((x) => x.series === "portfolio").length),
    ]);
    return { universe, guru, scores, jobs, perf };
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  const { universe, guru, scores, jobs, perf } = result.data;
  return (
    <>
      {header}
      <QuantWorkbench
        universe={universe}
        guru={guru}
        scores={scores}
        jobs={jobs}
        config={{ write: isWriteConfigured(), gurufocus: Boolean(guruFocusApiKey()), priceProvider: priceProvider(), dailyPoints: perf }}
        initialTab={sp.tab}
        initialPreset={sp.preset}
      />
    </>
  );
}

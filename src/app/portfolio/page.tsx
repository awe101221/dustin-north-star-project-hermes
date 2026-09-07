import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getPortfolioHub } from "@/lib/db/hub";
import { safeLoad } from "@/lib/server/safe";
import { fmtDate } from "@/lib/format";
import { PortfolioHubView } from "@/components/portfolio/hub-view";

export const metadata: Metadata = { title: "Portfolio Context" };
export const dynamic = "force-dynamic";

export default async function PortfolioContextPage() {
  const db = serverReadClient();
  if (!db) {
    return (
      <>
        <PageHeader eyebrow="Portfolio Context" title="Live book" />
        <NotConfigured />
      </>
    );
  }
  const result = await safeLoad(() => getPortfolioHub(db));
  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Portfolio Context" title="Live book" />
        <ErrorPanel detail={result.error} />
      </>
    );
  }
  const hub = result.data;
  return (
    <>
      <PageHeader
        eyebrow="Portfolio Context"
        title="Live book"
        description="Context for Hermes rankings: exposures, P&L and attribution from the latest IBKR statement, measured against QQQ. This is supporting evidence, not the center of the app."
        meta={
          <>
            <span>Statement as of {fmtDate(hub.asOf, "long")}</span>
            <span>·</span>
            <span>{hub.positions.length} equity lines · {hub.options.length} option lines</span>
            <span>·</span>
            <span>Series: {hub.seriesSource === "daily" ? "daily TWR" : "statement snapshots"}</span>
          </>
        }
      />
      <PortfolioHubView hub={hub} />
    </>
  );
}

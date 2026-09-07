import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getBestIdeasDashboard } from "@/lib/best-ideas";
import { safeLoad } from "@/lib/server/safe";
import { BestIdeasView } from "@/components/best-ideas/best-ideas-view";

export const metadata: Metadata = { title: "Best Ideas" };
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The canonical ranked list for Dustin North Star Project Hermes: the ten best current ideas and the ten closest watchlist candidates for beating QQQ over a decade.";

export default async function BestIdeasPage() {
  const db = serverReadClient();
  if (!db) {
    return (
      <>
        <PageHeader eyebrow="Hermes Ranked Research" title="Best Ideas" description={DESCRIPTION} />
        <NotConfigured what="the Dustin North Star Hermes brain" />
      </>
    );
  }

  const result = await safeLoad(() => getBestIdeasDashboard(db));
  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Hermes Ranked Research" title="Best Ideas" description={DESCRIPTION} />
        <ErrorPanel detail={result.error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Hermes Ranked Research"
        title="Best Ideas"
        description={DESCRIPTION}
        meta={
          <>
            <span>Top 10 + Watchlist 10</span>
            <span>·</span>
            <span>Beat QQQ over 10 years</span>
            <span>·</span>
            <span>Dustin approves every trade manually</span>
          </>
        }
      />
      <BestIdeasView dashboard={result.data} />
    </>
  );
}

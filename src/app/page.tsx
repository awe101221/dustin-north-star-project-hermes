import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getBestIdeasDashboard } from "@/lib/best-ideas";
import { safeLoad } from "@/lib/server/safe";
import { BestIdeasView } from "@/components/best-ideas/best-ideas-view";

export const metadata: Metadata = { title: "10 + 10" };
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The simplified home base: Hermes's Top 10 ideas plus Watchlist 10, ranked by the current QQQ-relative case. Chat is the main interface; this app organizes the results.";

export default async function HomePage() {
  const db = serverReadClient();
  if (!db) {
    return (
      <>
        <PageHeader eyebrow="Hermes ranked research" title="10 + 10" description={DESCRIPTION} />
        <NotConfigured what="the Dustin North Star Hermes brain" />
      </>
    );
  }

  const result = await safeLoad(() => getBestIdeasDashboard(db));
  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Hermes ranked research" title="10 + 10" description={DESCRIPTION} />
        <ErrorPanel detail={result.error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Hermes ranked research"
        title="10 + 10"
        description={DESCRIPTION}
        meta={
          <>
            <span>Beat QQQ over 10 years</span>
            <span>·</span>
            <span>not a trade recommendation</span>
          </>
        }
      />
      <BestIdeasView dashboard={result.data} />
    </>
  );
}

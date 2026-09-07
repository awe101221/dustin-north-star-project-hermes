import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { LearningsView } from "@/components/learnings/learnings-view";
import { getLearningArchive } from "@/lib/learnings";
import { safeLoad } from "@/lib/server/safe";
import { serverReadClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Learnings" };
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The archive of what Hermes has learned about investing, ranking, and QQQ opportunity cost — the philosophy that governs the Top 10 + Watchlist 10.";

export default async function LearningsPage() {
  const db = serverReadClient();
  if (!db) {
    return (
      <>
        <PageHeader eyebrow="Hermes Investing Philosophy" title="Learnings" description={DESCRIPTION} />
        <NotConfigured what="the Dustin North Star Hermes brain" />
      </>
    );
  }

  const result = await safeLoad(() => getLearningArchive(db));
  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Hermes Investing Philosophy" title="Learnings" description={DESCRIPTION} />
        <ErrorPanel detail={result.error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Hermes Investing Philosophy"
        title="Learnings"
        description={DESCRIPTION}
        meta={
          <>
            <span>updates daily or when new knowledge improves the ranking philosophy</span>
            <span>·</span>
            <span>feeds Best Ideas</span>
          </>
        }
      />
      <LearningsView archive={result.data} />
    </>
  );
}

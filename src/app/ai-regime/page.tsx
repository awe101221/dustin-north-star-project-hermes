import type { Metadata } from "next";
import { AiRegimeView } from "@/components/ai-regime/ai-regime-view";
import { ErrorPanel, NotConfigured, PageHeader } from "@/components/page-header";
import { buildAiRegimeModule } from "@/lib/ai-regime";
import { getBestIdeasDashboard } from "@/lib/best-ideas";
import { getIdeas } from "@/lib/db/pipeline";
import { safeLoad } from "@/lib/server/safe";
import { loadSleeveWatchPublications } from "@/lib/server/sleeve-watch";
import { serverReadClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Regime" };
export const dynamic = "force-dynamic";

export default async function AiRegimePage() {
  const db = serverReadClient();
  const header = <PageHeader eyebrow="Hermes · thematic sleeve workspace" title="AI Regime" description="Beat QQQ over 10 years. Research sleeve, not a trade recommendation." />;
  if (!db) return <>{header}<NotConfigured what="the Dustin North Star Hermes brain" /></>;
  const result = await safeLoad(async () => {
    const [dashboard, ideas, watchPublications] = await Promise.all([
      getBestIdeasDashboard(db),
      getIdeas(db),
      loadSleeveWatchPublications(db),
    ]);
    return buildAiRegimeModule({ dashboard, ideas, watchPublications });
  });
  if (!result.ok) return <>{header}<ErrorPanel title="AI Regime failed to load" detail={result.error} /></>;
  return <AiRegimeView module={result.data} />;
}

import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getIdeas } from "@/lib/db/pipeline";
import { getPersonas } from "@/lib/db/personas";
import { isWriteConfigured } from "@/lib/env";
import { safeLoad } from "@/lib/server/safe";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export const metadata: Metadata = { title: "Idea Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ idea?: string; new?: string }> }) {
  const sp = await searchParams;
  const db = serverReadClient();
  const header = (
    <PageHeader
      eyebrow="Idea Pipeline & Ticketing"
      title="Pipeline"
      description="Drag cards across Sourcing → Diligence → Live → Monitor → Archive. Every card links to its memos and notes; every move is audited. Live cards carry sizing; Monitor cards carry triggers and trim proposals."
    />
  );
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(async () => {
    const [ideas, personas] = await Promise.all([getIdeas(db, { includeArchived: true }), getPersonas(db, false).catch(() => [])]);
    return { ideas, personas };
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  return (
    <>
      {header}
      <PipelineBoard initial={result.data.ideas} personas={result.data.personas.map((p) => ({ slug: p.slug, name: p.name }))} canWrite={isWriteConfigured()} openIdeaId={sp.idea} openNew={sp.new === "1"} />
    </>
  );
}

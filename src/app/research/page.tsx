import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { serverReadClient } from "@/lib/supabase/server";
import { getResearchStream, getTagFacets, searchResearch } from "@/lib/db/research";
import { getPersonas } from "@/lib/db/personas";
import { getActivity } from "@/lib/db/knowledge";
import { safeLoad } from "@/lib/server/safe";
import { ResearchStream } from "@/components/research/research-stream";

export const metadata: Metadata = { title: "Research" };
export const dynamic = "force-dynamic";

type Search = { persona?: string; verdict?: string; kind?: string; ticker?: string; tag?: string; mode?: string; q?: string; limit?: string };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const db = serverReadClient();
  const mode = (sp.mode === "timeline" || sp.mode === "journal" ? sp.mode : "latest") as "latest" | "timeline" | "journal";
  const limit = Math.min(400, Math.max(20, Number(sp.limit ?? 80) || 80));
  const q = sp.q?.trim() ?? "";

  const header = (
    <PageHeader
      eyebrow="Research, Memos & Analyst Engine"
      title="Research stream"
      description="Every underwriting memo migrated from Awe Capital plus every Hermes note, searchable and filterable by persona, verdict, ticker and tag. Timeline mode shows superseded versions; journal mode is the desk diary."
      actions={
        <Button asChild>
          <Link href="/research/new"><PenLine /> New note</Link>
        </Button>
      }
    />
  );

  if (!db) return <>{header}<NotConfigured /></>;

  const result = await safeLoad(async () => {
    const [items, hits, facets, personas, activity] = await Promise.all([
      q ? Promise.resolve([]) : getResearchStream(db, { persona: sp.persona || null, verdict: sp.verdict || null, kind: sp.kind || null, ticker: sp.ticker || null, tag: sp.tag || null, latestOnly: mode === "latest", limit }),
      q ? searchResearch(db, q, 60) : Promise.resolve([]),
      getTagFacets(db),
      getPersonas(db, false),
      mode === "journal" ? getActivity(db, { limit: 120 }) : Promise.resolve([]),
    ]);
    return { items, hits, facets, personas, activity };
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  const { items, hits, facets, personas, activity } = result.data;
  return (
    <>
      {header}
      <ResearchStream
        items={mode === "journal" ? items.filter((i) => i.source === "hermes_notes") : items}
        hits={hits}
        facets={facets.slice(0, 40)}
        personas={personas.map((p) => ({ slug: p.slug, name: p.name }))}
        activity={activity}
        filters={{ persona: sp.persona ?? "", verdict: sp.verdict ?? "", kind: sp.kind ?? "", ticker: sp.ticker ?? "", tag: sp.tag ?? "", mode, q, limit }}
      />
    </>
  );
}

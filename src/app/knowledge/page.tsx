import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getKnowledgeIndex } from "@/lib/db/knowledge";
import { unwrap } from "@/lib/db/query";
import { safeLoad } from "@/lib/server/safe";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { KnowledgeSearch } from "@/components/knowledge/knowledge-search";
import { personaLabel } from "@/components/ticker-link";

export const metadata: Metadata = { title: "Knowledge" };
export const dynamic = "force-dynamic";

const CATEGORY_ORDER = ["persona", "process", "rules", "playbook", "spec", "prompt", "agent", "skill", "template", "legacy"];

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const sp = await searchParams;
  const db = serverReadClient();
  const q = sp.q?.trim() ?? "";
  const header = (
    <PageHeader
      eyebrow="Knowledge base"
      title="Playbooks, specs & persona docs"
      description="Everything useful migrated from the Awe Capital cockpit and the Dustin Awe Capital vault: analyst instructions, field conventions, gate precedents, queue-worker contracts, templates and the agent organization charter. Searchable; every doc is versioned by content hash."
    />
  );
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(async () => {
    let docs = await getKnowledgeIndex(db, { category: sp.category });
    if (q) {
      const hits = unwrap(await db.from("hermes_knowledge").select("slug").textSearch("search", q, { type: "websearch", config: "english" }).eq("is_active", true).limit(200), "knowledge search") as Array<{ slug: string }>;
      const slugs = new Set(hits.map((h) => h.slug));
      docs = docs.filter((d) => slugs.has(d.slug) || d.title.toLowerCase().includes(q.toLowerCase()));
    }
    return docs;
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  const docs = result.data;
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const g = groups.get(d.category);
    if (g) g.push(d);
    else groups.set(d.category, [d]);
  }
  const ordered = Array.from(groups.entries()).sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
  return (
    <>
      {header}
      <KnowledgeSearch q={q} category={sp.category ?? ""} categories={CATEGORY_ORDER} count={docs.length} />
      {docs.length === 0 ? (
        <div className="panel px-6 py-10 text-center text-[12px] text-muted mt-4">
          {q ? "No docs match." : <>No knowledge docs yet. Run <code className="num">npm run migrate:knowledge</code> with the legacy repos checked out next to this one.</>}
        </div>
      ) : null}
      <div className="space-y-6 mt-4">
        {ordered.map(([category, list]) => (
          <section key={category}>
            <p className="eyebrow mb-2">{category} · {list.length}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {list.map((d) => (
                <Link key={d.slug} href={`/knowledge/${d.slug}`} className="panel px-4 py-3 hover:border-border-strong transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground truncate">{d.title}</span>
                    {d.persona_slug ? <Badge variant="gold">{personaLabel(d.persona_slug)}</Badge> : null}
                  </div>
                  {d.summary ? <p className="mt-1 text-[12px] text-muted line-clamp-2">{d.summary}</p> : null}
                  <p className="mt-1.5 text-[10.5px] text-muted-2 num truncate">{d.source_repo}{d.source_path ? ` · ${d.source_path}` : ""} · {fmtDate(d.updated_at)}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

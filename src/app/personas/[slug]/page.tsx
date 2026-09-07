import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { safeLoad } from "@/lib/server/safe";
import { getArtifacts, getLatestRankings, getPersona } from "@/lib/db/personas";
import { getResearchStream } from "@/lib/db/research";
import { getKnowledgeIndex } from "@/lib/db/knowledge";
import { unwrap } from "@/lib/db/query";
import { isWriteConfigured } from "@/lib/env";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { Badge, toneFor } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerLink } from "@/components/ticker-link";
import { PersonaEditor } from "@/components/personas/persona-editor";
import { BarRow } from "@/components/ui/stat";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Persona · ${slug}` };
}

export default async function PersonaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = serverReadClient();
  if (!db) return <NotConfigured />;
  const personaLoad = await safeLoad(() => getPersona(db, slug));
  if (!personaLoad.ok) {
    return (
      <>
        <PageHeader eyebrow="Personas" title={slug} />
        <ErrorPanel title="Persona failed to load" detail={personaLoad.error} />
      </>
    );
  }
  const persona = personaLoad.data;
  if (!persona) notFound();

  const loaded = await safeLoad(() =>
    Promise.all([
      getArtifacts(db, slug),
      getLatestRankings(db, slug),
      getResearchStream(db, { persona: slug, latestOnly: true, limit: 12 }),
      getKnowledgeIndex(db, { persona: slug }).catch(() => []),
      db.from("hermes_research_stream").select("verdict").eq("persona_slug", slug).eq("is_latest", true).limit(5000).then((r) => unwrap(r, "verdicts") as Array<{ verdict: string | null }>),
    ]),
  );
  if (!loaded.ok) {
    return (
      <>
        <PageHeader eyebrow="Personas" title={persona.name} />
        <ErrorPanel title="Persona detail failed to load" detail={loaded.error} />
      </>
    );
  }
  const [artifacts, rankings, recent, knowledge, verdictRows] = loaded.data;
  const verdictCounts = new Map<string, number>();
  for (const r of verdictRows) verdictCounts.set(r.verdict ?? "—", (verdictCounts.get(r.verdict ?? "—") ?? 0) + 1);
  const verdicts = Array.from(verdictCounts, ([verdict, count]) => ({ verdict, count })).sort((a, b) => b.count - a.count);
  const maxVerdict = verdicts[0]?.count ?? 1;
  const top = rankings.filter((r) => r.tier === "top_10").slice(0, 20);

  return (
    <>
      <PageHeader
        eyebrow={`Persona · ${persona.frameworkVersion}`}
        title={persona.name}
        description={persona.headline ?? persona.frameworkName}
        meta={
          <>
            <span>{fmtNum(persona.memoCount)} memos across {fmtNum(persona.tickerCount)} tickers</span>
            <span>·</span>
            <span>last memo {fmtDate(persona.lastMemoAt)}</span>
            {persona.blendWeight !== null ? <><span>·</span><span>master blend {fmtPct(persona.blendWeight, 0)}</span></> : null}
          </>
        }
        actions={<Link href={`/research?persona=${slug}`} className="text-[12px] text-cyan hover:underline">All memos →</Link>}
      />

      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">Framework & prompt</TabsTrigger>
          <TabsTrigger value="board">Board · {top.length}</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts · {artifacts.length}</TabsTrigger>
          <TabsTrigger value="recent">Recent memos</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge · {knowledge.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <PersonaEditor persona={persona} canWrite={isWriteConfigured()} />
            <Card>
              <CardHeader><CardTitle>Verdict mix (latest memos)</CardTitle></CardHeader>
              <CardContent>
                {verdicts.map((v, i) => <BarRow key={v.verdict} label={v.verdict} value={v.count} max={maxVerdict} display={String(v.count)} color={i === 0 ? "var(--series-1)" : "var(--series-2)"} />)}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="board">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Latest Top-10 board</CardTitle>
                <CardDescription>From latest_analyst_top_rankings (active ranking channels). Composite is the persona conviction score.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? <p className="text-[12px] text-muted">No ranking snapshot yet.</p> : null}
              {top.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-1.5 hairline-b last:border-b-0 text-[12px]">
                  <span className="num text-muted w-5">{r.rank}</span>
                  <TickerLink ticker={r.ticker} />
                  <span className="text-foreground-secondary truncate flex-1">{r.companyName}</span>
                  <Badge variant="muted">{r.sourceSystem}</Badge>
                  {r.latestVerdict ? <Badge variant={toneFor(r.latestVerdict)}>{r.latestVerdict}</Badge> : null}
                  <span className="num text-gold w-12 text-right">{fmtNum(r.composite, 1)}</span>
                  {r.memoId ? <Link href={`/research/${r.memoId}`} className="text-cyan text-[11px]">memo</Link> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="artifacts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {artifacts.map((a) => (
              <Link key={a.key} href={`/personas/${slug}/artifact?key=${encodeURIComponent(a.key)}`} className="panel px-4 py-3 hover:border-border-strong transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{a.title}</span>
                  <Badge variant="muted">{a.type.replace(/_/g, " ")}</Badge>
                  <span className="ml-auto text-[10.5px] text-muted num">{a.format} · {fmtDate(a.updatedAt)}</span>
                </div>
                {a.description ? <p className="mt-1 text-[12px] text-muted line-clamp-2">{a.description}</p> : null}
                {a.sourcePath ? <p className="mt-1 text-[10.5px] text-muted-2 num truncate">{a.sourcePath}</p> : null}
              </Link>
            ))}
            {artifacts.length === 0 ? <p className="text-[12px] text-muted">No artifacts.</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="recent">
          <div className="space-y-1.5">
            {recent.map((m) => (
              <Link key={m.id} href={`/research/${m.id}`} className="flex items-center gap-2 panel px-4 py-2 text-[12px] hover:border-border-strong">
                <TickerLink ticker={m.ticker} />
                <span className="text-foreground-secondary truncate flex-1">{m.title}</span>
                {m.verdict ? <Badge variant={toneFor(m.verdict)}>{m.verdict}</Badge> : null}
                <span className="num text-muted">{fmtPct(m.expectedIrr)}</span>
                <span className="num text-muted">{fmtDate(m.occurredAt)}</span>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="knowledge">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {knowledge.map((k) => (
              <Link key={k.slug} href={`/knowledge/${k.slug}`} className="panel px-4 py-3 hover:border-border-strong">
                <div className="flex items-center gap-2"><span className="text-[13px] font-medium text-foreground">{k.title}</span><Badge variant="muted">{k.category}</Badge></div>
                {k.summary ? <p className="mt-1 text-[12px] text-muted line-clamp-2">{k.summary}</p> : null}
              </Link>
            ))}
            {knowledge.length === 0 ? <p className="text-[12px] text-muted">No knowledge docs linked. Run <code className="num">npm run migrate:knowledge</code>.</p> : null}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

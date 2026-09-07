"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { StreamItem } from "@/lib/db/research";
import type { ActivityRow, SearchHit } from "@/lib/db/types";
import { fmtDate, fmtDateTime, fmtPct, fmtPrice, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, toneFor } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerLink, PersonaChip, personaLabel } from "@/components/ticker-link";
import { EmptyState } from "@/components/ui/stat";

type Filters = { persona: string; verdict: string; kind: string; ticker: string; tag: string; mode: "latest" | "timeline" | "journal"; q: string; limit: number };

const VERDICTS = ["BUY", "BUY-MORE", "MAINTAIN", "WATCH", "TRIM", "EXIT", "PASS", "AVOID", "DATA_GAP"];
const KINDS = ["memo", "note", "journal", "decision", "review", "meeting", "agent"];

export function ResearchStream({
  items,
  hits,
  facets,
  personas,
  activity,
  filters,
}: {
  items: StreamItem[];
  hits: SearchHit[];
  facets: Array<{ tag: string; count: number }>;
  personas: Array<{ slug: string; name: string }>;
  activity: ActivityRow[];
  filters: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(filters.q);
  const [ticker, setTicker] = React.useState(filters.ticker);

  function update(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (k === "limit") continue;
      if (v && v !== "latest") params.set(k, String(v));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const active = [filters.persona && `persona: ${personaLabel(filters.persona)}`, filters.verdict && `verdict: ${filters.verdict}`, filters.kind && `kind: ${filters.kind}`, filters.ticker && `ticker: ${filters.ticker}`, filters.tag && `tag: ${filters.tag}`].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filters.mode} onValueChange={(v) => update({ mode: v as Filters["mode"] })}>
          <TabsList>
            <TabsTrigger value="latest">Latest</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
          </TabsList>
        </Tabs>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q, ticker });
          }}
        >
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Full-text search memos & notes…" className="pl-7 w-72" />
          </div>
          <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" className="w-24" />
          <Button type="submit" variant="secondary" size="sm">Search</Button>
        </form>
        <Select value={filters.persona} onChange={(e) => update({ persona: e.target.value })}>
          <option value="">All personas</option>
          {personas.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </Select>
        <Select value={filters.verdict} onChange={(e) => update({ verdict: e.target.value })}>
          <option value="">All verdicts</option>
          {VERDICTS.map((v) => <option key={v}>{v}</option>)}
        </Select>
        <Select value={filters.kind} onChange={(e) => update({ kind: e.target.value })}>
          <option value="">All kinds</option>
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </Select>
        {active.length ? (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setTicker(""); update({ persona: "", verdict: "", kind: "", ticker: "", tag: "", q: "" }); }}>
            <X /> Clear
          </Button>
        ) : null}
      </div>

      {facets.length ? (
        <div className="flex flex-wrap gap-1.5">
          {facets.map((f) => (
            <button
              key={f.tag}
              type="button"
              onClick={() => update({ tag: filters.tag === f.tag ? "" : f.tag })}
              className={cn(
                "rounded-[4px] border px-1.5 py-[2px] text-[10.5px] transition-colors",
                filters.tag === f.tag ? "border-gold/50 bg-gold-soft text-gold" : "border-border bg-surface-2 text-muted hover:text-foreground hover:border-border-strong",
              )}
            >
              {f.tag} <span className="num opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {filters.q ? (
        <div className="space-y-1.5">
          <p className="eyebrow">{hits.length} results for “{filters.q}”</p>
          {hits.length === 0 ? <EmptyState title="No matches" hint="Try fewer words, a ticker, or a phrase in quotes." /> : null}
          {hits.map((h) => (
            <Link key={h.id} href={`/research/${h.id}`} className="block panel px-4 py-3 hover:border-border-strong transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">{h.title}</span>
                {h.ticker ? <span className="num text-[11px] text-muted">{h.ticker}</span> : null}
                {h.verdict ? <Badge variant={toneFor(h.verdict)}>{h.verdict}</Badge> : null}
                <Badge variant="muted">{h.kind}</Badge>
                <span className="ml-auto text-[11px] text-muted">{personaLabel(h.persona_slug)} · {fmtDate(h.occurred_at)}</span>
              </div>
              {h.headline ? <p className="mt-1 text-[12px] text-foreground-secondary [&_b]:text-gold [&_b]:font-semibold" dangerouslySetInnerHTML={{ __html: h.headline }} /> : null}
            </Link>
          ))}
        </div>
      ) : filters.mode === "journal" ? (
        <JournalView items={items} activity={activity} />
      ) : filters.mode === "timeline" ? (
        <TimelineView items={items} />
      ) : (
        <LatestView items={items} />
      )}

      {!filters.q && items.length >= filters.limit ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => router.push(`${pathname}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, String(v)])), limit: String(filters.limit + 80) }).toString()}`)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StreamCard({ item }: { item: StreamItem }) {
  return (
    <Link href={`/research/${item.id}`} className="block panel px-4 py-3 hover:border-border-strong transition-colors animate-rise">
      <div className="flex items-center gap-2 flex-wrap">
        {item.ticker ? <TickerLink ticker={item.ticker} className="text-[13px]" /> : null}
        <span className="text-[13px] font-medium text-foreground truncate">{item.title}</span>
        {item.verdict ? <Badge variant={toneFor(item.verdict)}>{item.verdict}</Badge> : null}
        <Badge variant="muted">{item.kind}</Badge>
        {!item.isLatest ? <Badge variant="outline">superseded</Badge> : null}
        <span className="ml-auto text-[11px] text-muted whitespace-nowrap">{fmtDate(item.occurredAt)} · {fmtRelative(item.occurredAt)}</span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted flex-wrap">
        <PersonaChip slug={item.persona} />
        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
        {item.expectedIrr !== null ? <span className="num">IRR <span className={cn(item.expectedIrr >= 0.15 ? "text-pos" : "text-foreground-secondary")}>{fmtPct(item.expectedIrr)}</span></span> : null}
        {item.downside !== null ? <span className="num">downside <span className="text-neg">{fmtPct(item.downside, 0)}</span></span> : null}
        {item.price !== null ? <span className="num">@ {fmtPrice(item.price)}</span> : null}
        {item.buyPrice !== null ? <span className="num">buy ≤ {fmtPrice(item.buyPrice)}</span> : null}
        {item.pwv !== null ? <span className="num">PWV {fmtPrice(item.pwv)}</span> : null}
        {item.tags.filter((t) => t !== item.persona && t !== item.verdict?.toLowerCase()).slice(0, 4).map((t) => <span key={t} className="rounded-[3px] bg-surface-2 px-1 text-[10px]">{t}</span>)}
      </div>
      {item.excerpt ? <p className="mt-1.5 text-[12px] text-foreground-secondary line-clamp-2">{item.excerpt.replace(/[#*_>`]/g, "").slice(0, 260)}</p> : null}
    </Link>
  );
}

function LatestView({ items }: { items: StreamItem[] }) {
  if (items.length === 0) return <EmptyState title="No research matches these filters." hint="Clear a filter or write the first note." />;
  return <div className="space-y-1.5">{items.map((i) => <StreamCard key={i.id} item={i} />)}</div>;
}

function TimelineView({ items }: { items: StreamItem[] }) {
  const groups = new Map<string, StreamItem[]>();
  for (const i of items) {
    const day = i.occurredAt.slice(0, 10);
    const g = groups.get(day);
    if (g) g.push(i);
    else groups.set(day, [i]);
  }
  if (groups.size === 0) return <EmptyState title="Nothing on the timeline." />;
  return (
    <div className="relative pl-5">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
      {Array.from(groups.entries()).map(([day, list]) => (
        <div key={day} className="relative mb-5">
          <span className="absolute -left-5 top-1 size-[9px] rounded-full bg-gold ring-4 ring-background" />
          <p className="eyebrow mb-2">{fmtDate(day, "long")} · {list.length}</p>
          <div className="space-y-1.5">{list.map((i) => <StreamCard key={i.id} item={i} />)}</div>
        </div>
      ))}
    </div>
  );
}

function JournalView({ items, activity }: { items: StreamItem[]; activity: ActivityRow[] }) {
  type Entry = { at: string; node: React.ReactNode; key: string };
  const entries: Entry[] = [
    ...items.map((i) => ({ at: i.occurredAt, key: `n-${i.id}`, node: <StreamCard item={i} /> })),
    ...activity.map((a) => ({
      at: a.occurred_at,
      key: `a-${a.id}`,
      node: (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-muted">
          <span className="num text-muted-2 w-[92px]">{fmtDateTime(a.occurred_at)}</span>
          <Badge variant="muted">{a.kind}</Badge>
          {a.ticker ? <TickerLink ticker={a.ticker} /> : null}
          <span className="text-foreground-secondary truncate">{a.title}</span>
          {a.detail ? <span className="truncate">— {a.detail}</span> : null}
        </div>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (entries.length === 0) return <EmptyState title="The journal is empty." hint="Notes of kind journal/decision/review and every pipeline, trade and mandate event land here." action={<Button asChild><Link href="/research/new?kind=journal">Write today’s entry</Link></Button>} />;
  return <div className="space-y-1">{entries.map((e) => <div key={e.key}>{e.node}</div>)}</div>;
}

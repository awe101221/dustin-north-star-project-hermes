import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getActivity } from "@/lib/db/knowledge";
import { safeLoad } from "@/lib/server/safe";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { TickerLink } from "@/components/ticker-link";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const KINDS = ["idea", "note", "trade", "mandate", "persona", "task", "job"];

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const db = serverReadClient();
  const header = <PageHeader eyebrow="Timeline" title="Activity" description="Every change Hermes recorded: pipeline moves, notes, trades, mandate versions, persona edits, agent results. Written by database triggers, so agent and UI writes look identical." />;
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(() => getActivity(db, { limit: 300 }));
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  const rows = result.data;
  const filtered = sp.kind ? rows.filter((r) => r.kind.startsWith(sp.kind!)) : rows;
  const groups = new Map<string, typeof rows>();
  for (const r of filtered) {
    const day = r.occurred_at.slice(0, 10);
    const g = groups.get(day);
    if (g) g.push(r);
    else groups.set(day, [r]);
  }
  return (
    <>
      {header}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Link href="/activity" className={`rounded-md border px-2 py-1 text-[11.5px] ${!sp.kind ? "border-gold/50 bg-gold-soft text-gold" : "border-border text-muted"}`}>all</Link>
        {KINDS.map((k) => <Link key={k} href={`/activity?kind=${k}`} className={`rounded-md border px-2 py-1 text-[11.5px] ${sp.kind === k ? "border-gold/50 bg-gold-soft text-gold" : "border-border text-muted"}`}>{k}</Link>)}
      </div>
      {filtered.length === 0 ? <p className="text-[12px] text-muted panel px-6 py-10 text-center">Nothing yet — move a card, log a trade, save the mandate.</p> : null}
      <div className="relative pl-5">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {Array.from(groups.entries()).map(([day, list]) => (
          <div key={day} className="relative mb-5">
            <span className="absolute -left-5 top-1 size-[9px] rounded-full bg-gold ring-4 ring-background" />
            <p className="eyebrow mb-1.5">{day} · {list.length}</p>
            <div className="panel divide-y divide-border">
              {list.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                  <span className="num text-muted-2 w-[92px]">{fmtDateTime(a.occurred_at)}</span>
                  <Badge variant="muted">{a.kind}</Badge>
                  {a.ticker ? <TickerLink ticker={a.ticker} /> : null}
                  <span className="text-foreground-secondary truncate">{a.title}</span>
                  {a.detail ? <span className="text-muted truncate hidden md:inline">— {a.detail}</span> : null}
                  <span className="ml-auto text-[10.5px] text-muted">{a.actor}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

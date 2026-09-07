import Link from "next/link";
import { ArrowUpRight, Calculator, Eye, ListChecks, Target, Trophy } from "lucide-react";
import type { BestIdeasDashboard, RankedBestIdea } from "@/lib/best-ideas";
import { getQqqLineInSand } from "@/lib/best-ideas";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, toneFor } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TickerLink, PersonaChip } from "@/components/ticker-link";

function UnderwritingPanels({ idea }: { idea: RankedBestIdea }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <div className="panel-2 p-2.5">
        <p className="eyebrow mb-1">Why this over QQQ?</p>
        <p className="text-[12px] leading-4 text-foreground-secondary">{idea.qqqQuestion}</p>
      </div>
      <div className="panel-2 p-2.5">
        <p className="eyebrow mb-1">QQQ is better if…</p>
        <p className="text-[12px] leading-4 text-foreground-secondary">{idea.falsifier || "Falsifier missing — make this the next research task."}</p>
      </div>
      <div className="panel-2 p-2.5">
        <p className="eyebrow mb-1">Line-in-sand reason</p>
        <p className="text-[12px] leading-4 text-foreground-secondary">{idea.qqqLineReason || "Daily price refresh can move this above or below the QQQ line."}</p>
      </div>
      <div className="panel-2 p-2.5">
        <p className="eyebrow mb-1">Next Hermes action</p>
        <p className="text-[12px] leading-4 text-foreground-secondary">{idea.nextAction || idea.catalyst || "Refresh evidence, update rank, and compare to QQQ."}</p>
      </div>
    </div>
  );
}

function IdeaRow({ idea, dense = false }: { idea: RankedBestIdea; dense?: boolean }) {
  const isTop = idea.lane === "top-ten";
  return (
    <div className={cn("rounded-lg border border-border bg-surface/70 p-3 sm:p-4", dense ? "space-y-2" : "space-y-3")}>
      <div className="flex items-start gap-3">
        <div className={cn("num flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[13px] font-semibold", isTop ? "border-gold/40 bg-gold-soft text-gold" : "border-cyan/35 bg-cyan-soft text-cyan")}>
          #{idea.rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <TickerLink ticker={idea.ticker} className="text-[15px]" />
                {idea.companyName ? <span className="text-[12px] text-muted">{idea.companyName}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="eyebrow">Score</p>
              <p className={cn("num text-[18px] font-semibold", isTop ? "text-gold" : "text-cyan")}>{idea.scoreLabel}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={toneFor(idea.stage)}>{idea.stage}</Badge>
            {idea.theme ? <Badge variant="outline">{idea.theme}</Badge> : null}
            <Badge variant={idea.qqqLine === "above" ? "pos" : "warn"}>{idea.qqqLine === "above" ? "above QQQ line" : "below QQQ line"}</Badge>
            <PersonaChip slug={idea.persona} />
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-foreground-secondary">{idea.thesis || "Needs a fresh Hermes thesis."}</p>
        </div>
      </div>

      {!dense ? (
        <>
          <div className="hidden sm:block"><UnderwritingPanels idea={idea} /></div>
          <details className="group rounded-md border border-border bg-surface-2 sm:hidden">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-[11.5px] font-medium text-foreground-secondary">
              Underwriting details <span className="text-muted group-open:rotate-180">⌄</span>
            </summary>
            <div className="border-t border-border p-2"><UnderwritingPanels idea={idea} /></div>
          </details>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-muted-2">
        <span>Conviction {idea.conviction ?? "—"}</span>
        <span>·</span>
        <span>Risk {idea.risk ?? "—"}</span>
        <span>·</span>
        <span>Target {fmtPct(idea.targetWeight, 1)}</span>
        <span>·</span>
        <span>Current {fmtPct(idea.currentWeight, 1)}</span>
        {idea.missing.length ? <Badge variant="warn">needs {idea.missing.join(", ")}</Badge> : <Badge variant="pos">QQQ case complete</Badge>}
        <Link href={`/companies/${encodeURIComponent(idea.ticker)}`} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-[11.5px] font-medium text-foreground-secondary hover:border-gold/40 hover:bg-gold-soft hover:text-gold sm:ml-auto sm:min-h-9 sm:w-auto">
          <Calculator className="size-3.5" /> Full company model
        </Link>
      </div>
    </div>
  );
}

function IdeaList({ title, description, icon, ideas, empty, dense = false }: { title: string; description: string; icon: React.ReactNode; ideas: RankedBestIdea[]; empty: string; dense?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="inline-flex items-center gap-1.5">{icon}{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ideas.length ? ideas.map((idea) => <IdeaRow key={`${idea.lane}-${idea.id}`} idea={idea} dense={dense} />) : <p className="py-8 text-center text-[12px] text-muted">{empty}</p>}
      </CardContent>
    </Card>
  );
}

function QqqLinePanel({ dashboard, compact = false }: { dashboard: BestIdeasDashboard; compact?: boolean }) {
  const line = getQqqLineInSand(dashboard);
  const aboveTickers = line.above.slice(0, compact ? 8 : 20);
  const belowTickers = line.below.slice(0, compact ? 8 : 20);
  return (
    <Card className="border-gold/30 bg-gold-soft/40">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="inline-flex items-center gap-1.5"><Target className="size-3.5 text-gold" /> QQQ-beating line in the sand</CardTitle>
            <CardDescription>
              Only names above this line currently clear the QQQ hurdle. Everything below defaults to QQQ until price, fundamentals, or evidence improve.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <Badge variant="gold">{line.hurdleLabel}</Badge>
            <Badge variant="cyan">daily price refresh</Badge>
            <span>last refresh {fmtDateTime(line.lastPriceRefresh)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1fr_auto_1fr]")}>
        <div className="panel-2 p-3">
          <p className="eyebrow mb-2">Above line · modeled QQQ beaters ({line.above.length})</p>
          <div className="flex flex-wrap gap-2">
            {aboveTickers.length ? aboveTickers.map((idea) => <Badge key={`above-${idea.ticker}`} variant="pos">{idea.ticker}</Badge>) : <span className="text-[12px] text-muted">No names clear the line today.</span>}
          </div>
        </div>
        {!compact ? <div className="flex items-center justify-center"><div className="h-full min-h-10 border-l border-dashed border-gold/60" /></div> : null}
        <div className="panel-2 p-3">
          <p className="eyebrow mb-2">Below line · QQQ better by default ({line.below.length})</p>
          <div className="flex flex-wrap gap-2">
            {belowTickers.length ? belowTickers.map((idea) => <Badge key={`below-${idea.ticker}`} variant="warn">{idea.ticker}</Badge>) : <span className="text-[12px] text-muted">Every ranked name clears the line today.</span>}
          </div>
          {line.firstBelow ? <p className="mt-2 text-[11.5px] text-muted">First below: {line.firstBelow.ticker} — {line.firstBelow.qqqLineReason ?? "needs a better price or stronger evidence."}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BestIdeasView({ dashboard, compact = false }: { dashboard: BestIdeasDashboard; compact?: boolean }) {
  const visibleTop = compact ? dashboard.topTen.slice(0, 5) : dashboard.topTen;
  const visibleWatch = compact ? dashboard.watchlistTen.slice(0, 5) : dashboard.watchlistTen;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel col-span-2 p-4 md:col-span-2">
          <p className="eyebrow">Dustin North Star Project Hermes</p>
          <h2 className="mt-1 text-[18px] font-semibold text-foreground">One ranked 10 + 10 list</h2>
          <p className="mt-1 text-[12.5px] leading-5 text-muted">{dashboard.snapshotThesis ?? dashboard.mandate} Every name links to its company page and five-year model.</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Top ideas</p>
          <p className="num mt-1 text-[24px] font-semibold text-gold">{dashboard.topTen.length}</p>
          <p className="text-[11px] text-muted">highest ranked active ideas</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Watchlist</p>
          <p className="num mt-1 text-[24px] font-semibold text-cyan">{dashboard.watchlistTen.length}</p>
          <p className="text-[11px] text-muted">next best research candidates</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Badge variant="gold"><Target className="size-3" /> Beat QQQ over 10 years</Badge>
        <Badge variant="cyan">Source: {dashboard.sourceMode === "hermes-snapshot" ? "latest Hermes snapshot" : "scored idea table"}</Badge>
        <Badge variant="cyan">Generated by {dashboard.generatedBy}</Badge>
        <span>{dashboard.totalActive} active ideas ranked</span>
        <span>·</span>
        <span>Last Hermes refresh {fmtDateTime(dashboard.lastUpdated)}</span>
        {compact ? <Link href="/best-ideas" className="ml-auto inline-flex items-center gap-1 text-cyan hover:underline">View full Top 10 + Watchlist 10 <ArrowUpRight className="size-3" /></Link> : null}
        <Link href="/learnings" className={compact ? "inline-flex items-center gap-1 text-cyan hover:underline" : "ml-auto inline-flex items-center gap-1 text-cyan hover:underline"}>View Learnings archive <ArrowUpRight className="size-3" /></Link>
      </div>

      <QqqLinePanel dashboard={dashboard} compact={compact} />

      <div className={cn("grid gap-4", compact ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1")}>
        <IdeaList
          title="Top 10"
          description="Hermes's current highest-conviction candidates for beating QQQ over the next decade. Not a trade recommendation."
          icon={<Trophy className="size-3.5 text-gold" />}
          ideas={visibleTop}
          empty="No Top 10 ideas yet. Add Hermes-ranked cards to the pipeline."
          dense={compact}
        />
        <IdeaList
          title="Watchlist 10"
          description="The next ten candidates: promising enough to monitor, but still behind the Top 10 on conviction, evidence, risk, or QQQ-relative edge."
          icon={<Eye className="size-3.5 text-cyan" />}
          ideas={visibleWatch}
          empty="No Watchlist ideas yet. Hermes needs more active research cards."
          dense={compact}
        />
      </div>

      {!compact ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="inline-flex items-center gap-1.5"><ListChecks className="size-3.5 text-gold" /> How Hermes ranks this list</CardTitle>
              <CardDescription>The list is intentionally simple: own the few ideas with the strongest QQQ-relative case, watch the next best, and push everything else into research backlog.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4 text-[12px] text-foreground-secondary">
            <div className="panel-2 p-3"><p className="eyebrow mb-1">1 · Conviction</p><p>Higher conviction improves rank only when the thesis is explicit.</p></div>
            <div className="panel-2 p-3"><p className="eyebrow mb-1">2 · QQQ edge</p><p>Missing “why this beats QQQ” is heavily penalized.</p></div>
            <div className="panel-2 p-3"><p className="eyebrow mb-1">3 · Risk</p><p>Fragile, high-drawdown ideas move down until falsifiers are clear.</p></div>
            <div className="panel-2 p-3"><p className="eyebrow mb-1">4 · Recency</p><p>Ties go to the freshest Hermes research update.</p></div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

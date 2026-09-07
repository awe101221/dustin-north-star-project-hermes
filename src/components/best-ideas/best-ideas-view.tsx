import Link from "next/link";
import { ArrowUpRight, Eye, ListChecks, Target, Trophy } from "lucide-react";
import type { BestIdeasDashboard, RankedBestIdea } from "@/lib/best-ideas";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, toneFor } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TickerLink, PersonaChip } from "@/components/ticker-link";

function IdeaRow({ idea, dense = false }: { idea: RankedBestIdea; dense?: boolean }) {
  const isTop = idea.lane === "top-ten";
  return (
    <div className={cn("rounded-lg border border-border bg-surface/70 p-3", dense ? "space-y-2" : "space-y-3")}>
      <div className="flex items-start gap-3">
        <div className={cn("num flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[13px] font-semibold", isTop ? "border-gold/40 bg-gold-soft text-gold" : "border-cyan/35 bg-cyan-soft text-cyan")}>
          #{idea.rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TickerLink ticker={idea.ticker} className="text-[14px]" />
            {idea.companyName ? <span className="truncate text-[12px] text-muted">{idea.companyName}</span> : null}
            <Badge variant={toneFor(idea.stage)}>{idea.stage}</Badge>
            {idea.theme ? <Badge variant="outline">{idea.theme}</Badge> : null}
            <PersonaChip slug={idea.persona} />
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-foreground-secondary">{idea.thesis || "Needs a fresh Hermes thesis."}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="eyebrow">Hermes score</p>
          <p className={cn("num text-[18px] font-semibold", isTop ? "text-gold" : "text-cyan")}>{idea.scoreLabel}</p>
        </div>
      </div>

      {!dense ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="panel-2 p-2.5">
            <p className="eyebrow mb-1">Why this over QQQ?</p>
            <p className="text-[12px] leading-4 text-foreground-secondary">{idea.qqqQuestion}</p>
          </div>
          <div className="panel-2 p-2.5">
            <p className="eyebrow mb-1">QQQ is better if…</p>
            <p className="text-[12px] leading-4 text-foreground-secondary">{idea.falsifier || "Falsifier missing — make this the next research task."}</p>
          </div>
          <div className="panel-2 p-2.5">
            <p className="eyebrow mb-1">Next Hermes action</p>
            <p className="text-[12px] leading-4 text-foreground-secondary">{idea.nextAction || idea.catalyst || "Refresh evidence, update rank, and compare to QQQ."}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-2">
        <span>Conviction {idea.conviction ?? "—"}</span>
        <span>·</span>
        <span>Risk {idea.risk ?? "—"}</span>
        <span>·</span>
        <span>Target {fmtPct(idea.targetWeight, 1)}</span>
        <span>·</span>
        <span>Current {fmtPct(idea.currentWeight, 1)}</span>
        {idea.missing.length ? <Badge variant="warn">needs {idea.missing.join(", ")}</Badge> : <Badge variant="pos">QQQ case complete</Badge>}
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

export function BestIdeasView({ dashboard, compact = false }: { dashboard: BestIdeasDashboard; compact?: boolean }) {
  const visibleTop = compact ? dashboard.topTen.slice(0, 5) : dashboard.topTen;
  const visibleWatch = compact ? dashboard.watchlistTen.slice(0, 5) : dashboard.watchlistTen;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="panel p-4 md:col-span-2">
          <p className="eyebrow">Dustin North Star Project Hermes</p>
          <h2 className="mt-1 text-[18px] font-semibold text-foreground">Hermes best ideas, ranked now</h2>
          <p className="mt-1 text-[12.5px] leading-5 text-muted">{dashboard.mandate} Chat remains the main interface; this page is the organized results board.</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Top 10</p>
          <p className="num mt-1 text-[24px] font-semibold text-gold">{dashboard.topTen.length}</p>
          <p className="text-[11px] text-muted">highest ranked active ideas</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Watchlist 10</p>
          <p className="num mt-1 text-[24px] font-semibold text-cyan">{dashboard.watchlistTen.length}</p>
          <p className="text-[11px] text-muted">next best research candidates</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Badge variant="gold"><Target className="size-3" /> Beat QQQ over 10 years</Badge>
        <Badge variant="cyan">Generated by {dashboard.generatedBy}</Badge>
        <span>{dashboard.totalActive} active ideas ranked</span>
        <span>·</span>
        <span>Last Hermes refresh {fmtDateTime(dashboard.lastUpdated)}</span>
        {compact ? <Link href="/best-ideas" className="ml-auto inline-flex items-center gap-1 text-cyan hover:underline">View full Top 10 + Watchlist 10 <ArrowUpRight className="size-3" /></Link> : null}
      </div>

      <div className={cn("grid gap-4", compact ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1")}>
        <IdeaList
          title="Top 10 best ideas"
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

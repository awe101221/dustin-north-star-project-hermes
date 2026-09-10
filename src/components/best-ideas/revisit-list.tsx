import Link from "next/link";
import { Calculator, History } from "lucide-react";
import type { BestIdeasDashboard } from "@/lib/best-ideas";
import type { LatestResearchUpdate } from "@/lib/db/research";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TickerLink } from "@/components/ticker-link";
import { RevisitReviewButton } from "./revisit-review-button";

export function RevisitList({ dashboard, research, canWrite }: { dashboard: BestIdeasDashboard; research: Record<string, LatestResearchUpdate>; canWrite: boolean }) {
  return (
    <Card id="revisit">
      <CardHeader>
        <div>
          <CardTitle className="inline-flex items-center gap-1.5"><History className="size-3.5 text-cyan" /> Revisit · Former 10 + 10</CardTitle>
          <CardDescription>Companies replaced from either list stay here with their research and models. Review new evidence, refresh the QQQ case, and reconsider them for a future 10 + 10.</CardDescription>
        </div>
        <Badge variant="outline">{dashboard.revisit.length} companies</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {dashboard.revisitError ? <p role="alert" className="text-[12px] text-warn">{dashboard.revisitError}</p> : dashboard.revisit.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted">{dashboard.sourceMode === "idea-table" ? "Revisit tracking starts with published Hermes ranking snapshots." : "No former selections yet. Companies will appear here automatically when a published refresh replaces them from the 10 + 10."}</p>
        ) : dashboard.revisit.map(({ idea, removedAt, lastSnapshotId }) => {
          const update = research[idea.ticker];
          const fresh = update?.item && Date.parse(update.item.occurredAt) > Date.parse(removedAt);
          return (
            <article key={idea.ticker} className="space-y-3 rounded-lg border border-border bg-surface/70 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TickerLink ticker={idea.ticker} className="text-[15px]" />
                {idea.companyName ? <span className="text-[12px] text-muted">{idea.companyName}</span> : null}
                <Badge variant="outline">Former {idea.lane === "top-ten" ? "Top 10" : "Watchlist 10"} · #{idea.rank}</Badge>
                {fresh ? <Badge variant="cyan">New research since exit</Badge> : null}
              </div>
              <p className="text-[11px] text-muted">Moved to Revisit {fmtDateTime(removedAt)} · Last ranked {fmtDateTime(idea.updatedAt)}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="panel-2 p-3"><p className="eyebrow mb-1">Last ranked thesis</p><p className="text-[12px] text-foreground-secondary">{idea.thesis || "No thesis recorded in the prior ranking."}</p>{idea.modeledReturn !== null ? <p className="mt-2 text-[11px] text-muted">Modeled return at last ranking: {fmtPct(idea.modeledReturn, 1)} · historical estimate</p> : null}</div>
                <div className="panel-2 p-3"><p className="eyebrow mb-1">Re-entry review</p><p className="text-[12px] text-foreground-secondary">{idea.nextAction || "Refresh valuation, fundamentals and the model; compare the updated QQQ case with the current selections."}</p><p className="mt-2 text-[11px] text-muted">Prior falsifier: {idea.falsifier || "Needs an explicit falsifier."}</p></div>
                <div className="panel-2 p-3"><p className="eyebrow mb-1">Latest research</p>{update?.unavailable || !update ? <p className="text-[12px] text-warn">Research updates unavailable. Open the company dossier to retry.</p> : update.item ? <><Link className="text-[12px] text-cyan hover:underline" href={`/research/${update.item.id}`}>{update.item.title}</Link><p className="mt-2 text-[11px] text-muted">{fmtDateTime(update.item.occurredAt)}{fresh ? " · Ready for review" : " · No newer research since exit"}</p></> : <p className="text-[12px] text-muted">No research recorded yet. Request a re-entry review to refresh the evidence.</p>}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/companies/${encodeURIComponent(idea.ticker)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-cyan hover:underline"><Calculator className="size-3.5" /> Company &amp; model</Link>
                <RevisitReviewButton ticker={idea.ticker} nextAction={idea.nextAction} canWrite={canWrite} />
                {lastSnapshotId ? <Link href={`/research/${lastSnapshotId}`} className="text-[11px] text-muted hover:text-cyan hover:underline">Last ranked snapshot</Link> : null}
              </div>
            </article>
          );
        })}
        <p className="text-[11px] text-muted">Research dates refresh when this page loads. A review request queues work for Hermes; re-entry happens when a new ranked snapshot includes the company again.</p>
      </CardContent>
    </Card>
  );
}

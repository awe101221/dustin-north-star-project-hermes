import { Archive, Brain, CalendarClock, Lightbulb, RefreshCw } from "lucide-react";
import type { LearningArchive } from "@/lib/learnings";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEFAULT_PRINCIPLES = [
  "QQQ is the default unless an active idea has a clear 10-year opportunity-cost edge.",
  "Every Top 10 idea must state why it beats QQQ and what would make QQQ better.",
  "Incomplete risk or falsifier work pushes an idea toward Watchlist, not Top 10.",
  "Hermes rankings should change when evidence improves, breaks, or reprices.",
];

export function LearningsView({ archive }: { archive: LearningArchive }) {
  const current = archive.current;
  const principles = archive.principles.length ? archive.principles : DEFAULT_PRINCIPLES;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle className="inline-flex items-center gap-1.5"><Brain className="size-3.5 text-gold" /> Current investing philosophy</CardTitle>
              <CardDescription>The rules Hermes is using to build and adjust the Top 10 + Watchlist 10 for beating QQQ over 10 years.</CardDescription>
            </div>
            <Badge variant="gold">continuous learning</Badge>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-[12.5px] leading-5 text-foreground-secondary">
              {current?.summary ?? "No persisted learning snapshot yet. Hermes will use the baseline philosophy below until daily or event-driven learning notes are published."}
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {principles.map((principle, index) => (
                <div key={principle} className="panel-2 p-3">
                  <p className="eyebrow mb-1">Principle {index + 1}</p>
                  <p className="text-[12px] leading-5 text-foreground-secondary">{principle}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="inline-flex items-center gap-1.5"><RefreshCw className="size-3.5 text-cyan" /> Update cadence</CardTitle>
              <CardDescription>How this page stays useful.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-[12px] leading-5 text-foreground-secondary">
            <div className="panel-2 p-3">
              <p className="eyebrow mb-1">Daily</p>
              <p>Hermes should publish a short philosophy learning snapshot after the daily research pass, even if the answer is “no philosophy change.”</p>
            </div>
            <div className="panel-2 p-3">
              <p className="eyebrow mb-1">Event-driven</p>
              <p>Any memo, market event, mistake, or ranking change that improves the Top 10 process should create an archive entry.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <CalendarClock className="size-3.5" /> Last update {fmtDateTime(current?.asOf)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="inline-flex items-center gap-1.5"><Lightbulb className="size-3.5 text-gold" /> Latest learning changes</CardTitle>
            <CardDescription>What changed in Hermes investing philosophy and how it affects the ranked list.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {current?.changes.length ? current.changes.map((change) => (
            <div key={`${change.rank}-${change.title}`} className="rounded-lg border border-border bg-surface/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">#{change.rank}</Badge>
                <p className="text-[13px] font-semibold text-foreground">{change.title}</p>
                {change.source ? <Badge variant="outline">{change.source}</Badge> : null}
              </div>
              <p className="mt-2 text-[12.5px] leading-5 text-foreground-secondary">{change.learning}</p>
              <div className="mt-2 panel-2 p-2.5">
                <p className="eyebrow mb-1">Implication for Top 10 + Watchlist 10</p>
                <p className="text-[12px] leading-4 text-muted">{change.implication}</p>
              </div>
              {change.tickers.length ? <p className="mt-2 num text-[11px] text-muted">Tickers: {change.tickers.join(", ")}</p> : null}
            </div>
          )) : <p className="py-8 text-center text-[12px] text-muted">No learning changes have been archived yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="inline-flex items-center gap-1.5"><Archive className="size-3.5 text-cyan" /> Learning archive</CardTitle>
            <CardDescription>Reverse-chronological record of daily and event-driven philosophy updates.</CardDescription>
          </div>
          <Badge variant="cyan">{archive.entries.length} entries</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {archive.entries.length ? archive.entries.map((entry) => (
            <details key={entry.id} className="rounded-md border border-border bg-surface/50 p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{fmtDateTime(entry.asOf)}</Badge>
                  <span className="text-[13px] font-semibold text-foreground">{entry.title}</span>
                  <span className="text-[11px] text-muted">{entry.changes.length} changes</span>
                </div>
                <p className="mt-1 text-[12px] text-muted">{entry.summary}</p>
              </summary>
              <div className="mt-3 space-y-2">
                {entry.changes.map((change) => (
                  <div key={`${entry.id}-${change.rank}`} className="panel-2 p-2.5 text-[12px] leading-4 text-foreground-secondary">
                    <p className="font-medium text-foreground">{change.title}</p>
                    <p className="mt-1">{change.learning}</p>
                    <p className="mt-1 text-muted">Implication: {change.implication}</p>
                  </div>
                ))}
              </div>
            </details>
          )) : <p className="py-8 text-center text-[12px] text-muted">Archive will populate when Hermes publishes learning snapshots.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

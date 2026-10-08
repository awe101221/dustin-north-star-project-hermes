"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, fmtPct, fmtPrice } from "@/lib/format";
import type { RankedForecast, SleeveRanking } from "@/lib/qqq-rankings";
import { SLEEVE_LABELS } from "@/lib/ranking-constants";
import { bareSymbol } from "@/lib/utils";

function ForecastRow({ row }: { row: RankedForecast }) {
  return <li className="rounded-lg border border-border bg-surface/70">
    <div className="flex items-start gap-3 p-3 sm:p-4">
      <span className="num w-9 shrink-0 pt-1 text-[14px] text-muted">{row.rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/companies/${encodeURIComponent(row.ticker)}`} className="num text-[15px] font-semibold text-gold hover:underline">{bareSymbol(row.ticker)}</Link>
            <p className="break-words text-[12px] text-foreground-secondary">{row.companyName}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-[20px] font-semibold text-cyan">{fmtPct(row.probabilityBeatQqq, 1)}</p>
            <p className="text-[10px] text-muted">modeled likelihood</p>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-foreground-secondary">{row.whyBeatQqq}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{row.theme}</span><span>Model {fmtDateTime(row.modelAsOf)}</span>
        </div>
      </div>
    </div>
    <details className="border-t border-border">
      <summary className="cursor-pointer px-4 py-2.5 text-[11px] text-muted hover:text-cyan">Scenarios, sources &amp; falsifier</summary>
      <div className="space-y-3 px-4 pb-4 text-[12px] leading-5">
        <p>{row.thesis}</p>
        <p><span className="font-medium">Probability assumptions:</span> {row.probabilityRationale}</p>
        <p><span className="font-medium">Shares, financing &amp; dilution:</span> {row.capitalStructure}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="eyebrow">QQQ wins if</dt><dd>{row.falsifier}</dd></div>
          <div><dt className="eyebrow">Next review</dt><dd>{row.nextAction}</dd></div>
          <div><dt className="eyebrow">Expected stock / QQQ annualized return</dt><dd className="num">{fmtPct(row.expectedAnnualizedReturn)} / {fmtPct(row.expectedQqqReturn)}</dd></div>
          <div><dt className="eyebrow">Valuation price</dt><dd>{fmtPrice(row.currentPrice, row.currency)} · {fmtDateTime(row.priceAsOf)}</dd></div>
        </dl>
        <div className="space-y-2" aria-label={`${bareSymbol(row.ticker)} matched scenarios`}>
          {row.scenarios.map((s) => <div key={s.name} className="panel-2 p-3">
            <p className="font-medium">{s.name} · {fmtPct(s.probability)} weight</p>
            <p className="num text-[11px] text-cyan">Stock {fmtPct(s.stockAnnualizedReturn)} / QQQ {fmtPct(s.qqqAnnualizedReturn)} annualized · stock year-five price {fmtPrice(s.stockTerminalPrice, row.currency)}</p>
            <p className="text-foreground-secondary">{s.rationale}</p>
          </div>)}
        </div>
        <p className="text-muted">{row.limitations}</p>
        <div className="flex flex-wrap gap-3">{row.evidenceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-cyan hover:underline">Source {i + 1}<ArrowUpRight className="size-3" /></a>)}</div>
      </div>
    </details>
  </li>;
}

export function SleeveRankingView({ ranking, coverageError }: { ranking: SleeveRanking; coverageError?: string | null }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const rows = ranking.rows.filter((r) => `${r.ticker} ${r.companyName} ${r.theme}`.toLowerCase().includes(needle));
  const publication = ranking.publication;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <Link href="/" className={`rounded-md border px-3 py-2 ${ranking.sleeve === "core" ? "border-gold/50 text-gold" : "border-border text-muted hover:text-gold"}`}>North Star Top 50</Link>
      <Link href="/ai-regime" className={`rounded-md border px-3 py-2 ${ranking.sleeve === "ai-regime" ? "border-cyan/50 text-cyan" : "border-border text-muted hover:text-cyan"}`}>AI Regime Top 50</Link>
      <Badge variant={ranking.missingSlots ? "warn" : "pos"}>{ranking.rows.length} / 50 ranked</Badge>
      <span className="sm:ml-auto text-muted">Updated {fmtDateTime(ranking.asOf)}</span>
    </div>
    <p className="text-[12px] leading-5 text-muted">Ordered by modeled probability that the stock beats QQQ over five years, using matched price-return scenarios. Estimates reflect model assumptions; they are not calibrated success rates. Equal estimates share the same likelihood and use alphabetical ordering.</p>
    {ranking.missingSlots ? <div className="panel border-warn/30 p-4 text-[12px] leading-5" role="status">
      <p className="font-medium">{ranking.missingSlots} ranking slots await fresh, independently reviewed QQQ forecasts.</p>
      <p className="mt-1 text-muted">{ranking.rows.length ? "The reviewed names below have comparable forecasts." : "No independently reviewed likelihood forecasts have been published yet. Existing research and company models remain available below."}</p>
    </div> : null}
    <label className="flex max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-[12px]">
      <Search className="size-4 text-muted" /><span className="sr-only">Search {SLEEVE_LABELS[ranking.sleeve]} ranking</span>
      <input className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, ticker, or theme" />
    </label>
    <ol aria-label={`${SLEEVE_LABELS[ranking.sleeve]} Top 50 ranking`} className="space-y-2">
      {rows.map((row) => <ForecastRow key={row.securityId} row={row} />)}
    </ol>
    {ranking.rows.length && !rows.length ? <p className="p-4 text-[12px] text-muted">No ranked companies match this search.</p> : null}
    <details className="panel p-4" open={ranking.rows.length === 0}>
      <summary className="cursor-pointer text-[13px] font-medium">Research awaiting a comparable forecast · {ranking.candidates.length + ranking.stale.length}</summary>
      {coverageError ? <p role="alert" className="mt-3 text-[12px] text-warn">{coverageError}</p> : null}
      <p className="my-3 text-[11px] text-muted">These names remain unranked until their security identity and comparable QQQ forecast are reviewed. Prior scores and expected returns do not establish likelihood of beating QQQ.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ranking.stale.map((c) => <Link key={c.ticker} href={`/companies/${encodeURIComponent(c.ticker)}`} className="panel-2 p-3 text-[12px]">
          <span className="num text-gold">{bareSymbol(c.ticker)}</span><p>{c.companyName}</p><p className="text-[11px] text-warn">Model or valuation price needs refresh.</p>
        </Link>)}
        {ranking.candidates.map((c) => <Link key={c.ticker} href={`/companies/${encodeURIComponent(c.ticker)}`} className="panel-2 p-3 text-[12px] hover:border-cyan/40">
          <span className="num text-gold">{bareSymbol(c.ticker)}</span><p>{c.companyName}</p><p className="mt-1 text-[11px] text-muted">QQQ likelihood forecast pending review.</p>
        </Link>)}
      </div>
    </details>
    {publication ? <details className="panel p-4 text-[12px] leading-5">
      <summary className="cursor-pointer font-medium">Methodology &amp; independent review</summary>
      <p className="mt-3 text-foreground-secondary">{publication.draft.methodology}</p>
      <p className="mt-2 text-muted">QQQ valuation {fmtPrice(publication.draft.benchmarkPrice)} · {fmtDateTime(publication.draft.benchmarkAsOf)} · five-year price-only basis.</p>
      <p className="mt-2 text-muted">{publication.review.verdict} · {publication.review.taskId} · PM {publication.approval.taskId}</p>
      <p className="mt-2 break-all font-mono text-[10px] text-muted">Reviewed content SHA-256 {publication.review.contentHash}</p>
      <div className="mt-2 flex flex-wrap gap-3">{publication.draft.benchmarkEvidenceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-cyan hover:underline">QQQ source {i + 1}</a>)}</div>
    </details> : null}
  </div>;
}

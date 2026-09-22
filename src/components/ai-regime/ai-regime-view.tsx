import Link from "next/link";
import { ArrowUpRight, Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import type { AiRegimeModule, AiRegimeRow } from "@/lib/ai-regime";
import { fmtDate, fmtPct } from "@/lib/format";

const workflowLink = "inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-border px-3 text-[12px] text-cyan hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-cyan";

const TAXONOMY_LABELS: Record<string, string> = {
  "direct-ai": "Direct AI",
  "compute-network-memory-packaging": "Compute / network / memory / packaging",
  "power-cooling-grid-data-centers": "Power / cooling / grid / data centers",
  "data-application-saas": "Data / application / SaaS",
  "security-governance": "Security / governance",
  "physical-ai-robotics-autonomy": "Physical AI / robotics / autonomy",
  "industrial-defense-manufacturing": "Industrial / defense / manufacturing",
  "space-compute-connectivity-launch-manufacturing-ground": "Space compute / connectivity / launch / manufacturing / ground",
  "key-source-material-component": "Key-source / material / component owners",
  "second-order-services-adapters": "Second-order services / adapters",
  "threatened-pools": "Threatened pools",
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="panel-2 min-w-0 p-3"><dt className="eyebrow mb-1">{label}</dt><dd className="break-words text-[12px] leading-5 text-foreground-secondary">{children}</dd></div>;
}

function RosterCard({ row }: { row: AiRegimeRow }) {
  return <article className="panel space-y-3 p-3 sm:p-5" aria-label={`${row.symbol} AI Regime sleeve row`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link className="num text-[17px] font-semibold text-gold hover:underline" href={`/companies/${encodeURIComponent(row.ticker)}`}>{row.symbol}</Link>
          <span className="text-[12px] text-muted">{row.companyName}</span>
        </h3>
        <p className="mt-1 break-words text-[11px] text-muted">{row.exposureType} · {row.domains.join(", ")}</p>
      </div>
      <Badge variant="cyan">{row.sleeveStatus}</Badge>
    </div>
    <p className="text-[13px] leading-5 text-foreground-secondary">{row.thesis || "Thesis missing."}</p>
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Detail label="5y expected IRR"><span className="num font-semibold">{fmtPct(row.fiveYearExpectedIrr)}</span></Detail>
      <Detail label="10y expected IRR"><span className="num font-semibold">{fmtPct(row.tenYearExpectedIrr)}</span></Detail>
      <Detail label="Capital Line">{row.clearsCapitalLine ? "Clears >12%" : "Does not clear >12%"}</Detail>
      <Detail label="Rank basis">Vs weakest current name</Detail>
    </dl>
  </article>;
}

export function AiRegimeView({ module }: { module: AiRegimeModule }) {
  return <>
    <PageHeader
      eyebrow="Hermes · thematic sleeve workspace"
      title="AI Regime"
      description="Research sleeve for AI, Physical AI, Space AI/infrastructure, and hidden beneficiaries. Subordinate to the core 10 + 10. Beat QQQ over 10 years. Research triage, not a trade recommendation."
      actions={<><Link href="/" className={workflowLink}>Core 10 + 10</Link><Link href="/challengers" className={workflowLink}>Core Challengers <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link></>}
      meta={<><span>As of {fmtDate(module.asOf)}</span><span>QQQ remains the default</span><span>separate from old Awe Capital and the AI Stack</span></>}
    />
    <div className="space-y-5">
      <section className="rounded-lg border border-gold/30 bg-gold-soft/30 p-4 sm:p-5" aria-label="Mandate and guardrails">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-gold"><Cpu aria-hidden="true" className="size-5" />Mandate and guardrails</h2>
        <p className="mt-2 text-[12px] leading-5 text-foreground-secondary">This module does not replace the canonical 10 + 10 or `/challengers`. Only explicit Dustin approval can assign sleeve Top 10 or Watchlist 10. Thematic mapping or Capital Line passage can only create candidate or monitor states. The sleeve tournament finds names that can replace a weaker sleeve name, and watches fallen names for a return on price, earnings, or a material announcement. Strict five-year Capital Line is greater than 12% and is not membership. A name is not kept off it for missing 15% when it clears the greater-than-12% door and beats a weaker name already on it. QQQ remains the default when evidence is stale, incomplete, inconsistent, or noncanonical.</p>
        <p className="mt-2 text-[12px] leading-5 text-muted">No names, ranks, returns, or membership are invented in code. This page never changes the portfolio, sizes a position, or authorizes a trade.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Valuation playbooks">
        <h2 className="mb-2 text-[14px] font-semibold">Valuation playbooks</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">Forward value is core/base business value + evidence-weighted transition economics + milestone/probability-discounted option value. Reverse expectations, capex, financing, dilution, and downside are required. History is a base-rate anchor, not the forecast. TAM-only value is forbidden. No automatic multiple premium for theme exposure.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Hidden-beneficiary lens">
        <h2 className="mb-2 text-[14px] font-semibold">Hidden-beneficiary lens</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">Look for public companies whose economics change because AI, Physical AI, or Space AI/infrastructure is being built — enabling bottlenecks, key-source owners, adapters, and threatened pools — before trailing financial history fully reflects the new regime.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Regime map">
        <h2 className="mb-3 text-[14px] font-semibold">Regime map</h2>
        <ul className="flex flex-wrap gap-2">
          {module.taxonomy.map(({ domain, count }) => (
            <li key={domain} className="rounded-md border border-border px-3 py-2 text-[12px]">
              <span className="break-words text-foreground-secondary">{TAXONOMY_LABELS[domain] ?? domain}</span>
              <span className="num ml-2 font-semibold text-cyan">{count}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Thematic sleeve 10 + 10" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Thematic sleeve Top 10 + Watchlist 10</h2>
        {module.emptyState ? <div className="panel p-6 text-[13px] text-muted" data-testid="ai-regime-empty-roster">{module.emptyState}. Methodology and workflow stay visible while independently reviewed, PM-accepted, Dustin-approved membership is absent.</div> : null}
        {module.topTen.map((row) => <RosterCard key={row.id} row={row} />)}
        {module.watchlistTen.map((row) => <RosterCard key={row.id} row={row} />)}
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Thematic Challenger Tournament">
        <h2 className="mb-2 text-[14px] font-semibold">Thematic Challenger Tournament</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">No sealed AI Regime tournament is published. A tournament renders only from independently reviewed, hash-verified provenance. Admission remains Dustin-gated and cannot mutate the core 10 + 10.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Evidence / freshness / monitoring">
        <h2 className="mb-2 text-[14px] font-semibold">Evidence / freshness / monitoring</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">45-day model freshness and 14-day event refresh apply before any sleeve row can clear. Missing QQQ case, falsifier, evidence grade, or independent review keeps QQQ as the default. Periodic review and event-driven triggers stay visible here; they cannot commit roster or trade state.</p>
        <p className="mt-2 text-[11px] leading-5 text-muted">{module.summary.blocked} blocked · {module.summary.candidates} candidates · {module.summary.monitors} monitors · approved sleeve {module.summary.approvedTopTen}/{module.summary.approvedWatchlist}.</p>
      </section>

      <section aria-label="Candidate and research queue" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Candidate / research queue</h2>
          <p className="text-[11px] text-muted">{module.summary.candidates} candidates · {module.summary.monitors} monitors · {module.summary.blocked} blocked</p>
        </div>
        {module.queue.map((row) => <article key={row.id} className="panel space-y-2 p-4" aria-label={`${row.symbol} AI Regime candidate`}>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="num text-[15px] font-semibold text-gold hover:underline" href={`/companies/${encodeURIComponent(row.ticker)}`}>{row.symbol}</Link>
            <Badge variant={row.gateStatus === "clear" ? "pos" : "warn"}>{row.gateStatus}</Badge>
            <Badge variant="outline">{row.sleeveStatus}</Badge>
          </div>
          <p className="text-[12px] leading-5 text-foreground-secondary">{row.thesis || "Thesis missing."}</p>
          {row.membershipBlockedReason ? <p className="text-[11px] leading-5 text-muted">{row.membershipBlockedReason}</p> : null}
        </article>)}
        {!module.queue.length ? <div className="panel p-6 text-[13px] text-muted">No AI Regime candidates in `metadata.aiRegime`. Publish reviewed research through the independent review lane before names appear here.</div> : null}
      </section>

      <section className="panel p-4 sm:p-5" aria-label="QQQ and core-portfolio context">
        <h2 className="mb-2 text-[14px] font-semibold">QQQ and core-portfolio context</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">QQQ is the default. Core 10 + 10 members overlapping this theme are excluded from the sleeve roster so the sleeve cannot silently mutate the canonical list.{module.coreOverlap.length ? ` Current overlap: ${module.coreOverlap.join(", ")}.` : " No current overlap."}</p>
        <p className="mt-2 text-[11px] leading-5 text-muted">Evidence and freshness monitoring uses the same 45-day model and 14-day event windows as Capital Line / Challengers. Ranking as of {fmtDate(module.rankingAsOf)} · {module.sourceMode === "hermes-snapshot" ? "Hermes snapshot" : "scored idea table"}.</p>
      </section>
    </div>
  </>;
}

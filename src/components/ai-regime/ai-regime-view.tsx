import Link from "next/link";
import { ArrowUpRight, Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import type { AiRegimeModule } from "@/lib/ai-regime";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";

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
        <p className="mt-2 text-[12px] leading-5 text-foreground-secondary">This module does not replace the canonical 10 + 10 or `/challengers`. Only explicit Dustin approval through a privileged publication can assign sleeve Top 10 or Watchlist 10. Thematic mapping or metadata-only hurdle indications can only create candidate, monitor, or tournament candidate states. The sleeve tournament finds names that can replace a weaker sleeve name, and watches fallen names for a return on price, earnings, or a material announcement. Strict five-year price-only Capital Line is greater than 12%. The five-year price-only tournament hurdle is that same door, not a separate 15% floor. 10-year outputs are historical context only and cannot drive admission, rerank, or displacement. QQQ remains the default for metadata-only rows and whenever evidence is stale, incomplete, inconsistent, or noncanonical.</p>
        <p className="mt-2 text-[12px] leading-5 text-muted">No names, ranks, returns, or membership are invented in code. This page never changes the portfolio, sizes a position, or authorizes a trade.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Valuation playbooks">
        <h2 className="mb-2 text-[14px] font-semibold">Valuation playbooks</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">Forward value is core/base business value + evidence-weighted transition economics + milestone/probability-discounted option value. Reverse expectations, capex, financing, dilution, and downside are required. A nonempty valuation label and asserted IRRs are metadata, not acceptance or an attestation that this contract was completed. History is a base-rate anchor, not the forecast. TAM-only value is forbidden. No automatic multiple premium for theme exposure.</p>
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
        <p className="text-[11px] leading-5 text-muted">V1 is empty-only: this route has no privileged approved-roster input. A later reviewed publication path must enforce at most 10 names per lane before approved rows can render.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Thematic Challenger Tournament">
        <h2 className="mb-2 text-[14px] font-semibold">Thematic Challenger Tournament</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">No sealed AI Regime tournament is published. Idea metadata can request tournament candidate consideration only. Tournament admission requires one-ticker Underwriter → independent Evidence &amp; Risk Reviewer → North Star PM review with Dustin retaining final authority, then an immutable hash-verified publication. Admission cannot mutate the core 10 + 10.</p>
      </section>

      <section className="panel p-4 sm:p-5" aria-label="Evidence / freshness / monitoring">
        <h2 className="mb-2 text-[14px] font-semibold">Evidence / freshness / monitoring</h2>
        <p className="text-[12px] leading-5 text-foreground-secondary">Every row sourced only from agent-writable `hermes_ideas.metadata.aiRegime` remains explicitly unreviewed and evidence blocked. Self-declared A/B evidence, `reviewed`, `pm-approved`, valuation labels, or IRRs cannot create a clear state. A privileged immutable review publication must bind provenance, reviewed content hash, and as-of date before any clear, hurdle, tournament, or roster-eligible state. The 45-day model freshness and 14-day event refresh windows still describe metadata quality; they cannot commit roster or trade state.</p>
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
            <Badge variant="warn">{row.gateStatus}</Badge>
            <Badge variant="outline">metadata {row.metadataStatus} · unreviewed</Badge>
            <Badge variant="outline">{row.sleeveStatus.replace("-", " ")}</Badge>
          </div>
          <p className="text-[12px] leading-5 text-foreground-secondary">{row.thesis || "Thesis missing."}</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Metadata evidence">{row.evidenceGrade ?? "Missing"} · claimed review {row.reviewStatus ?? "missing"}</Detail>
            <Detail label="Model as of">{fmtDate(row.modelAsOf, "iso")}</Detail>
            <Detail label="Next event">{row.nextEventAt ? fmtDate(row.nextEventAt, "iso") : "No event supplied"}</Detail>
            <Detail label="Metadata updated">{fmtDate(row.updatedAt, "iso")}</Detail>
            <Detail label="Valuation archetype">{row.valuationArchetype ?? "Missing"}</Detail>
            <Detail label="5y asserted price-only IRR">{fmtPct(row.fiveYearExpectedIrr)}</Detail>
            <Detail label="10y historical context">{fmtPct(row.tenYearExpectedIrr)}</Detail>
            <Detail label="Hurdle price">{fmtPrice(row.hurdlePrice)}</Detail>
            <Detail label="Effective Capital Line">Strictly greater than {fmtPct(row.requiredFiveYearIrr)}</Detail>
            <Detail label="Effective tournament hurdle">Greater than {fmtPct(row.requiredTournamentFiveYearIrr)} on the same 5y price-only basis</Detail>
            <Detail label="Canonical basis">{row.returnBasis ?? "Missing"} · {row.probabilityWeighting ?? "missing weighting"} · {row.dividendsIncluded === false ? "dividends excluded" : "invalid dividend basis"}</Detail>
            <Detail label="Valuation contract">{row.valuationContractComplete ? "Metadata complete; unreviewed" : "Incomplete"}</Detail>
            <Detail label="Why own instead of QQQ?">{row.whyBeatQqq || "Missing"}</Detail>
            <Detail label="Falsifier / downside">{row.falsifier || "Missing"}</Detail>
            <Detail label="Next review trigger">{row.nextAction || row.catalyst || "Not supplied"}</Detail>
          </dl>
          {row.gateReasons.length ? <ul className="space-y-1 text-[11px] leading-5 text-warn">{row.gateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
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

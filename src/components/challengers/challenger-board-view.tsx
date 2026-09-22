import Link from "next/link";
import { ArrowUpRight, Scale } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import type { ChallengerBoard, ChallengerCandidate } from "@/lib/challengers";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";

const workflowLink = "inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-border px-3 text-[12px] text-cyan hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-cyan";
const VISIBLE_CANDIDATES = 10;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="panel-2 min-w-0 p-3"><dt className="eyebrow mb-1">{label}</dt><dd className="break-words text-[12px] leading-5 text-foreground-secondary">{children}</dd></div>;
}

function UnderwritingDetails({ candidate, className }: { candidate: ChallengerCandidate; className: string }) {
  return <dl className={className}>
    <Detail label="Why this over QQQ?">{candidate.whyBeatQqq || "QQQ case missing"}</Detail>
    <Detail label="QQQ is better if…">{candidate.falsifier || "Falsifier missing"}</Detail>
    <Detail label="Underwriting gates">
      {candidate.gateReasons.length ? <ul className="list-disc space-y-1 pl-4">{candidate.gateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : "Evidence and freshness gates clear. Comparative PM review still governs admission."}
    </Detail>
    <Detail label="Model / next event">Model: {fmtDate(candidate.modelAsOf)}<br />Next event: {candidate.nextEventAt ? fmtDate(candidate.nextEventAt) : candidate.missing.includes("next event date or explicit none") ? "Unknown" : "None scheduled"}<br />Review: {candidate.reviewStatus ?? "Not recorded"}</Detail>
    <Detail label="Price trigger">Recorded price: <span className="num">{fmtNum(candidate.currentPrice, 2)}</span><br />Hurdle price: <span className="num">{fmtNum(candidate.hurdlePrice, 2)}</span><br /><span className="text-muted">Same quote currency; supplied model inputs, not live quotes.</span></Detail>
    <Detail label="Portfolio fit">{fmtPct(candidate.portfolioFit, 0)}<br />Recorded position weight: {fmtPct(candidate.currentWeight)}<br />Sizing requires separate review.</Detail>
    <Detail label="Catalyst / next action">{candidate.catalyst || "Catalyst not recorded"}<br />{candidate.nextAction || "Refresh evidence and complete independent underwriting."}</Detail>
    <Detail label="Recorded decision">{candidate.admissionDecision ?? "No explicit admission decision"}<br /><span className="text-muted">Decisions cannot override blocked gates.</span></Detail>
  </dl>;
}

function CandidateCard({ candidate }: { candidate: ChallengerCandidate }) {
  return <article className="panel space-y-3 p-3 sm:p-5" aria-label={`${candidate.symbol} challenger`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><Link className="num text-[17px] font-semibold text-gold hover:underline" href={`/companies/${encodeURIComponent(candidate.ticker)}`}>{candidate.symbol}</Link><span className="text-[12px] text-muted">{candidate.companyName}</span></h3>
        <p className="mt-1 break-words text-[11px] text-muted">{candidate.discoveryLane} · {candidate.source} · {candidate.stage}</p>
      </div>
      <div className="shrink-0 text-right"><p className="eyebrow">Triage score</p><p className="num text-[20px] font-semibold">{fmtNum(candidate.score, 1)}<span className="text-[11px] text-muted"> / 100</span></p></div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Badge variant={candidate.disposition === "reject" ? "neg" : candidate.disposition === "admit" ? "pos" : "cyan"}>{candidate.disposition}</Badge>
      <Badge variant={candidate.gateStatus === "clear" ? "pos" : "warn"}>{candidate.gateStatus}</Badge>
      <Badge variant="outline">{`Evidence grade ${candidate.evidenceGrade ?? "ungraded"}`}</Badge>
    </div>
    <p className="text-[13px] leading-5 text-foreground-secondary">{candidate.thesis || "Thesis missing — complete underwriting before comparative review."}</p>
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Detail label="Expected / required IRR"><span className="num font-semibold">{fmtPct(candidate.expectedIrr)} / {fmtPct(candidate.requiredIrr)}</span></Detail>
      <Detail label="Admission hurdle">{candidate.clearsHurdle ? "Clears return and evidence gates" : "Not cleared"}</Detail>
      <Detail label="vs. weakest Top 10">{candidate.topTenComparison}</Detail>
      <Detail label="vs. weakest Watchlist">{candidate.watchlistComparison}</Detail>
    </dl>
    <details className="rounded-md border border-border">
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-[12px] font-medium">Underwriting gates and details</summary>
      <UnderwritingDetails candidate={candidate} className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 xl:grid-cols-4" />
    </details>
    <div className="flex flex-wrap items-center gap-2">
      <Link className={workflowLink} href={`/companies/${encodeURIComponent(candidate.ticker)}`}>Company model <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
      <Link className={workflowLink} href={`/pipeline?idea=${encodeURIComponent(candidate.id)}`}>Review pipeline card <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
      <span className="text-[11px] text-muted sm:ml-auto">Idea updated {fmtDate(candidate.updatedAt)}</span>
    </div>
  </article>;
}

function frozenEventFreshness(candidate: ChallengerCandidate, reviewedAsOf: string) {
  if (!candidate.tournamentNextEventAt) return "None scheduled · Fresh at review";
  const daysUntilEvent = (Date.parse(candidate.tournamentNextEventAt) - Date.parse(reviewedAsOf)) / 86_400_000;
  const freshness = daysUntilEvent > 14 ? "Fresh at review" : "Refresh due at review";
  const sourceStatus = candidate.tournamentNextEventStatus?.replaceAll("_", " ")
    ?? (candidate.tournamentNextEventEstimated ? "estimated" : null);
  return `${fmtDate(candidate.tournamentNextEventAt)} · ${freshness}${sourceStatus ? ` · ${sourceStatus}` : ""}`;
}

function LatestTournament({ board }: { board: ChallengerBoard }) {
  const tournament = board.latestTournament;
  if (!tournament) return null;
  const matchup = tournament.incumbentTicker ? `${tournament.incumbentTicker} vs challengers` : "Reviewed challenger tournament";
  return <section className="panel overflow-hidden" aria-label="Latest reviewed tournament">
    <div className="border-b border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Latest reviewed tournament</p>
          <h2 className="text-[16px] font-semibold text-gold">{matchup}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {tournament.terminalLabel ? <Badge variant="cyan">{tournament.terminalLabel}</Badge> : null}
          {tournament.reviewVerdict ? <Badge variant="outline">{tournament.reviewVerdict}</Badge> : null}
        </div>
      </div>
      {tournament.summary ? <p className="mt-2 max-w-4xl text-[12px] leading-5 text-foreground-secondary">{tournament.summary}</p> : null}
      <p className="mt-2 text-[11px] text-muted">Comparison as of {fmtDate(tournament.asOf)} · completed {fmtDate(tournament.completedAt)} · source {tournament.sourceTaskId ?? tournament.id} · PM run {tournament.sourceRunId}{tournament.sourceCommentId ? ` · comment ${tournament.sourceCommentId}` : ""} · verified {tournament.candidates.length}/{tournament.expectedCandidateCount} candidates</p>
    </div>
    <ol className="divide-y divide-border">
      {tournament.candidates.map((candidate) => <li key={`${tournament.id}-${candidate.id}`} className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-20 items-center gap-2 sm:block">
            <p className="eyebrow">Rank {candidate.tournamentRank}</p>
            <Link className="num text-[18px] font-semibold text-gold hover:underline" href={`/companies/${encodeURIComponent(candidate.ticker)}`}>{candidate.symbol}</Link>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={candidate.tournamentDisposition === "reject" ? "neg" : "cyan"}>{candidate.tournamentDisposition}</Badge>
              <span className="text-[11px] text-muted">{candidate.companyName}</span>
            </div>
            {candidate.tournamentBasis ? <p className="mt-2 text-[11px] leading-5 text-foreground-secondary">{candidate.tournamentBasis}</p> : null}
            {candidate.tournamentPortfolioFit ? <p className="mt-1 text-[11px] leading-5 text-muted">{candidate.tournamentPortfolioFit}</p> : null}
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Detail label="Reviewed IRR"><span className="num font-semibold">{fmtPct(candidate.tournamentExpectedIrr, 2)}</span>{candidate.priceOnlyExpectedIrr !== null ? <><br /><span className="text-muted">{fmtPct(candidate.priceOnlyExpectedIrr, 2)} price-only</span></> : null}</Detail>
          <Detail label="Price / hurdle"><span className="num">{fmtNum(candidate.tournamentCurrentPrice, 2)} / {fmtNum(candidate.tournamentHurdlePrice, 2)}</span></Detail>
          <Detail label="Frozen evidence">Grade {candidate.tournamentEvidenceGrade}</Detail>
          <Detail label="Model as of">{fmtDate(candidate.tournamentModelAsOf)}</Detail>
          <Detail label="Next-event freshness">{frozenEventFreshness(candidate, tournament.asOf)}</Detail>
          <Detail label="Accepted review">{candidate.tournamentAcceptedReviewTaskId} · run {candidate.tournamentAcceptedReviewRunId}</Detail>
        </dl>
      </li>)}
    </ol>
    <p className="border-t border-border px-4 py-3 text-[11px] leading-5 text-muted sm:px-5">Tournament rank and disposition preserve the reviewed PM result. Live ownership, evidence freshness, and admission gates remain separate and cannot authorize membership, sizing, or trades.</p>
  </section>;
}

export function ChallengerBoardView({ board }: { board: ChallengerBoard }) {
  const floors = board.incumbentFloors;
  const visibleCandidates = board.candidates.slice(0, VISIBLE_CANDIDATES);
  const backlog = board.candidates.slice(VISIBLE_CANDIDATES);
  return <>
    <PageHeader eyebrow="Hermes · comparative underwriting" title="10 + 10 Challenger Board"
      description="Challengers earn a place by beating a weaker current name. The tournament also watches fallen names for a return on price, earnings, or a material announcement. QQQ remains the default."
      actions={<><Link href="/" className={workflowLink}>Current 10 + 10</Link><Link href="/quant" className={workflowLink}>Source with Quant <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link></>}
      meta={<><span>As of {fmtDate(board.asOf)}</span><span>Research triage · not a trade recommendation</span></>} />
    <div className="space-y-5">
      <section className="rounded-lg border border-gold/30 bg-gold-soft/30 p-4 sm:p-5" aria-label="Admission standard">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-gold"><Scale aria-hidden="true" className="size-5" />Replacement watch</h2>
        <p className="mt-2 text-[12px] leading-5 text-foreground-secondary">The tournament is where names are considered for the 10 + 10, for both Core and the AI sleeve. It also watches contenders and names that have fallen out, for a price move, earnings, or an announcement that could put them in. There is no IRR floor to be watched. A name enters the ranked 10 + 10 above 12% and does not have to clear the Capital Line. From there the best names are ranked. The Capital Line is populated only when a name clears 15%. A pass does not displace anyone. Dustin approves every roster write.</p>
        <p className="mt-2 text-[12px] leading-5 text-muted">This board does not add names to the 10 + 10, change positions, or authorize trades. Models expire at 45 days; events within 14 days or already passed require a refresh.</p>
      </section>
      <LatestTournament board={board} />
      <section aria-label="Live candidate status" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold">Live candidate status</h2>
          <p className="text-[11px] leading-5 text-muted">Live counts below are separate from the frozen reviewed tournament ranks above.</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Detail label="Live challengers"><span className="num text-[24px] font-semibold">{board.summary.total}</span></Detail>
          <Detail label="Live clears hurdle"><span className="num text-[24px] font-semibold text-gold">{board.summary.clearsHurdle}</span></Detail>
          <Detail label="Live first alternates"><span className="num text-[24px] font-semibold text-cyan">{board.summary.firstAlternates}</span></Detail>
          <Detail label="Live blocked / refresh"><span className="num text-[24px] font-semibold text-warn">{board.summary.blocked}</span></Detail>
        </dl>
      </section>
      <section className="panel p-4" aria-label="Incumbent floors">
        <h2 className="mb-3 text-[14px] font-semibold">The incumbents to beat</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Weakest Top 10"><span className="num text-[17px] font-semibold">{floors.topTenTicker ?? "Unavailable"} · {fmtPct(floors.topTenReturn)}</span></Detail>
          <Detail label="Weakest Watchlist 10"><span className="num text-[17px] font-semibold">{floors.watchlistTicker ?? "Unavailable"} · {fmtPct(floors.watchlistReturn)}</span></Detail>
        </dl>
        <p className="mt-3 text-[11px] leading-5 text-muted">Lowest recorded modeled return in each lane · ranking as of {fmtDate(board.rankingAsOf)} · {board.sourceMode === "hermes-snapshot" ? "Hermes snapshot" : "scored idea table"}. Incomplete return coverage leaves a floor unavailable. Return comparisons inform review; they do not establish a superior investment case.</p>
      </section>
      <section aria-label="Source lanes" className="panel p-4">
        <h2 className="mb-3 text-[14px] font-semibold">Source lanes</h2>
        <ul className="flex flex-wrap gap-2">{board.lanes.map(({ lane, count }) => <li key={lane} className="rounded-md border border-border px-3 py-2 text-[12px]"><span className="break-all text-foreground-secondary">{lane}</span> <span className="num ml-2 font-semibold text-cyan">{count}</span></li>)}</ul>
        {!board.lanes.length ? <p className="text-[12px] text-muted">No candidate source lanes recorded.</p> : null}
      </section>
      <section aria-label="Challenger candidates" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold">Candidate review queue</h2><p className="text-[11px] text-muted">{board.summary.admitted} admit · {board.summary.ownedReviews} owned reviews · {board.summary.rejected} reject</p></div>
        {visibleCandidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)}
        {backlog.length ? <details className="panel overflow-hidden">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-[12px] font-semibold text-cyan">
            Show {backlog.length} more challenger{backlog.length === 1 ? "" : "s"}
          </summary>
          <div className="space-y-3 border-t border-border p-3 sm:p-4">
            <p className="text-[11px] leading-5 text-muted">Backlog is collapsed to keep PM triage usable. Opening it does not change any review or admission state.</p>
            {backlog.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)}
          </div>
        </details> : null}
        {!board.candidates.length ? <div className="panel p-6 text-[13px] text-muted">No challengers outside the current 10 + 10. <Link href="/pipeline" className="text-cyan hover:underline">Open the idea pipeline</Link> to review discovery research.</div> : null}
      </section>
      <p className="text-[11px] leading-5 text-muted">Triage score: up to 40 points for expected / required IRR (capped at 2×), 40 for evidence grade, and 20 for portfolio fit. Missing components leave the score unavailable. Scores never override gates or PM decisions. Source-lane counts exclude current members and duplicate symbols.</p>
    </div>
  </>;
}

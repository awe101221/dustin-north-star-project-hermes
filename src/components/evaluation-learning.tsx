import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtPct, fmtDate } from "@/lib/format";
import type { getForecastLearning } from "@/lib/db/forecast-ladders";
import type { OperatingContract } from "@/lib/forecast-ladder";

export function EvaluationLearning({ learning }: { learning: Awaited<ReturnType<typeof getForecastLearning>> }) {
  const { forecasts, cohorts, due, misses, reviews, unreviewed } = learning;
  const open = forecasts.filter((f) => !f.outcome_id);
  const next = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return <section className="space-y-4" aria-label="Short-horizon learning loop">
    <Card>
      <CardHeader><div><CardTitle>Short-horizon learning loop</CardTitle><CardDescription>90-day and 12-month cumulative return versus QQQ · next-quarter operating evidence · five-year forecasts preserved below.</CardDescription></div></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{open.length} open · {forecasts.length - open.length} graded · {due.length} due awaiting evidence · {unreviewed.length} misses awaiting review</p>
        {learning.missingTickers.length ? <p className="text-warn">Missing short-horizon coverage: {learning.missingTickers.join(", ")}. These conclusions are not yet testable through this loop.</p> : null}
        {forecasts.length === 0 ? <p className="text-warn">No short-horizon forecasts registered yet. The next 10+10 refresh must supply evidence-backed ladder contracts; five-year returns are never extrapolated into quarterly predictions.</p> : <p className="text-muted">Next open deadline: {next ? fmtDate(next.due_date) : "none"}. Missing or ambiguous evidence leaves a forecast open, never silently failed.</p>}
        <p className="text-xs text-muted">Market alpha uses split/dividend-adjusted closes, first common completed session on/after the next UTC day following registration and maturity (maximum 7-day gap). Cumulative return, not annualized. Overlapping forecasts are correlated—not independent investment results.</p>
        {learning.qqqBetter.length ? <div className="space-y-1 border-t border-border pt-2"><p>QQQ was the better decision for these measured horizons:</p>{learning.qqqBetter.map((f) => <p key={f.id} className="text-xs"><Link href={`/companies/${f.ticker}`} className="text-gold">{f.ticker}</Link> · {f.horizon} · alpha {fmtPct(Number(f.alpha), 1)} · {f.contract.probability < .5 ? "underperformance was correctly anticipated" : "outperformance probability call missed"}. This is not a verdict on the five-year thesis.</p>)}</div> : null}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><div><CardTitle>Review queue</CardTitle><CardDescription>Close due evidence, explain misses, then propose a versioned experiment. Price underperformance alone does not establish which assumption failed.</CardDescription></div></CardHeader>
      <CardContent className="space-y-3">
        {due.map((f) => <div key={f.id} className="rounded border border-border p-3 text-sm">
          <Link href={`/companies/${f.ticker}`} className="text-gold">{f.ticker}</Link> · {f.horizon} · due {fmtDate(f.due_date)}
          <p className="text-muted">{f.horizon !== "quarter" ? "Awaiting authoritative common-session adjusted stock and QQQ prices." : (f.contract as OperatingContract).kind === "sec_kpi" ? "Awaiting exact fiscal-quarter filing fact; no YTD, proxy, or restatement substitution." : "Evidence review needed: verify the pre-registered milestone resolution rule in filings or earnings materials."}</p>
          <p className="text-xs">Forecast {f.id} · {f.contract.falsifier}</p>
        </div>)}
        {misses.slice(0, 30).map((f) => {
          const review = reviews.find((r) => r.forecast_id === f.id);
          return <div key={f.id} className="rounded border border-border p-3 text-sm space-y-1">
            <p><Link href={`/companies/${f.ticker}`} className="text-gold">{f.ticker}</Link> · {f.horizon} · Brier {Number(f.brier).toFixed(3)} {f.alpha !== null ? `· realized alpha ${fmtPct(Number(f.alpha), 1)} · point error ${fmtPct(Number(f.absolute_error), 1)}` : ""}</p>
            {f.alpha !== null && Number(f.alpha) < 0 ? <p className="text-neg">QQQ was the better decision for this measured horizon—not a verdict on the five-year thesis.</p> : null}
            <p>Assumptions to investigate: {f.payload.assumptions.filter((a) => f.contract.assumption_ids.includes(a.id)).map((a) => `${a.id}: ${a.claim}`).join("; ")}</p>
            <p className="text-muted">{review ? `Reviewed by ${review.payload.reviewer}: ${review.payload.finding}` : "Cause unreviewed. Do not attribute the miss without evidence."}</p>
            <p>{review ? `Recommended experiment (${review.payload.disposition}): ${review.payload.recommended_change}` : "Recommended next step: compare the registered falsifier with realized operating evidence before changing the prompt/model."}</p>
            <div className="flex flex-wrap gap-3 text-xs">{(f.evidence_urls ?? []).map((u, i) => <a href={u} key={u} target="_blank" rel="noreferrer" className="text-cyan underline">Outcome source {i + 1}</a>)}</div>
          </div>;
        })}
        {!due.length && !misses.length ? <p className="text-sm text-muted">No due or missed forecasts yet. Feedback becomes available only after genuinely forward forecasts mature.</p> : null}
        {misses.length > 30 ? <p className="text-xs text-muted">Showing the 30 largest probability misses; all {misses.length} remain available in the learning API.</p> : null}
      </CardContent>
    </Card>
    <Card className="overflow-hidden">
      <CardHeader><div><CardTitle>Horizon accuracy & calibration</CardTitle><CardDescription>Separate cohorts by horizon, forecast type, agent, exact prompt version, and model. Small samples are descriptive, not evidence of skill.</CardDescription></div></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs"><thead><tr className="text-left text-muted"><th className="p-2">Cohort</th><th className="p-2">Graded / registered</th><th className="p-2">Event accuracy</th><th className="p-2">Mean alpha</th><th className="p-2">Alpha MAE</th><th className="p-2">Brier</th><th className="p-2">Calibration: predicted → observed (n)</th></tr></thead><tbody>
          {cohorts.map((c) => <tr key={c.cohort} className="border-t border-border"><td className="p-2 max-w-72 break-words">{c.cohort}</td><td className="p-2">{c.n} / {c.registered}{c.n < 20 ? " · small sample" : ""}</td><td className="p-2">{fmtPct(c.accuracy, 0)}</td><td className="p-2">{fmtPct(c.alpha, 1)}</td><td className="p-2">{fmtPct(c.alphaMae, 1)}</td><td className="p-2">{c.brier?.toFixed(3) ?? "—"}</td><td className="p-2">{c.bins.filter((b) => b.n).map((b) => `${fmtPct(b.predicted, 0)} → ${fmtPct(b.observed, 0)} (${b.n})`).join("; ") || "Awaiting outcomes"}</td></tr>)}
        </tbody></table>
      </CardContent>
    </Card>
    <details className="rounded border border-border p-3 text-sm"><summary className="cursor-pointer">Immutable short-horizon registry ({forecasts.length})</summary>
      <div className="mt-3 space-y-2">{forecasts.map((f) => <div key={f.id} className="border-t border-border pt-2">
        <p>{f.ticker} · {f.horizon} · {fmtDate(f.due_date)} · {f.outcome_id ? "graded" : "open"} · probability {fmtPct(f.contract.probability, 0)} · confidence {fmtPct(f.contract.confidence, 0)}</p>
        <p className="text-muted">{"expected_alpha" in f.contract ? `Expected alpha ${fmtPct(f.contract.expected_alpha, 1)}` : f.contract.label} · {f.contract.falsifier}</p>
        <p className="text-xs">{f.payload.ranking.lane} #{f.payload.ranking.rank} · {f.payload.ranking.reason} · {f.agent_name} · {f.prompt_id}@{f.prompt_version} · {f.model_version}</p>
        <div className="flex flex-wrap gap-3 text-xs">{f.contract.evidence_urls.map((u, i) => <a href={u} key={u} target="_blank" rel="noreferrer" className="text-cyan underline">Original source {i + 1}</a>)}</div>
      </div>)}</div>
    </details>
  </section>;
}

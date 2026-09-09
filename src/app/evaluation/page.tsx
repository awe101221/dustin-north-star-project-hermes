import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Clock3, GitCommitHorizontal, Target } from "lucide-react";
import { ErrorPanel, NotConfigured, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { getDecisionScorecard } from "@/lib/db/portfolio";
import { getEvaluationDashboard } from "@/lib/db/underwriting";
import { getForecastLearning } from "@/lib/db/forecast-ladders";
import { EvaluationLearning } from "@/components/evaluation-learning";
import { num } from "@/lib/db/query";
import { fmtDate, fmtDateTime, fmtPct } from "@/lib/format";
import { safeLoad } from "@/lib/server/safe";
import { serverReadClient, underwritingReadClient } from "@/lib/supabase/server";
import { forecastRegistryCohortKey, forecastRegistryKey, summarizeForecastCohort } from "@/lib/underwriting";

export const metadata: Metadata = { title: "Evaluation" };
export const dynamic = "force-dynamic";

export default async function EvaluationPage() {
  const db = serverReadClient();
  const underwritingDb = await underwritingReadClient();
  const header = <PageHeader eyebrow="Closed learning loop" title="Forecast evaluation" description="The scorecard for whether North Star's predictions, prompts, and agent workflows become better calibrated over time—and whether active conclusions actually outperform QQQ." meta={<><span>Original forecasts remain immutable by model version</span><span>·</span><span>Research measurement, not trade automation</span></>} />;
  if (!underwritingDb) return <>{header}<NotConfigured /></>;
  const [evaluationLoaded, decisionsLoaded, learningLoaded] = await Promise.all([
    safeLoad(() => getEvaluationDashboard(underwritingDb)),
    safeLoad(() => db ? getDecisionScorecard(db) : Promise.reject(new Error("Public database reads are not configured."))),
    safeLoad(() => getForecastLearning(underwritingDb)),
  ]);
  if (!evaluationLoaded.ok) return <>{header}<ErrorPanel title="Evaluation data failed to load" detail={evaluationLoaded.error} /></>;
  const evaluation = evaluationLoaded.data;
  const decisions = decisionsLoaded.ok ? decisionsLoaded.data : [];
  const gradedDecisions = decisions.filter((decision) => decision.alpha !== null);
  const legacyHitRate = gradedDecisions.length ? gradedDecisions.filter((decision) => (decision.alpha ?? 0) > 0).length / gradedDecisions.length : null;
  const legacyAlpha = gradedDecisions.length ? gradedDecisions.reduce((sum, decision) => sum + (decision.alpha ?? 0), 0) / gradedDecisions.length : null;
  const registry = new Map<string, typeof evaluation.forecasts[number]>();
  for (const forecast of evaluation.forecasts) {
    const key = forecastRegistryKey(forecast);
    if (!registry.has(key)) registry.set(key, forecast);
  }
  const byCohort = new Map<string, Array<typeof evaluation.forecasts[number]>>();
  for (const forecast of registry.values()) {
    const key = forecastRegistryCohortKey(forecast);
    byCohort.set(key, [...(byCohort.get(key) ?? []), forecast]);
  }
  const rows = Array.from(byCohort.entries()).sort(([, a], [, b]) =>
    a[0]!.ticker.localeCompare(b[0]!.ticker) || b[0]!.model_version.localeCompare(a[0]!.model_version),
  );

  return (
    <>
      {header}
      <div className="space-y-5">
        {learningLoaded.ok ? <EvaluationLearning learning={learningLoaded.data} /> : <ErrorPanel title="Short-horizon learning unavailable" detail={learningLoaded.error} />}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Stat label="Open forecasts" value={evaluation.openForecasts} tone="cyan" caption="pre-registered" />
          <Stat label="Due now" value={evaluation.dueForecasts} tone={evaluation.dueForecasts ? "neg" : "pos"} caption="need outcome close" />
          <Stat label="Graded" value={evaluation.summary.graded} tone="gold" caption="model outcomes" />
          <Stat label="Mean abs. error" value={evaluation.summary.meanAbsoluteError === null ? "—" : fmtPct(evaluation.summary.meanAbsoluteError, 1)} caption="lower is better" />
          <Stat label="Directional hit rate" value={fmtPct(evaluation.summary.directionalHitRate, 0)} caption="beat / trail QQQ call" />
          <Stat label="Brier score" value={evaluation.summary.brierScore?.toFixed(3) ?? "—"} caption="probability calibration" />
        </div>

        {!evaluation.headlineAvailable ? (
          <div className="rounded-md border border-cyan/25 bg-cyan-soft/20 p-3.5 text-[12px] leading-5 text-foreground-secondary">
            <p className="flex items-center gap-2 font-semibold text-cyan"><Clock3 className="size-4" /> QQQ-relative annualized-return headline is unavailable.</p>
            <p className="mt-1">No graded annualized_return / ratio cohort exists, so North Star will not format another forecast type or unit as a percentage headline. {evaluation.openForecasts === 0 ? "No open forecasts are currently recorded." : `${evaluation.openForecasts} open forecasts were recorded before their outcomes.`}</p>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
          <Card className="overflow-hidden">
            <CardHeader><div><CardTitle>Current 10 + 10 scenario registry</CardTitle><CardDescription>One row per company, forecast type, unit, model version, and state so unlike predictions are never merged.</CardDescription></div><Badge variant="cyan">{registry.size} forecasts</Badge></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-[11.5px]">
                  <thead><tr className="border-y border-border text-left text-muted"><th className="px-4 py-2 font-medium">Company</th><th className="px-3 py-2 font-medium">Forecast cohort</th><th className="px-3 py-2 text-right font-medium">Bear</th><th className="px-3 py-2 text-right font-medium">Base</th><th className="px-3 py-2 text-right font-medium">Bull</th><th className="px-3 py-2 text-right font-medium">Horizon</th><th className="px-4 py-2 text-right font-medium">State</th></tr></thead>
                  <tbody>
                    {rows.map(([cohortKey, forecasts]) => {
                      const { ticker, forecast_type: forecastType, unit, model_version: modelVersion } = forecasts[0]!;
                      const cohort = summarizeForecastCohort(forecasts);
                      const scenario = (name: string) => forecasts.find((forecast) => forecast.scenario === name);
                      const formatValue = (name: string) => unit === "ratio" ? fmtPct(num(scenario(name)?.predicted_value), 1) : `${num(scenario(name)?.predicted_value)?.toLocaleString() ?? "—"} ${unit}`;
                      const horizon = cohort.mixedHorizon ? `${fmtDate(cohort.horizonStart)} – ${fmtDate(cohort.horizonEnd)}` : fmtDate(cohort.horizonStart);
                      return <tr key={cohortKey} className="border-b border-border last:border-b-0"><td className="px-4 py-2.5"><Link href={`/companies/${ticker}`} className="num font-semibold text-gold hover:underline">{ticker}</Link></td><td className="px-3 py-2.5"><p>{forecastType.replaceAll("_", " ")}</p><p className="num text-[10px] text-muted">{modelVersion} · {unit}</p></td>{["Bear", "Base", "Bull"].map((name) => <td key={name} className="num px-3 py-2.5 text-right">{formatValue(name)}</td>)}<td className="num px-3 py-2.5 text-right text-muted">{horizon}</td><td className="px-4 py-2.5 text-right"><Badge variant={cohort.status === "graded" ? "pos" : cohort.status === "mixed" ? "warn" : "muted"}>{cohort.status}</Badge></td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {decisionsLoaded.ok ? <Card>
              <CardHeader><div><CardTitle>Legacy decision outcomes</CardTitle><CardDescription>Existing decision scorecard remains separate from the new model-forecast cohort.</CardDescription></div><Target className="size-4 text-gold" /></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <MiniMetric label="Decisions" value={String(decisions.length)} />
                <MiniMetric label="Graded" value={String(gradedDecisions.length)} />
                <MiniMetric label="Hit rate vs QQQ" value={fmtPct(legacyHitRate, 0)} />
                <MiniMetric label="Average alpha" value={fmtPct(legacyAlpha, 1, { sign: true })} />
              </CardContent>
            </Card> : <ErrorPanel title="Legacy decision outcomes unavailable" detail={decisionsLoaded.error} />}
            <Card>
              <CardHeader><div><CardTitle>Prompt contracts</CardTitle><CardDescription>Natural-language programs are identified by version and output schema.</CardDescription></div><GitCommitHorizontal className="size-4 text-cyan" /></CardHeader>
              <CardContent className="space-y-2">
                {evaluation.prompts.map((prompt) => <div key={`${prompt.prompt_id}:${prompt.version}`} className="panel-2 px-3 py-2.5"><div className="flex flex-wrap items-center gap-2"><span className="num text-[11.5px] font-semibold">{prompt.prompt_id}@{prompt.version}</span><Badge variant={prompt.status === "active" ? "pos" : prompt.status === "draft" ? "warn" : "muted"}>{prompt.status}</Badge></div><p className="mt-1 text-[10.5px] text-muted">{prompt.role} · schema {prompt.schema_version}</p></div>)}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader><div><CardTitle>Agent run provenance</CardTitle><CardDescription>Workflow, prompt, tools, sources, status, and output references are recorded for audit and later comparison.</CardDescription></div><Badge variant={evaluation.failedRuns ? "warn" : "pos"}>{evaluation.successfulRuns} succeeded · {evaluation.failedRuns} failed</Badge></CardHeader>
          <CardContent>
            {evaluation.runs.slice(0, 20).map((run) => <div key={run.id} className="grid gap-1 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-[12px] font-medium">{run.workflow_id} <span className="num text-muted">v{run.workflow_version}</span></p><p className="mt-0.5 text-[10.5px] text-muted">{run.agent_name} · {run.tools_used.join(" · ") || "no tools recorded"} · {run.source_count} sources</p></div><div className="flex items-center gap-2 sm:justify-end"><Badge variant={run.status === "succeeded" ? "pos" : run.status === "failed" ? "neg" : "cyan"}>{run.status}</Badge><span className="num text-[10.5px] text-muted">{fmtDateTime(run.started_at)}</span></div></div>)}
            {evaluation.runs.length === 0 ? <p className="text-[12px] text-muted">No agent runs recorded.</p> : null}
          </CardContent>
        </Card>

        <div className="rounded-md border border-warn/25 bg-warn-soft/20 p-3 text-[11px] leading-4 text-muted"><p className="flex items-center gap-1.5 font-semibold text-warn"><AlertTriangle className="size-3.5" /> Interpretation guardrail</p><p className="mt-1">A small cohort, an unfinished horizon, or missing benchmark data is shown as unavailable—not converted into a precise score. Evaluation improves research quality; it does not authorize trades or orders.</p></div>
      </div>
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="panel-2 p-3"><p className="eyebrow">{label}</p><p className="num mt-1 text-[16px] font-semibold">{value}</p></div>;
}

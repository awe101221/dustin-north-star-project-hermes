import Link from "next/link";
import { AlertTriangle, Bot, Clock3, GitBranch, Target } from "lucide-react";
import type { CompanyFinancialModel } from "@/lib/company-models";
import type { CompanyUnderwriting } from "@/lib/db/underwriting";
import { num } from "@/lib/db/query";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { forecastRegistryKey, linkedEvidenceForGraphVersion, resolveGraphProvenance, resolvePersistedGraphTimestampState, sameSemanticTimestamp, summarizeForecastCohort, type PersistedGraphTimestampState } from "@/lib/underwriting";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CompanyUnderwritingGraph({ model, underwriting, timestampState }: { model: CompanyFinancialModel; underwriting: CompanyUnderwriting | null; timestampState?: PersistedGraphTimestampState }) {
  const nodes = underwriting?.nodes ?? [];
  const graphTimestampState = timestampState ?? resolvePersistedGraphTimestampState(nodes);
  const { hasPersistedGraph, hasFuturePersistedTimestamp, hasUnavailablePersistedTimestamp, versions, latestAsOf } = graphTimestampState;
  const unavailableTimestampLabel = hasFuturePersistedTimestamp ? "future as_of" : "invalid as_of";
  const unavailableTimestampDetail = hasFuturePersistedTimestamp
    ? "future persisted as_of timestamp"
    : "invalid or non-finite persisted as_of timestamp";

  const latestNodes = latestAsOf
    ? nodes.filter((node) => sameSemanticTimestamp(node.as_of, latestAsOf))
    : [];
  const assumptions = latestNodes.filter((node) => node.node_type === "assumption");
  const falsifiers = latestNodes.filter((node) => node.node_type === "falsifier");
  const monitors = latestNodes.filter((node) => node.node_type === "monitor");
  const evidenceState = latestAsOf
    ? linkedEvidenceForGraphVersion(nodes, underwriting?.edges ?? [], latestAsOf)
    : { linked: [], unlinked: [] };
  const evidence = evidenceState.linked;
  const sources = latestNodes.filter((node) => node.node_type === "source");
  const forecasts = hasPersistedGraph && latestAsOf
    ? underwriting?.forecasts.filter((forecast) =>
        sameSemanticTimestamp(forecast.model_version, latestAsOf)
        && forecast.forecast_type === "annualized_return"
        && forecast.unit === "ratio"
      ) ?? []
    : [];
  const hasPersistedForecasts = forecasts.length > 0;
  const expectedScenarios = ["Bear", "Base", "Bull"] as const;
  const missingScenarios = expectedScenarios.filter(
    (scenario) => forecasts.filter((forecast) => forecast.scenario === scenario).length !== 1,
  );
  const hasCompletePersistedForecastCohort = forecasts.length === expectedScenarios.length && missingScenarios.length === 0;
  const incompleteForecastDetail = missingScenarios.length > 0
    ? `Missing ${missingScenarios.join(missingScenarios.length === 2 ? " and " : ", ")} scenario${missingScenarios.length === 1 ? "" : "s"}`
    : "Expected exactly one Bear, Base, and Bull scenario";
  const hasIncompletePersistedForecastCohort = hasPersistedForecasts && !hasCompletePersistedForecastCohort;
  const forecastCohort = summarizeForecastCohort(forecasts);
  const outcomeTitle = hasUnavailablePersistedTimestamp
    ? "Persisted graph record unavailable"
    : !hasPersistedGraph
    ? "Preview only · not gradable"
    : !hasPersistedForecasts
      ? "Forecast cohort unavailable"
      : hasIncompletePersistedForecastCohort
        ? "Persisted forecast cohort incomplete"
      : forecastCohort.status === "mixed"
        ? "Mixed outcome status"
        : forecastCohort.status === "graded"
          ? "Outcomes recorded"
          : forecastCohort.status === "open"
            ? "Outcomes still open"
            : `Forecasts ${forecastCohort.status}`;
  const horizonDetail = hasUnavailablePersistedTimestamp
    ? unavailableTimestampDetail
    : !hasPersistedGraph
    ? "Code-model scenario preview"
    : hasIncompletePersistedForecastCohort
      ? incompleteForecastDetail
    : forecastCohort.horizonStart
      ? `5-year horizon · ${forecastCohort.horizonStart}${forecastCohort.mixedHorizon ? ` – ${forecastCohort.horizonEnd}` : ""}`
      : "No persisted forecast horizon for this graph version";
  const provenance = resolveGraphProvenance(latestNodes, underwriting?.runs ?? []);
  const provenanceText = hasUnavailablePersistedTimestamp
    ? `Persisted graph record unavailable; ${unavailableTimestampLabel} timestamp.`
    : provenance.state === "available"
    ? `${provenance.run.agent_name} · ${provenance.run.workflow_id} v${provenance.run.workflow_version}`
    : provenance.state === "ambiguous"
      ? "Multiple agent runs are linked to this graph version; provenance is ambiguous."
      : hasPersistedGraph
        ? "Persisted graph; no resolvable persisted graph run found."
        : "Code-model preview; no persisted graph run exists.";
  const modelNodeTitle = hasUnavailablePersistedTimestamp
    ? "Persisted graph record unavailable"
    : hasPersistedGraph
    ? hasCompletePersistedForecastCohort
      ? `${forecasts.length} persisted scenario forecast${forecasts.length === 1 ? "" : "s"}`
      : hasIncompletePersistedForecastCohort
        ? "Persisted forecast cohort incomplete"
        : "Persisted forecast cohort unavailable"
    : `${model.scenarios.length} scenario forecasts · code-model preview`;
  const modelNodeDetail = hasUnavailablePersistedTimestamp
    ? `${unavailableTimestampDetail}; no code-model values are substituted`
    : hasPersistedGraph
    ? hasCompletePersistedForecastCohort
      ? "Stored Bear · Base · Bull cohort"
      : hasIncompletePersistedForecastCohort
        ? incompleteForecastDetail
        : "No annualized_return / ratio forecasts stored for this version"
    : `Bear · Base · Bull · ${fmtPct(model.probabilityWeightedReturn, 1)} weighted IRR`;

  return (
    <Card className="mb-4 overflow-hidden border-cyan/25">
      <CardHeader className="flex-col gap-3 border-b border-border bg-cyan-soft/15 sm:flex-row">
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <Badge variant="cyan"><GitBranch className="mr-1 size-3" /> underwriting graph</Badge>
            {hasUnavailablePersistedTimestamp
              ? <Badge variant="warn">Persisted graph record unavailable · {unavailableTimestampLabel}</Badge>
              : hasPersistedGraph
              ? <Badge variant="outline">{versions.length} persisted model version{versions.length === 1 ? "" : "s"}</Badge>
              : <Badge variant="warn">Code-model preview · no persisted graph</Badge>}
            <Badge variant={evidence.length ? "pos" : "warn"}>{evidence.length} claim-level evidence link{evidence.length === 1 ? "" : "s"}</Badge>
          </div>
          <CardTitle>Assumptions → forecast → outcome</CardTitle>
          <CardDescription className="mt-1 max-w-3xl">The durable record behind this model. Assumptions, falsifiers, monitoring tests, provenance, and eventual QQQ-relative outcomes remain queryable instead of disappearing into a memo.</CardDescription>
        </div>
        <Link href="/evaluation" className="text-[11.5px] text-cyan hover:underline sm:ml-auto">Open evaluation loop →</Link>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
          <FlowNode eyebrow="Input" title={`${hasPersistedGraph ? assumptions.length : 12} explicit assumptions`} detail={hasPersistedGraph ? "Exact count stored for the selected graph version" : "Code-model preview · growth · margin · exit multiple · return"} tone="cyan" />
          <FlowArrow />
          <FlowNode eyebrow="Model" title={modelNodeTitle} detail={modelNodeDetail} tone="gold" />
          <FlowArrow />
          <FlowNode eyebrow="Evaluation" title={outcomeTitle} detail={horizonDetail} tone={forecastCohort.status === "graded" ? "pos" : "muted"} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="panel-2 p-3.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-neg"><AlertTriangle className="size-3.5" /> Falsifiers · {hasPersistedGraph ? falsifiers.length : model.risks.length}</p>
            <p className="mt-2 text-[11.5px] leading-4 text-muted">Each risk is a graph node that can invalidate the company thesis. It is not softened into a blended score.</p>
          </div>
          <div className="panel-2 p-3.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-cyan"><Target className="size-3.5" /> Monitoring tests · {hasPersistedGraph ? monitors.length : model.monitoring.length}</p>
            <p className="mt-2 text-[11.5px] leading-4 text-muted">The next filing or operating datapoint should support, refute, or revise an assumption.</p>
          </div>
          <div className="panel-2 p-3.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-gold"><Bot className="size-3.5" /> Provenance</p>
            <p className="mt-2 text-[11.5px] leading-4 text-muted">{provenanceText}</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
          <div className="panel-2 overflow-hidden">
            <div className="border-b border-border px-3.5 py-3">
              <p className="text-[12px] font-semibold">{hasUnavailablePersistedTimestamp ? "Persisted graph record unavailable" : hasCompletePersistedForecastCohort ? "Persisted forecast record" : hasIncompletePersistedForecastCohort ? "Persisted forecast cohort incomplete" : hasPersistedGraph ? "Persisted forecast cohort unavailable" : "Model scenario preview"}</p>
              <p className="mt-0.5 text-[11px] text-muted">{hasUnavailablePersistedTimestamp ? `The persisted graph has a ${unavailableTimestampLabel} timestamp; no code-model values are substituted.` : hasCompletePersistedForecastCohort ? "Values were stored before outcomes so later grading cannot rewrite the original prediction." : hasIncompletePersistedForecastCohort ? `${incompleteForecastDetail}. No code-model values are substituted.` : hasPersistedGraph ? "No annualized_return / ratio forecasts are stored for this graph version." : "Synthesized from the code-backed model preview; these values are not recorded forecasts and cannot be graded."}</p>
            </div>
            {hasPersistedGraph && !hasCompletePersistedForecastCohort ? (
              <div className="px-3.5 py-5 text-[11.5px] text-muted">{hasUnavailablePersistedTimestamp ? `Persisted graph record unavailable because as_of is ${hasFuturePersistedTimestamp ? "in the future" : "invalid or non-finite"}. No code-model values are substituted.` : hasIncompletePersistedForecastCohort ? `${incompleteForecastDetail}. The persisted cohort is unavailable until Bear, Base, and Bull are complete.` : "Missing persisted forecast cohort for the selected canonical timestamp. No code-model values are substituted."}</div>
            ) : <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[11.5px]">
                <thead><tr className="text-left text-muted"><th className="px-3.5 py-2 font-medium">Scenario</th><th className="px-3 py-2 text-right font-medium">Probability</th><th className="px-3 py-2 text-right font-medium">Predicted IRR</th><th className="px-3 py-2 text-right font-medium">QQQ line</th><th className="px-3 py-2 text-right font-medium">State</th></tr></thead>
                <tbody>
                  {(hasCompletePersistedForecastCohort ? forecasts : model.scenarios.map((scenario) => ({ scenario: scenario.name, probability: scenario.probability, predicted_value: scenario.annualizedReturn, benchmark_value: model.qqqHurdle, status: "not recorded" as const }))).map((forecast) => (
                    <tr key={"forecast_type" in forecast ? forecastRegistryKey(forecast) : `${forecast.scenario}:annualized_return:ratio:${model.asOf}`} className="border-t border-border">
                      <td className="px-3.5 py-2 font-medium">{forecast.scenario}</td>
                      <td className="num px-3 py-2 text-right">{fmtPct(num(forecast.probability), 0)}</td>
                      <td className="num px-3 py-2 text-right">{fmtPct(num(forecast.predicted_value), 1)}</td>
                      <td className="num px-3 py-2 text-right text-cyan">{fmtPct(num(forecast.benchmark_value), 0)}</td>
                      <td className="px-3 py-2 text-right"><Badge variant={forecast.status === "graded" ? "pos" : "muted"}>{forecast.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </div>
          <div className="rounded-md border border-warn/25 bg-warn-soft/25 p-3.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-warn"><Clock3 className="size-3.5" /> Evidence and revision state</p>
            <dl className="mt-3 space-y-2 text-[11.5px]">
              <Line label="Latest graph version" value={hasUnavailablePersistedTimestamp ? `Persisted record unavailable · ${unavailableTimestampLabel}` : hasPersistedGraph && latestAsOf ? fmtDateTime(latestAsOf) : "Unavailable · code-model preview"} />
              <Line label="Prior versions" value={String(Math.max(versions.length - 1, 0))} />
              <Line label="Provenance nodes" value={String(sources.length)} />
              <Line label="Claim-level evidence" value={String(evidence.length)} />
            </dl>
            <p className="mt-3 border-t border-warn/20 pt-3 text-[11px] leading-4 text-muted">{evidenceState.unlinked.length
              ? `${evidenceState.unlinked.length} evidence node${evidenceState.unlinked.length === 1 ? "" : "s"} in this graph version ${evidenceState.unlinked.length === 1 ? "is" : "are"} unlinked and unavailable; only allowed claim relationships count.`
              : evidence.length
                ? "Every counted evidence node is linked to this underwriting version by an allowed claim relationship."
                : "Evidence still missing at the individual-assumption level. The current source node records model provenance, not a filing citation for every claim."}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowNode({ eyebrow, title, detail, tone }: { eyebrow: string; title: string; detail: string; tone: "cyan" | "gold" | "pos" | "muted" }) {
  const colors = { cyan: "border-cyan/35 bg-cyan-soft/20", gold: "border-gold/35 bg-gold-soft/20", pos: "border-pos/35 bg-pos-soft/20", muted: "border-border bg-surface-2" };
  return <div className={`rounded-md border p-3 ${colors[tone]}`}><p className="eyebrow">{eyebrow}</p><p className="mt-1 text-[12.5px] font-semibold">{title}</p><p className="mt-1 text-[11px] leading-4 text-muted">{detail}</p></div>;
}

function FlowArrow() {
  return <div className="flex items-center justify-center text-muted-2"><span className="rotate-90 text-lg sm:rotate-0">→</span></div>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="num text-right">{value}</dd></div>;
}

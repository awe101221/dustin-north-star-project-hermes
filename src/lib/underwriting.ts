import type { CompanyFinancialModel, ScenarioName } from "@/lib/company-models";

export type UnderwritingNodeKind = "company" | "assumption" | "forecast" | "falsifier" | "monitor" | "source" | "evidence" | "outcome" | "agent_run" | "decision" | "theme";
export type UnderwritingRelationship = "has_forecast" | "depends_on" | "could_invalidate" | "tests" | "informed_by" | "supports" | "refutes" | "revises" | "confirms" | "disconfirms" | "produced_by" | "competes_with";

export type UnderwritingNode = {
  key: string;
  kind: UnderwritingNodeKind;
  ticker: string | null;
  title: string;
  body: string | null;
  status: "active" | "open" | "graded" | "superseded";
  confidence: number | null;
  asOf: string;
  validUntil: string | null;
  payload: Record<string, unknown>;
};

export type UnderwritingEdge = {
  fromKey: string;
  toKey: string;
  relationship: UnderwritingRelationship;
  note: string | null;
  strength: number | null;
};

export type UnderwritingGraph = { nodes: UnderwritingNode[]; edges: UnderwritingEdge[] };

const ASSUMPTIONS = [
  ["revenue-cagr", "Revenue CAGR", "revenueCagr", "ratio"],
  ["target-margin", "Year-5 margin", "targetMargin", "ratio"],
  ["exit-multiple", "Exit multiple", "exitMultiple", "multiple"],
  ["annualized-return", "Annualized shareholder return", "annualizedReturn", "ratio"],
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function scenarioKey(ticker: string, scenario: ScenarioName) {
  return `${ticker}:forecast:${scenario.toLowerCase()}`;
}

export function buildUnderwritingGraph(models: CompanyFinancialModel[]): UnderwritingGraph {
  const nodes: UnderwritingNode[] = [];
  const edges: UnderwritingEdge[] = [];

  for (const model of models) {
    const ticker = model.ticker.toUpperCase();
    const companyKey = `${ticker}:company`;
    nodes.push({
      key: companyKey,
      kind: "company",
      ticker,
      title: ticker,
      body: "Current 10 + 10 company underwriting entity",
      status: "active",
      confidence: null,
      asOf: model.asOf,
      validUntil: null,
      payload: { metric: model.metric, qqqHurdle: model.qqqHurdle },
    });

    const sourceKey = `${ticker}:source:model-snapshot`;
    nodes.push({
      key: sourceKey,
      kind: "source",
      ticker,
      title: "Model snapshot provenance",
      body: model.sourceLabel,
      status: "active",
      confidence: null,
      asOf: model.asOf,
      validUntil: null,
      payload: { dataQuality: model.dataQuality, methodology: model.methodology },
    });
    edges.push({ fromKey: companyKey, toKey: sourceKey, relationship: "informed_by", note: "Current model provenance and limitations", strength: null });

    for (const scenario of model.scenarios) {
      const forecastKey = scenarioKey(ticker, scenario.name);
      nodes.push({
        key: forecastKey,
        kind: "forecast",
        ticker,
        title: `${scenario.name} case · 5-year return`,
        body: scenario.narrative,
        status: "open",
        confidence: scenario.probability,
        asOf: model.asOf,
        validUntil: null,
        payload: {
          scenario: scenario.name,
          probability: scenario.probability,
          targetPrice: scenario.targetPrice,
          annualizedReturn: scenario.annualizedReturn,
          benchmarkSymbol: "QQQ",
          benchmarkHurdle: model.qqqHurdle,
          horizonYears: 5,
          currency: model.baseline.currency,
        },
      });
      edges.push({ fromKey: companyKey, toKey: forecastKey, relationship: "has_forecast", note: null, strength: scenario.probability });

      for (const [assumptionSlug, label, field, unit] of ASSUMPTIONS) {
        const assumptionKey = `${ticker}:assumption:${scenario.name.toLowerCase()}:${assumptionSlug}`;
        nodes.push({
          key: assumptionKey,
          kind: "assumption",
          ticker,
          title: `${scenario.name} · ${label}`,
          body: null,
          status: "active",
          confidence: scenario.probability,
          asOf: model.asOf,
          validUntil: null,
          payload: { scenario: scenario.name, assumption: assumptionSlug, value: scenario[field], unit, modelVersion: model.asOf },
        });
        edges.push({ fromKey: forecastKey, toKey: assumptionKey, relationship: "depends_on", note: null, strength: scenario.probability });
      }
    }

    model.risks.forEach((risk, index) => {
      const key = `${ticker}:falsifier:${index + 1}:${slug(risk).slice(0, 48)}`;
      nodes.push({ key, kind: "falsifier", ticker, title: risk, body: null, status: "active", confidence: null, asOf: model.asOf, validUntil: null, payload: { order: index + 1 } });
      edges.push({ fromKey: key, toKey: companyKey, relationship: "could_invalidate", note: "Explicit model risk", strength: null });
    });

    model.monitoring.forEach((monitor, index) => {
      const key = `${ticker}:monitor:${index + 1}:${slug(monitor).slice(0, 48)}`;
      nodes.push({ key, kind: "monitor", ticker, title: monitor, body: null, status: "active", confidence: null, asOf: model.asOf, validUntil: null, payload: { order: index + 1 } });
      edges.push({ fromKey: key, toKey: companyKey, relationship: "tests", note: "Evidence to refresh", strength: null });
    });
  }

  return { nodes, edges };
}

export type ForecastEvaluationInput = {
  forecastType: string;
  unit: string;
  predictedValue: number;
  actualValue: number;
  forecastBenchmarkValue?: number | null;
  realizedBenchmarkValue?: number | null;
  probability?: number | null;
  outcomeOccurred?: boolean | null;
};

export type ForecastEvaluationSummary = {
  graded: number;
  meanAbsoluteError: number | null;
  meanAlpha: number | null;
  directionalHitRate: number | null;
  brierScore: number | null;
};

export type ForecastEvaluationGroup = {
  forecastType: string;
  unit: string;
  summary: ForecastEvaluationSummary;
};

export type ForecastRegistryIdentity = {
  ticker: string;
  scenario: string;
  forecast_type: string;
  unit: string;
  model_version: string;
  status: string;
};

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function sameSemanticTimestamp(left: string, right: string) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

export type PersistedGraphTimestampState = {
  hasPersistedGraph: boolean;
  hasInvalidPersistedTimestamp: boolean;
  hasFuturePersistedTimestamp: boolean;
  hasUnavailablePersistedTimestamp: boolean;
  versions: string[];
  latestAsOf: string | undefined;
};

export function resolvePersistedGraphTimestampState(
  nodes: Array<{ as_of: string }>,
  referenceTime = Date.now(),
): PersistedGraphTimestampState {
  const hasPersistedGraph = nodes.length > 0;
  const hasInvalidPersistedTimestamp = nodes.some((node) => !Number.isFinite(Date.parse(node.as_of)));
  const versions = Array.from(nodes.reduce((byInstant, node) => {
    const instant = Date.parse(node.as_of);
    if (Number.isFinite(instant) && !byInstant.has(instant)) byInstant.set(instant, node.as_of);
    return byInstant;
  }, new Map<number, string>()).entries())
    .sort(([left], [right]) => right - left)
    .map(([, timestamp]) => timestamp);
  const hasFuturePersistedTimestamp = versions[0] !== undefined && Date.parse(versions[0]) > referenceTime;
  const hasUnavailablePersistedTimestamp = hasInvalidPersistedTimestamp || hasFuturePersistedTimestamp;

  return {
    hasPersistedGraph,
    hasInvalidPersistedTimestamp,
    hasFuturePersistedTimestamp,
    hasUnavailablePersistedTimestamp,
    versions,
    latestAsOf: hasUnavailablePersistedTimestamp ? undefined : versions[0],
  };
}

const EVIDENCE_LINK_RELATIONSHIPS = new Set(["supports", "refutes", "revises", "confirms", "disconfirms"]);

export function linkedEvidenceForGraphVersion<T extends { id: string; node_type: string; as_of: string }>(
  nodes: T[],
  edges: Array<{ from_node_id: string; to_node_id: string; relationship: string }>,
  selectedAsOf: string,
): { linked: T[]; unlinked: T[] } {
  const selectedNodes = nodes.filter((node) => sameSemanticTimestamp(node.as_of, selectedAsOf));
  const byId = new Map(selectedNodes.map((node) => [node.id, node]));
  const evidenceNodes = selectedNodes.filter((node) => node.node_type === "evidence");
  const linkedIds = new Set<string>();

  for (const edge of edges) {
    if (!EVIDENCE_LINK_RELATIONSHIPS.has(edge.relationship)) continue;
    const from = byId.get(edge.from_node_id);
    const to = byId.get(edge.to_node_id);
    if (!from || !to) continue;
    if (from.node_type === "evidence" && to.node_type !== "evidence") linkedIds.add(from.id);
    if (to.node_type === "evidence" && from.node_type !== "evidence") linkedIds.add(to.id);
  }

  return {
    linked: evidenceNodes.filter((node) => linkedIds.has(node.id)),
    unlinked: evidenceNodes.filter((node) => !linkedIds.has(node.id)),
  };
}

export function summarizeForecastEvaluation(rows: ForecastEvaluationInput[]): ForecastEvaluationSummary {
  if (rows.length === 0) return { graded: 0, meanAbsoluteError: null, meanAlpha: null, directionalHitRate: null, brierScore: null };

  const benchmarkRows = rows.filter((row) => row.realizedBenchmarkValue !== null && row.realizedBenchmarkValue !== undefined);
  const directionalRows = benchmarkRows.filter((row) => row.forecastBenchmarkValue !== null && row.forecastBenchmarkValue !== undefined);
  const probabilityRows = rows.filter((row) => row.probability !== null && row.probability !== undefined && row.outcomeOccurred !== null && row.outcomeOccurred !== undefined);
  const absoluteError = rows.reduce((sum, row) => sum + Math.abs(row.actualValue - row.predictedValue), 0) / rows.length;
  const alpha = benchmarkRows.length
    ? benchmarkRows.reduce((sum, row) => sum + (row.actualValue - (row.realizedBenchmarkValue as number)), 0) / benchmarkRows.length
    : null;
  const hits = directionalRows.filter((row) =>
    (row.predictedValue > (row.forecastBenchmarkValue as number)) === (row.actualValue > (row.realizedBenchmarkValue as number)),
  ).length;
  const brier = probabilityRows.length
    ? probabilityRows.reduce((sum, row) => sum + ((row.probability as number) - (row.outcomeOccurred ? 1 : 0)) ** 2, 0) / probabilityRows.length
    : null;

  return {
    graded: rows.length,
    meanAbsoluteError: rounded(absoluteError),
    meanAlpha: alpha === null ? null : rounded(alpha),
    directionalHitRate: directionalRows.length ? rounded(hits / directionalRows.length) : null,
    brierScore: brier === null ? null : rounded(brier),
  };
}

export function groupForecastEvaluations(rows: ForecastEvaluationInput[]): ForecastEvaluationGroup[] {
  const groups = new Map<string, ForecastEvaluationInput[]>();
  for (const row of rows) {
    const key = `${row.forecastType}\u0000${row.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, groupRows]) => ({
      forecastType: groupRows[0]!.forecastType,
      unit: groupRows[0]!.unit,
      summary: summarizeForecastEvaluation(groupRows),
    }));
}

export function selectHeadlineForecastEvaluation(groups: ForecastEvaluationGroup[]) {
  const headline = groups.find((group) => group.forecastType === "annualized_return" && group.unit === "ratio");
  return headline
    ? { available: true, summary: headline.summary }
    : { available: false, summary: summarizeForecastEvaluation([]) };
}

export function summarizeForecastCohort(rows: Array<{ status: string; horizon_date: string }>) {
  const statuses = Array.from(new Set(rows.map((row) => row.status)));
  const horizons = Array.from(new Set(rows.map((row) => row.horizon_date))).sort();
  return {
    status: statuses.length === 1 ? statuses[0]! : statuses.length ? "mixed" : "unavailable",
    horizonStart: horizons[0] ?? null,
    horizonEnd: horizons.at(-1) ?? null,
    mixedHorizon: horizons.length > 1,
  };
}

export function forecastRegistryKey(row: ForecastRegistryIdentity) {
  return [row.ticker, row.scenario, row.forecast_type, row.unit, row.model_version].join("\u0000");
}

export function forecastRegistryCohortKey(row: Omit<ForecastRegistryIdentity, "scenario">) {
  return [row.ticker, row.forecast_type, row.unit, row.model_version].join("\u0000");
}

export function assertUniqueForecastRegistry(rows: ForecastRegistryIdentity[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = forecastRegistryKey(row);
    if (keys.has(key)) throw new Error(`Duplicate logical forecast in evaluation registry: ${row.ticker} ${row.scenario} ${row.forecast_type} ${row.unit} ${row.model_version}`);
    keys.add(key);
  }
}

export function agentRunIdsForUnderwriting(
  nodes: Array<{ agent_run_id: string | null }>,
  forecasts: Array<{ agent_run_id: string | null }>,
) {
  return Array.from(new Set([...nodes, ...forecasts].map((row) => row.agent_run_id).filter((id): id is string => id !== null)));
}

export function resolveGraphProvenance<T extends { id: string }>(
  nodes: Array<{ agent_run_id: string | null }>,
  runs: T[],
): { state: "available"; run: T } | { state: "ambiguous" | "unavailable"; run: null } {
  const runIds = Array.from(new Set(nodes.map((node) => node.agent_run_id).filter((id): id is string => id !== null)));
  if (runIds.length > 1) return { state: "ambiguous", run: null };
  if (runIds.length === 0) return { state: "unavailable", run: null };
  const run = runs.find((candidate) => candidate.id === runIds[0]);
  return run ? { state: "available", run } : { state: "unavailable", run: null };
}

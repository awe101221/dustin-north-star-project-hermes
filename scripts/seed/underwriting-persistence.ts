import type { Rest } from "../lib/rest";

export type UnderwritingSeedArgs = {
  p_agent_run_id: string;
  p_nodes: Record<string, unknown>[];
  p_edges: Record<string, unknown>[];
  p_forecasts: Record<string, unknown>[];
  p_output_ref: Record<string, unknown>;
  p_metrics: Record<string, unknown>;
};

export type UnderwritingSeedResult = {
  nodes: number;
  edges: number;
  forecasts_inserted: number;
  recovered: boolean;
};

export type UnderwritingTerminalRunContract = {
  status: "succeeded";
  external_key: string;
  workflow_id: string;
  workflow_version: string;
  prompt_id: string;
  prompt_version: string;
  agent_name: string;
  ticker: string | null;
  task_id: string | null;
  tools_used: string[];
  source_count: number;
  input_ref: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type UnderwritingTerminalRunReadback = Omit<UnderwritingTerminalRunContract, "status"> & {
  id: string;
  status: string;
  output_ref: Record<string, unknown>;
  metrics: Record<string, unknown>;
};

type PromptProvenanceReadback = {
  prompt_id: string | null;
  prompt_version: string | null;
};

type RunReadback = {
  id: string;
  status: string;
  output_ref: Record<string, unknown>;
  metrics: Record<string, unknown>;
  prompt_id: string | null;
  prompt_version: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type NodeReadback = Record<string, unknown> & { id: string; stable_key: string; as_of: string; agent_run_id: string; prompt_id: string | null; prompt_version: string | null; created_at: string; updated_at: string };
type EdgeReadback = Record<string, unknown> & { from_node_id: string; to_node_id: string; agent_run_id: string; created_at: string };
type ForecastReadback = Record<string, unknown> & { as_of: string; agent_run_id: string; prompt_id: string | null; prompt_version: string | null; created_at: string; updated_at: string };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

function equalJson(left: unknown, right: unknown) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function finiteInstant(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pastOrPresentInstant(value: unknown, now: number) {
  const parsed = finiteInstant(value);
  return parsed !== null && parsed <= now ? parsed : null;
}

const canonicalAuditTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function auditInstant(value: unknown, now: number) {
  if (typeof value !== "string" || !canonicalAuditTimestamp.test(value)) return null;
  return pastOrPresentInstant(value, now);
}

function completePromptPair(value: { prompt_id?: unknown; prompt_version?: unknown }) {
  const id = value.prompt_id ?? null;
  const version = value.prompt_version ?? null;
  return (id === null && version === null)
    || (typeof id === "string" && id.length > 0 && typeof version === "string" && version.length > 0);
}

function promptPairMatches(expected: { prompt_id?: unknown; prompt_version?: unknown }, actual: { prompt_id?: unknown; prompt_version?: unknown }) {
  return completePromptPair(expected)
    && completePromptPair(actual)
    && (expected.prompt_id ?? null) === (actual.prompt_id ?? null)
    && (expected.prompt_version ?? null) === (actual.prompt_version ?? null);
}

const terminalReplayRejection = "Terminal underwriting seed provenance is not an allowed exact replay.";
const terminalCompletionOutputRef = {
  tables: ["hermes_underwriting_nodes", "hermes_underwriting_edges", "hermes_forecasts"],
};
const legacyNullProvenanceCompletion = {
  runId: "1e48faa4-20e5-4a0d-b155-c3e13762b36d",
  outputRef: terminalCompletionOutputRef,
  currentMetrics: {
    companies: 20,
    forecastsExpected: 60,
    graphEdges: 440,
    graphNodes: 460,
  },
  metrics: {
    companies: 20,
    forecastsExpected: 60,
    forecastsInserted: 0,
    graphEdges: 440,
    graphNodes: 460,
  },
};

function exactCurrentCompletionRequest(args: UnderwritingSeedArgs) {
  const forecastTickers = new Set<string>();
  for (const forecast of args.p_forecasts) {
    if (typeof forecast.ticker !== "string" || forecast.ticker.length === 0) return false;
    forecastTickers.add(forecast.ticker);
  }
  return equalJson(args.p_output_ref, terminalCompletionOutputRef)
    && equalJson(args.p_metrics, {
      companies: forecastTickers.size,
      forecastsExpected: args.p_forecasts.length,
      graphEdges: args.p_edges.length,
      graphNodes: args.p_nodes.length,
    });
}

export async function selectUnderwritingTerminalReplayArgs(
  db: Rest,
  args: UnderwritingSeedArgs,
  run: UnderwritingTerminalRunReadback,
  expectedRun: UnderwritingTerminalRunContract,
): Promise<UnderwritingSeedArgs> {
  const runFilter = `agent_run_id=eq.${encodeURIComponent(run.id)}`;
  const [nodeProvenance, forecastProvenance] = await Promise.all([
    db.selectAll<PromptProvenanceReadback>(
      "hermes_underwriting_nodes",
      `select=prompt_id,prompt_version&${runFilter}`,
    ),
    db.selectAll<PromptProvenanceReadback>(
      "hermes_forecasts",
      `select=prompt_id,prompt_version&${runFilter}`,
    ),
  ]);

  const runContract = Object.fromEntries(
    Object.keys(expectedRun).map((key) => [key, run[key as keyof UnderwritingTerminalRunContract]]),
  );
  const expectedRows = [...args.p_nodes, ...args.p_forecasts];
  const persistedRows = [...nodeProvenance, ...forecastProvenance];
  const exactInspection = run.id === args.p_agent_run_id
    && equalJson(runContract, expectedRun)
    && args.p_nodes.length > 0
    && args.p_forecasts.length > 0
    && nodeProvenance.length === args.p_nodes.length
    && forecastProvenance.length === args.p_forecasts.length
    && expectedRows.every((row) => promptPairMatches(row, expectedRun));

  if (!exactInspection || !exactCurrentCompletionRequest(args)) {
    throw new Error(terminalReplayRejection);
  }

  const completeCurrentProvenance = persistedRows.every((row) => promptPairMatches(row, expectedRun));
  if (completeCurrentProvenance) {
    if (run.id === legacyNullProvenanceCompletion.runId
        || !equalJson(run.output_ref, args.p_output_ref)
        || !equalJson(run.metrics, args.p_metrics)) {
      throw new Error(terminalReplayRejection);
    }
    return args;
  }

  const completeLegacyNullProvenance = run.id === legacyNullProvenanceCompletion.runId
    && persistedRows.every((row) => row.prompt_id === null && row.prompt_version === null)
    && equalJson(args.p_metrics, legacyNullProvenanceCompletion.currentMetrics)
    && equalJson(run.output_ref, legacyNullProvenanceCompletion.outputRef)
    && equalJson(run.metrics, legacyNullProvenanceCompletion.metrics);
  if (!completeLegacyNullProvenance) throw new Error(terminalReplayRejection);

  const withoutPromptProvenance = (row: Record<string, unknown>) => ({
    ...row,
    prompt_id: null,
    prompt_version: null,
  });
  return {
    ...args,
    p_nodes: args.p_nodes.map(withoutPromptProvenance),
    p_forecasts: args.p_forecasts.map(withoutPromptProvenance),
    p_output_ref: legacyNullProvenanceCompletion.outputRef,
    p_metrics: legacyNullProvenanceCompletion.metrics,
  };
}

function validOptionalUntil(value: unknown, asOf: number) {
  if (value === null || value === undefined) return true;
  const parsed = finiteInstant(value);
  return parsed !== null && parsed >= asOf;
}

function optionalFiniteInstant(value: unknown) {
  return value === null || value === undefined ? null : finiteInstant(value);
}

function validRunChronology(run: RunReadback, now: number) {
  const startedAt = pastOrPresentInstant(run.started_at, now);
  const createdAt = auditInstant(run.created_at, now);
  const updatedAt = auditInstant(run.updated_at, now);
  if (startedAt === null || createdAt === null || updatedAt === null
      || createdAt > updatedAt || !completePromptPair(run)) return false;
  const terminal = ["succeeded", "failed", "cancelled"].includes(run.status);
  const nonTerminal = ["queued", "running"].includes(run.status);
  if (!terminal && !nonTerminal) return false;
  if (nonTerminal) return run.completed_at === null;
  const completedAt = pastOrPresentInstant(run.completed_at, now);
  const legacyCompletionClockSkew = run.status === "succeeded"
    && completedAt !== null
    && completedAt >= updatedAt
    && completedAt - updatedAt <= 1_000;
  return completedAt !== null
    && completedAt >= startedAt
    && completedAt >= createdAt
    && (completedAt <= updatedAt || legacyCompletionClockSkew);
}

function numeric(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function uniqueContentMap<T>(
  rows: T[],
  identity: (row: T) => string | null,
  content: (row: T) => unknown,
) {
  const result = new Map<string, string>();
  for (const row of rows) {
    const key = identity(row);
    if (key === null || result.has(key)) return null;
    result.set(key, JSON.stringify(canonical(content(row))));
  }
  return result;
}

function equalUniqueMaps(expected: Map<string, string> | null, actual: Map<string, string> | null) {
  if (expected === null || actual === null || expected.size !== actual.size) return false;
  for (const [key, value] of expected) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

function exactNodes(
  expected: Record<string, unknown>[],
  actual: NodeReadback[],
  agentRunId: string,
  now: number,
  registration: { startedAt: number; createdAt: number; completedAt: number },
) {
  if (actual.length !== expected.length) return false;
  const expectedMap = uniqueContentMap(
    expected,
    (node) => {
      const asOf = pastOrPresentInstant(node.as_of, now);
      return asOf === null || !validOptionalUntil(node.valid_until, asOf) || !completePromptPair(node)
        ? null
        : JSON.stringify([node.stable_key, asOf]);
    },
    (node) => ({
      stable_key: node.stable_key,
      node_type: node.node_type,
      ticker: node.ticker ?? null,
      title: node.title,
      body: node.body ?? null,
      status: node.status ?? "active",
      confidence: numeric(node.confidence),
      as_of: pastOrPresentInstant(node.as_of, now),
      valid_until: optionalFiniteInstant(node.valid_until),
      prompt_id: node.prompt_id ?? null,
      prompt_version: node.prompt_version ?? null,
      payload: node.payload ?? {},
      agent_run_id: agentRunId,
    }),
  );
  const actualMap = uniqueContentMap(
    actual,
    (node) => {
      const asOf = pastOrPresentInstant(node.as_of, now);
      const createdAt = auditInstant(node.created_at, now);
      const updatedAt = auditInstant(node.updated_at, now);
      return asOf === null || !validOptionalUntil(node.valid_until, asOf) || node.agent_run_id !== agentRunId
        || createdAt === null || updatedAt === null || createdAt > updatedAt
        || createdAt < registration.createdAt || updatedAt > registration.completedAt
        || !completePromptPair(node)
        ? null
        : JSON.stringify([node.stable_key, asOf]);
    },
    (node) => ({
      stable_key: node.stable_key,
      node_type: node.node_type,
      ticker: node.ticker ?? null,
      title: node.title,
      body: node.body ?? null,
      status: node.status,
      confidence: numeric(node.confidence),
      as_of: pastOrPresentInstant(node.as_of, now),
      valid_until: optionalFiniteInstant(node.valid_until),
      prompt_id: node.prompt_id ?? null,
      prompt_version: node.prompt_version ?? null,
      payload: node.payload ?? {},
      agent_run_id: node.agent_run_id,
    }),
  );
  return equalUniqueMaps(expectedMap, actualMap);
}

function exactEdges(
  expected: Record<string, unknown>[],
  actual: EdgeReadback[],
  nodes: NodeReadback[],
  agentRunId: string,
  now: number,
  registration: { startedAt: number; createdAt: number; completedAt: number },
) {
  if (actual.length !== expected.length) return false;
  const keyById = new Map<string, string>();
  for (const node of nodes) {
    if (keyById.has(node.id)) return false;
    keyById.set(node.id, node.stable_key);
  }
  const expectedMap = uniqueContentMap(
    expected,
    (edge) => typeof edge.from_key === "string"
      && typeof edge.to_key === "string"
      && typeof edge.relationship === "string"
      ? JSON.stringify([edge.from_key, edge.to_key, edge.relationship])
      : null,
    (edge) => ({
      from_key: edge.from_key,
      to_key: edge.to_key,
      relationship: edge.relationship,
      strength: numeric(edge.strength),
      note: edge.note ?? null,
      metadata: edge.metadata ?? {},
      agent_run_id: agentRunId,
    }),
  );
  const actualMap = uniqueContentMap(
    actual,
    (edge) => {
      const fromKey = keyById.get(edge.from_node_id);
      const toKey = keyById.get(edge.to_node_id);
      const createdAt = auditInstant(edge.created_at, now);
      return fromKey === undefined || toKey === undefined
        || typeof edge.relationship !== "string" || edge.agent_run_id !== agentRunId
        || createdAt === null || createdAt < registration.createdAt || createdAt > registration.completedAt
        ? null
        : JSON.stringify([fromKey, toKey, edge.relationship]);
    },
    (edge) => ({
      from_key: keyById.get(edge.from_node_id),
      to_key: keyById.get(edge.to_node_id),
      relationship: edge.relationship,
      strength: numeric(edge.strength),
      note: edge.note ?? null,
      metadata: edge.metadata ?? {},
      agent_run_id: edge.agent_run_id,
    }),
  );
  return equalUniqueMaps(expectedMap, actualMap);
}

function exactForecasts(
  expected: Record<string, unknown>[],
  actual: ForecastReadback[],
  agentRunId: string,
  now: number,
  registration: { startedAt: number; createdAt: number; completedAt: number },
) {
  if (actual.length !== expected.length) return false;
  const expectedMap = uniqueContentMap(
    expected,
    (forecast) => {
      const modelVersion = pastOrPresentInstant(forecast.model_version, now);
      return modelVersion === null || !completePromptPair(forecast)
        ? null
        : JSON.stringify([
          forecast.ticker,
          forecast.scenario,
          forecast.forecast_type,
          forecast.unit ?? "ratio",
          modelVersion,
        ]);
    },
    (forecast) => ({
      stable_key: forecast.stable_key,
      ticker: forecast.ticker,
      scenario: forecast.scenario,
      forecast_type: forecast.forecast_type,
      horizon_date: forecast.horizon_date,
      probability: numeric(forecast.probability),
      predicted_value: numeric(forecast.predicted_value),
      unit: forecast.unit ?? "ratio",
      benchmark_symbol: forecast.benchmark_symbol ?? "QQQ",
      benchmark_value: numeric(forecast.benchmark_value),
      model_version: pastOrPresentInstant(forecast.model_version, now),
      prompt_id: forecast.prompt_id ?? null,
      prompt_version: forecast.prompt_version ?? null,
      status: "open",
      metadata: forecast.metadata ?? {},
      agent_run_id: agentRunId,
    }),
  );
  const actualMap = uniqueContentMap(
    actual,
    (forecast) => {
      const modelVersion = pastOrPresentInstant(forecast.model_version, now);
      const asOf = pastOrPresentInstant(forecast.as_of, now);
      const createdAt = auditInstant(forecast.created_at, now);
      const updatedAt = auditInstant(forecast.updated_at, now);
      return modelVersion === null || asOf === null
        || modelVersion > asOf
        || asOf < registration.startedAt || asOf > registration.completedAt
        || forecast.agent_run_id !== agentRunId
        || createdAt === null || updatedAt === null || createdAt > updatedAt
        || createdAt < registration.createdAt || updatedAt > registration.completedAt
        || !completePromptPair(forecast)
        ? null
        : JSON.stringify([
          forecast.ticker,
          forecast.scenario,
          forecast.forecast_type,
          forecast.unit,
          modelVersion,
        ]);
    },
    (forecast) => ({
      stable_key: forecast.stable_key,
      ticker: forecast.ticker,
      scenario: forecast.scenario,
      forecast_type: forecast.forecast_type,
      horizon_date: forecast.horizon_date,
      probability: numeric(forecast.probability),
      predicted_value: numeric(forecast.predicted_value),
      unit: forecast.unit,
      benchmark_symbol: forecast.benchmark_symbol,
      benchmark_value: numeric(forecast.benchmark_value),
      model_version: pastOrPresentInstant(forecast.model_version, now),
      prompt_id: forecast.prompt_id ?? null,
      prompt_version: forecast.prompt_version ?? null,
      status: forecast.status,
      metadata: forecast.metadata ?? {},
      agent_run_id: forecast.agent_run_id,
    }),
  );
  return equalUniqueMaps(expectedMap, actualMap);
}

async function readBack(db: Rest, args: UnderwritingSeedArgs) {
  const runRows = await db.select<RunReadback>(
    "hermes_agent_runs",
    `select=id,status,output_ref,metrics,prompt_id,prompt_version,started_at,completed_at,created_at,updated_at&id=eq.${encodeURIComponent(args.p_agent_run_id)}&limit=1`,
  );
  const [nodes, edges, forecasts] = await Promise.all([
    db.selectAll<NodeReadback>("hermes_underwriting_nodes", `select=id,stable_key,node_type,ticker,title,body,status,confidence,as_of,valid_until,prompt_id,prompt_version,payload,agent_run_id,created_at,updated_at&agent_run_id=eq.${encodeURIComponent(args.p_agent_run_id)}`),
    db.selectAll<EdgeReadback>("hermes_underwriting_edges", `select=id,from_node_id,to_node_id,relationship,strength,note,metadata,agent_run_id,created_at&agent_run_id=eq.${encodeURIComponent(args.p_agent_run_id)}`),
    db.selectAll<ForecastReadback>("hermes_forecasts", `select=id,stable_key,ticker,scenario,forecast_type,horizon_date,probability,predicted_value,unit,benchmark_symbol,benchmark_value,model_version,as_of,prompt_id,prompt_version,status,metadata,agent_run_id,created_at,updated_at&agent_run_id=eq.${encodeURIComponent(args.p_agent_run_id)}`),
  ]);
  const run = runRows[0] ?? null;
  const now = Date.now();
  const registration = {
    startedAt: run === null ? Number.NaN : (pastOrPresentInstant(run.started_at, now) ?? Number.NaN),
    createdAt: run === null ? Number.NaN : (auditInstant(run.created_at, now) ?? Number.NaN),
    completedAt: run === null ? Number.NaN : (pastOrPresentInstant(run.completed_at, now) ?? Number.NaN),
  };
  const expectedPromptProvenance = run !== null
    && [...args.p_nodes, ...args.p_forecasts].every((row) => promptPairMatches(row, run));
  const validChronology = run !== null
    && run.id === args.p_agent_run_id
    && validRunChronology(run, now)
    && expectedPromptProvenance;
  return {
    run,
    nodes,
    edges,
    forecasts,
    validChronology,
    exactPayload: exactNodes(args.p_nodes, nodes, args.p_agent_run_id, now, registration)
      && exactEdges(args.p_edges, edges, nodes, args.p_agent_run_id, now, registration)
      && exactForecasts(args.p_forecasts, forecasts, args.p_agent_run_id, now, registration),
  };
}

export async function persistUnderwritingSeedOutput(db: Rest, args: UnderwritingSeedArgs): Promise<UnderwritingSeedResult> {
  try {
    const saved = await db.rpc<Omit<UnderwritingSeedResult, "recovered">>("hermes_complete_underwriting_seed", args);
    return { ...saved, recovered: false };
  } catch (error) {
    let state: Awaited<ReturnType<typeof readBack>>;
    try {
      state = await readBack(db, args);
    } catch {
      // The outcome is still ambiguous. Never convert transport uncertainty
      // into a terminal failure that could contradict a committed transaction.
      throw error;
    }

    if (state.run?.status === "succeeded"
        && state.validChronology
        && state.exactPayload
        && equalJson(state.run.output_ref, args.p_output_ref)
        && equalJson(state.run.metrics, args.p_metrics)) {
      return {
        nodes: state.nodes.length,
        edges: state.edges.length,
        forecasts_inserted: state.forecasts.length,
        recovered: true,
      };
    }

    const transactionClearlyAbsent = state.run?.status === "running"
      && state.validChronology
      && state.nodes.length === 0
      && state.edges.length === 0
      && state.forecasts.length === 0;
    if (transactionClearlyAbsent) {
      await db.patch("hermes_agent_runs", `id=eq.${args.p_agent_run_id}`, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Underwriting seed failed before atomic completion.",
      });
    }
    throw error;
  }
}

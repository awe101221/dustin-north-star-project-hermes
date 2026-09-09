import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { bareSymbol } from "@/lib/utils";
import { num, unwrap } from "@/lib/db/query";
import type { AgentRunRow, ForecastEvaluationRow, PromptVersionRow, UnderwritingEdgeRow, UnderwritingNodeRow } from "@/lib/db/types";
import { agentRunIdsForUnderwriting, assertUniqueForecastRegistry, groupForecastEvaluations, selectHeadlineForecastEvaluation, summarizeForecastEvaluation } from "@/lib/underwriting";

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await buildPage(from, from + pageSize - 1), context);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function fetchAllRowsByChunks<T extends { id: string }>(
  values: string[],
  buildPage: (values: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  context: string,
): Promise<T[]> {
  const unique = new Map<string, T>();
  const chunkSize = 100;
  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize);
    const rows = await fetchAllRows<T>((from, to) => buildPage(chunk, from, to), context);
    for (const row of rows) unique.set(row.id, row);
  }
  return Array.from(unique.values());
}

export type CompanyUnderwriting = {
  nodes: UnderwritingNodeRow[];
  edges: UnderwritingEdgeRow[];
  forecasts: ForecastEvaluationRow[];
  runs: AgentRunRow[];
};

export async function getCompanyUnderwriting(db: SupabaseClient, ticker: string): Promise<CompanyUnderwriting> {
  const symbols = Array.from(new Set([ticker.toUpperCase(), bareSymbol(ticker).toUpperCase()]));
  const [nodes, forecasts] = await Promise.all([
    fetchAllRows<UnderwritingNodeRow>(
      (from, to) => db.from("hermes_underwriting_nodes").select("*").in("ticker", symbols).order("as_of", { ascending: false }).order("id", { ascending: false }).range(from, to),
      "company underwriting nodes",
    ),
    fetchAllRows<ForecastEvaluationRow>(
      (from, to) => db.from("hermes_forecast_evaluations").select("*").in("ticker", symbols).order("as_of", { ascending: false }).order("forecast_id", { ascending: false }).range(from, to),
      "company forecast evaluations",
    ),
  ]);
  const ids = nodes.map((node) => node.id);
  const runIds = agentRunIdsForUnderwriting(nodes, forecasts);
  const [edges, runs] = await Promise.all([
    ids.length
      ? fetchAllRowsByChunks<UnderwritingEdgeRow>(
          ids,
          (chunk, from, to) => db.from("hermes_underwriting_edges").select("*").or(`from_node_id.in.(${chunk.join(",")}),to_node_id.in.(${chunk.join(",")})`).order("id", { ascending: false }).range(from, to),
          "company underwriting edges",
        )
      : Promise.resolve([] as UnderwritingEdgeRow[]),
    runIds.length
      ? fetchAllRowsByChunks<AgentRunRow>(
          runIds,
          (chunk, from, to) => db.from("hermes_agent_runs").select("*").in("id", chunk).order("started_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
          "company agent runs",
        )
      : Promise.resolve([] as AgentRunRow[]),
  ]);
  return { nodes, edges, forecasts, runs };
}

export type EvaluationDashboard = {
  forecasts: ForecastEvaluationRow[];
  runs: AgentRunRow[];
  prompts: PromptVersionRow[];
  summary: ReturnType<typeof summarizeForecastEvaluation>;
  headlineAvailable: boolean;
  summaryGroups: ReturnType<typeof groupForecastEvaluations>;
  openForecasts: number;
  dueForecasts: number;
  successfulRuns: number;
  failedRuns: number;
};

export async function getEvaluationDashboard(db: SupabaseClient): Promise<EvaluationDashboard> {
  const [forecasts, runs, prompts] = await Promise.all([
    fetchAllRows<ForecastEvaluationRow>((from, to) => db.from("hermes_forecast_evaluations").select("*").order("as_of", { ascending: false }).order("forecast_id", { ascending: false }).range(from, to), "forecast evaluations"),
    fetchAllRows<AgentRunRow>((from, to) => db.from("hermes_agent_runs").select("*").order("started_at", { ascending: false }).order("id", { ascending: false }).range(from, to), "agent runs"),
    fetchAllRows<PromptVersionRow>((from, to) => db.from("hermes_prompt_versions").select("*").order("released_at", { ascending: false }).order("prompt_id").order("version").range(from, to), "prompt versions"),
  ]);
  assertUniqueForecastRegistry(forecasts);
  const graded = forecasts.flatMap((row) => {
    const predictedValue = num(row.predicted_value);
    const actualValue = num(row.actual_value);
    if (predictedValue === null || actualValue === null) return [];
    const benchmarkComparable = row.forecast_type === "annualized_return" && row.unit === "ratio";
    return [{
      forecastType: row.forecast_type,
      unit: row.unit,
      predictedValue,
      actualValue,
      forecastBenchmarkValue: benchmarkComparable ? num(row.benchmark_value) : null,
      realizedBenchmarkValue: benchmarkComparable ? num(row.qqq_value) : null,
      probability: num(row.probability),
      outcomeOccurred: row.outcome_occurred,
    }];
  });
  const summaryGroups = groupForecastEvaluations(graded);
  const headline = selectHeadlineForecastEvaluation(summaryGroups);
  const today = new Date().toISOString().slice(0, 10);
  return {
    forecasts,
    runs,
    prompts,
    summary: headline.summary,
    headlineAvailable: headline.available,
    summaryGroups,
    openForecasts: forecasts.filter((row) => row.status === "open").length,
    dueForecasts: forecasts.filter((row) => row.status === "open" && row.horizon_date <= today).length,
    successfulRuns: runs.filter((row) => row.status === "succeeded").length,
    failedRuns: runs.filter((row) => row.status === "failed").length,
  };
}

export type DatabaseReality = { table: string; label: string; count: number | null; readable: boolean };

const REALITY_TABLES = [
  ["hermes_notes", "Research notes"],
  ["analyst_memos", "Analyst memos"],
  ["hermes_agent_tasks", "Agent tasks"],
  ["hermes_agent_runs", "Agent runs"],
  ["hermes_prompt_versions", "Prompt versions"],
  ["hermes_underwriting_nodes", "Graph nodes"],
  ["hermes_underwriting_edges", "Graph edges"],
  ["hermes_forecasts", "Forecasts"],
  ["hermes_forecast_outcomes", "Forecast outcomes"],
  ["hermes_activity", "Activity events"],
] as const;

export async function getDatabaseReality(db: SupabaseClient): Promise<DatabaseReality[]> {
  return Promise.all(REALITY_TABLES.map(async ([table, label]) => {
    const result = await db.from(table).select("*", { count: "exact", head: true });
    return result.error ? { table, label, count: null, readable: false } : { table, label, count: result.count ?? 0, readable: true };
  }));
}

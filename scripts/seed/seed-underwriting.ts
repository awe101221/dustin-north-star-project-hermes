import { CURRENT_10_PLUS_10_TICKERS, getCompanyModel } from "../../src/lib/company-models";
import { buildUnderwritingGraph } from "../../src/lib/underwriting";
import { log } from "../lib/env";
import { hermesClient } from "../lib/rest";
import { assertExactPromptContract, type StoredPromptContract } from "./seed-prompt-contracts";
import {
  persistUnderwritingSeedOutput,
  selectUnderwritingTerminalReplayArgs,
  type UnderwritingSeedArgs,
  type UnderwritingTerminalRunContract,
  type UnderwritingTerminalRunReadback,
} from "./underwriting-persistence";

const PROMPTS = [
  {
    prompt_id: "daily-10-plus-10",
    version: "2.0.0",
    role: "Hermes PM orchestrator",
    schema_version: "best-ideas-snapshot-v2",
    prompt_body: "Refresh current prices and source evidence, reconcile every active 10 + 10 company with its model, compare each conclusion with QQQ, preserve falsifiers, and publish one canonical ranked Top 10 plus Watchlist 10 snapshot. Do not authorize or place trades.",
    description: "Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.",
    status: "active",
  },
  {
    prompt_id: "company-underwrite",
    version: "1.0.0",
    role: "Company analyst",
    schema_version: "company-model-v1",
    prompt_body: "Produce a source-backed five-year company underwriting with explicit Bear, Base, and Bull revenue growth, margin, exit-multiple, target-price, and annualized-return assumptions. State probability, risks, monitoring tests, data limitations, and the QQQ opportunity-cost hurdle. Do not rewrite a forecast after it is registered.",
    description: "Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.",
    status: "active",
  },
  {
    prompt_id: "risk-falsifier-review",
    version: "1.0.0",
    role: "Risk and falsifier analyst",
    schema_version: "falsifier-review-v1",
    prompt_body: "Review the active thesis and identify specific source-verifiable evidence that could invalidate each material assumption, impair the downside case, or make QQQ the better default. Keep falsifiers distinct from blended conviction scores.",
    description: "Identify evidence that would invalidate the active thesis or make QQQ the better default.",
    status: "active",
  },
  {
    prompt_id: "forecast-outcome-grade",
    version: "0.1.0",
    role: "Outcome evaluator",
    schema_version: "forecast-outcome-v1",
    prompt_body: "After a forecast horizon has been reached, record the realized value, realized QQQ comparator when applicable, binary outcome when applicable, and a required evidence URL. Preserve the original forecast and close it atomically. Never grade a forecast early.",
    description: "Close due forecasts against observed results and QQQ, preserving source evidence.",
    status: "draft",
  },
] as const;

function plusYears(iso: string, years: number) {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const db = hermesClient();
  const models = CURRENT_10_PLUS_10_TICKERS.map((ticker) => getCompanyModel(ticker)).filter((model) => model !== null);
  const graph = buildUnderwritingGraph(models);

  const promptRows = PROMPTS.map((prompt) => ({ ...prompt, metadata: { source: "north-star-seed" } }));
  for (const prompt of promptRows) {
    const existing = await db.select<StoredPromptContract>(
      "hermes_prompt_versions",
      `select=prompt_id,version,role,schema_version,prompt_body,content_sha256,status,description,metadata&prompt_id=eq.${encodeURIComponent(prompt.prompt_id)}&version=eq.${encodeURIComponent(prompt.version)}&limit=1`,
    );
    if (existing.length === 0) {
      await db.insert("hermes_prompt_versions", [prompt]);
    } else {
      assertExactPromptContract(existing[0]!, prompt);
    }
  }

  const modelAsOf = models[0]?.asOf;
  if (!modelAsOf) throw new Error("No company models found.");
  const runKey = `company-model-registry-import:${modelAsOf}`;
  const runTools = ["Yahoo Finance", "FinanceToolkit", "Hermes scenario drafting"];
  const runInputRef = { file: "src/lib/company-models.ts", tickers: CURRENT_10_PLUS_10_TICKERS };
  const runMetadata = { seed: true, provisionalResearch: true, tickers: CURRENT_10_PLUS_10_TICKERS };
  const terminalRunContract: UnderwritingTerminalRunContract = {
    status: "succeeded",
    external_key: runKey,
    workflow_id: "company-model-registry-import",
    workflow_version: "1.0.0",
    prompt_id: "company-underwrite",
    prompt_version: "1.0.0",
    agent_name: "hermes-pm",
    ticker: null,
    task_id: null,
    tools_used: runTools,
    source_count: 2,
    input_ref: runInputRef,
    metadata: runMetadata,
  };
  const existingRuns = await db.select<UnderwritingTerminalRunReadback>(
    "hermes_agent_runs",
    `select=id,status,external_key,workflow_id,workflow_version,prompt_id,prompt_version,agent_name,ticker,task_id,tools_used,source_count,input_ref,output_ref,metrics,metadata&external_key=eq.${encodeURIComponent(runKey)}&limit=1`,
  );
  const existingRun = existingRuns[0];
  const insertedRuns = existingRun ? [] : await db.insert<{ id: string; status: string }>("hermes_agent_runs", [{
    external_key: runKey,
    workflow_id: terminalRunContract.workflow_id,
    workflow_version: terminalRunContract.workflow_version,
    prompt_id: terminalRunContract.prompt_id,
    prompt_version: terminalRunContract.prompt_version,
    agent_name: terminalRunContract.agent_name,
    status: "running",
    ticker: terminalRunContract.ticker,
    tools_used: runTools,
    source_count: terminalRunContract.source_count,
    input_ref: runInputRef,
    output_ref: {},
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
    metrics: {},
    metadata: runMetadata,
  }]);
  const runId = existingRun?.id ?? insertedRuns[0]?.id;
  if (!runId) throw new Error("Could not create or recover underwriting seed run.");
  const replayableExistingRun = !existingRun
    || existingRun.status === "queued"
    || existingRun.status === "running"
    || existingRun.status === "succeeded";
  if (!replayableExistingRun) {
    throw new Error(`Cannot seed underwriting output through terminal run ${runId} (${existingRun?.status ?? "unknown"}).`);
  }
  const isExactReplay = existingRun?.status === "succeeded";
  const nodeRows = graph.nodes.map((node) => ({
    stable_key: node.key,
    node_type: node.kind,
    ticker: node.ticker,
    title: node.title,
    body: node.body,
    status: node.status,
    confidence: node.confidence,
    as_of: node.asOf,
    valid_until: node.validUntil,
    prompt_id: "company-underwrite",
    prompt_version: "1.0.0",
    payload: node.payload,
  }));
  const edgeRows = graph.edges.map((edge) => ({
    from_key: edge.fromKey,
    to_key: edge.toKey,
    relationship: edge.relationship,
    note: edge.note,
    strength: edge.strength,
    metadata: {},
  }));
  const forecastRows = models.flatMap((model) => model.scenarios.map((scenario) => ({
    stable_key: `${model.ticker}:forecast:${scenario.name.toLowerCase()}`,
    ticker: model.ticker,
    scenario: scenario.name,
    forecast_type: "annualized_return",
    horizon_date: plusYears(model.asOf, 5),
    probability: scenario.probability,
    predicted_value: scenario.annualizedReturn,
    unit: "ratio",
    benchmark_symbol: "QQQ",
    benchmark_value: model.qqqHurdle,
    model_version: model.asOf,
    prompt_id: "company-underwrite",
    prompt_version: "1.0.0",
    metadata: { targetPrice: scenario.targetPrice, currency: model.baseline.currency, narrative: scenario.narrative },
  })));
  const seedArgs: UnderwritingSeedArgs = {
    p_agent_run_id: runId,
    p_nodes: nodeRows,
    p_edges: edgeRows,
    p_forecasts: forecastRows,
    p_output_ref: { tables: ["hermes_underwriting_nodes", "hermes_underwriting_edges", "hermes_forecasts"] },
    p_metrics: {
      companies: models.length,
      graphNodes: nodeRows.length,
      graphEdges: edgeRows.length,
      forecastsExpected: forecastRows.length,
    },
  };
  const replayArgs = existingRun?.status === "succeeded"
    ? await selectUnderwritingTerminalReplayArgs(
      db,
      seedArgs,
      existingRun,
      terminalRunContract,
    )
    : seedArgs;
  const counts = await persistUnderwritingSeedOutput(db, replayArgs);

  log(`underwriting seed ${isExactReplay || counts.recovered ? "exact replay verified" : "completed"}: prompts=${promptRows.length} runs=1 nodes=${counts.nodes} edges=${counts.edges} forecasts_inserted=${counts.forecasts_inserted}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

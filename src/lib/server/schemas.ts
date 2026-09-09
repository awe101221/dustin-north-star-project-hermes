import { z } from "zod";
import { IDEA_STAGES, NOTE_KINDS } from "@/lib/db/types";

/** Shared zod schemas for UI + agent writes. Numbers are decimal ratios. */
const ticker = z.string().trim().min(1).max(24).transform((s) => s.toUpperCase());
const tags = z.array(z.string().trim().min(1).max(40)).max(30).default([]);
const jsonObject = z.record(z.string(), z.unknown());

function integerQuery(defaultValue: number, minimum: number, maximum: number) {
  return z.preprocess(
    (value) => value === undefined ? defaultValue : value,
    z.union([
      z.number(),
      z.string().regex(/^(0|[1-9]\d*)$/).transform(Number),
    ]).pipe(z.number().int().min(minimum).max(maximum)),
  );
}

export const ideaCreate = z.object({
  ticker,
  company_name: z.string().trim().max(160).nullable().optional(),
  stage: z.enum(IDEA_STAGES).default("sourcing"),
  conviction: z.number().int().min(1).max(5).nullable().optional(),
  risk_score: z.number().int().min(1).max(5).nullable().optional(),
  target_weight_pct: z.number().min(-1).max(1).nullable().optional(),
  thesis: z.string().max(4000).nullable().optional(),
  why_beat_qqq: z.string().max(4000).nullable().optional(),
  falsifier: z.string().max(4000).nullable().optional(),
  catalyst: z.string().max(4000).nullable().optional(),
  next_action: z.string().max(1000).nullable().optional(),
  persona_slug: z.string().max(64).nullable().optional(),
  memo_id: z.string().uuid().nullable().optional(),
  theme_slug: z.string().max(64).nullable().optional(),
  tags,
  source: z.string().max(64).default("manual"),
  source_ref: jsonObject.default({}),
  owner: z.string().max(64).default("dustin"),
  metadata: jsonObject.default({}),
}).strict();

export const ideaPatch = ideaCreate.partial().extend({
  sort_order: z.number().optional(),
  archived_reason: z.string().max(1000).nullable().optional(),
  current_weight_pct: z.number().nullable().optional(),
});

export const ideaReorder = z.object({
  moves: z.array(z.object({ id: z.string().uuid(), stage: z.enum(IDEA_STAGES), sort_order: z.number() })).min(1).max(200),
  actor: z.string().max(64).default("dustin"),
});

export const noteCreate = z.object({
  kind: z.enum(NOTE_KINDS).default("note"),
  title: z.string().trim().min(1).max(200),
  body_md: z.string().max(200_000).default(""),
  tickers: z.array(ticker).max(20).default([]),
  tags,
  persona_slug: z.string().max(64).nullable().optional(),
  idea_id: z.string().uuid().nullable().optional(),
  linked_memo_id: z.string().uuid().nullable().optional(),
  verdict: z.string().max(24).nullable().optional(),
  conviction: z.number().int().min(1).max(5).nullable().optional(),
  author: z.string().max(64).default("dustin"),
  source_system: z.string().max(64).default("hermes_app"),
  is_pinned: z.boolean().default(false),
  occurred_at: z.string().datetime({ offset: true }).optional(),
  metadata: jsonObject.default({}),
}).strict();

export const notePatch = noteCreate.partial();

export const tradeCreate = z.object({
  trade_time: z.string().datetime({ offset: true }),
  symbol: ticker,
  ticker: ticker.nullable().optional(),
  company_name: z.string().max(160).nullable().optional(),
  asset_type: z.enum(["stock", "option", "etf", "cash", "bond", "fx", "other"]).default("stock"),
  side: z.enum(["BUY", "SELL", "SHORT", "COVER", "ASSIGN", "EXERCISE", "EXPIRE", "DIVIDEND", "OTHER"]),
  quantity: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  notional_usd: z.number().nullable().optional(),
  fees_usd: z.number().nullable().optional(),
  realized_pnl_usd: z.number().nullable().optional(),
  sleeve_id: z.string().max(64).default("ibkr-core"),
  idea_id: z.string().uuid().nullable().optional(),
  memo_id: z.string().uuid().nullable().optional(),
  rationale: z.string().max(4000).nullable().optional(),
  tags,
  source: z.string().max(64).default("manual"),
  source_ref: jsonObject.default({}),
  external_key: z.string().max(200).nullable().optional(),
});

const rule = z.object({ id: z.string().min(1), title: z.string().min(1), detail: z.string().optional(), kind: z.enum(["rule", "gate", "limit", "process"]).optional() });
const kpi = z.object({ id: z.string().min(1), label: z.string().min(1), target: z.string().optional(), source: z.string().optional(), detail: z.string().optional() });
const sleeve = z.object({ id: z.string().min(1), name: z.string().min(1), role: z.string().min(1), target_weight: z.number().optional(), benchmark: z.string().optional(), note: z.string().optional() });

export const mandatePut = z.object({
  title: z.string().min(1).max(120),
  mission: z.string().min(1).max(2000),
  benchmark_symbol: z.string().min(1).max(12).default("QQQ"),
  horizon_years: z.number().int().min(1).max(50).default(10),
  hurdle_irr: z.number().min(0).max(1).default(0.15),
  rules: z.array(rule).default([]),
  kpis: z.array(kpi).default([]),
  sleeves: z.array(sleeve).default([]),
  guardrails: z.array(rule).default([]),
  metadata: jsonObject.default({}),
});

export const personaCreate = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,64}$/),
  display_name: z.string().min(1).max(120),
  framework_name: z.string().max(200).default(""),
  framework_version: z.string().max(80).default("hermes-v1"),
  description: z.string().max(4000).default(""),
  instruction_path: z.string().max(300).nullable().optional(),
  is_active: z.boolean().default(true),
  headline: z.string().max(200).nullable().optional(),
  persona_prompt: z.string().max(40_000).nullable().optional(),
  metadata: jsonObject.default({}),
});

export const personaPatch = personaCreate.omit({ slug: true }).partial();

export const quantJobCreate = z.object({
  kind: z.enum(["screen", "backtest", "factor", "signal", "custom"]),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  spec: jsonObject.default({}),
  status: z.enum(["draft", "queued", "running", "done", "error"]).default("draft"),
  result: jsonObject.nullable().optional(),
  result_summary: z.string().max(4000).nullable().optional(),
  requested_by: z.string().max(64).default("dustin"),
  is_saved: z.boolean().default(true),
  run: z.boolean().default(false),
}).strict();

export const quantJobPatch = quantJobCreate.omit({ run: true }).partial().extend({
  run_by: z.string().max(64).nullable().optional(),
  error: z.string().max(4000).nullable().optional(),
}).strict();

export const agentTaskCreate = z.object({
  task_type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  instructions: z.string().max(20_000).nullable().optional(),
  payload: jsonObject.default({}),
  priority: z.number().int().min(0).max(100).default(50),
  ticker: ticker.nullable().optional(),
  idea_id: z.string().uuid().nullable().optional(),
  created_by: z.string().max(64).default("dustin"),
}).strict();

export const agentTaskPatch = z.object({
  status: z.enum(["open", "claimed", "done", "failed", "cancelled"]).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  instructions: z.string().max(20_000).nullable().optional(),
  result: jsonObject.nullable().optional(),
  result_ref: jsonObject.optional(),
  assigned_agent: z.string().max(64).nullable().optional(),
});

export const agentClaim = z.object({
  agent: z.string().min(1).max(64),
  task_types: z.array(z.string().min(1).max(64)).max(20).optional(),
}).strict();

export const agentComplete = z.object({
  status: z.enum(["done", "failed"]).default("done"),
  result: jsonObject.default({}),
  result_ref: jsonObject.default({}),
  summary: z.string().max(4000).optional(),
}).strict();

const versionLabel = z.string().trim().min(1).max(80);
const finiteTimestamp = z.string().datetime({ offset: true }).refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Timestamp must be a finite, parseable instant.",
);
const canonicalTimestamp = finiteTimestamp.transform((value) => new Date(value).toISOString());
const pastOrPresentTimestamp = finiteTimestamp.refine(
  (value) => Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
  "Timestamp cannot be in the future.",
);
const canonicalPastOrPresentTimestamp = pastOrPresentTimestamp.transform((value) => new Date(value).toISOString());
const graphModelVersion = canonicalPastOrPresentTimestamp;
const stableKey = z.string().trim().min(3).max(240);
const evidenceUrlPattern = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z])(?:[/?#][^\s]*)?$/i;
const reservedEvidenceHostSuffix = /(?:^|\.)(?:localhost|local|test|invalid|example|onion|internal|lan|home|localdomain)$/i;
const safeEvidenceUrl = z.string().trim().url().max(2000).refine(
  (value) => {
    if (!evidenceUrlPattern.test(value)) return false;
    const hostname = new URL(value).hostname;
    return !reservedEvidenceHostSuffix.test(hostname);
  },
  "Evidence URL must be a valid credential-free HTTPS URL with a fully qualified public host.",
);
const nodeTypes = ["company", "assumption", "forecast", "falsifier", "monitor", "source", "evidence", "outcome", "agent_run", "decision", "theme"] as const;
const relationships = ["has_forecast", "depends_on", "could_invalidate", "tests", "informed_by", "supports", "refutes", "revises", "confirms", "disconfirms", "produced_by", "competes_with"] as const;

export const promptListQuery = z.object({
  limit: integerQuery(500, 1, 500),
  offset: integerQuery(0, 0, 1_000_000),
}).strict();

export const agentRunListQuery = z.object({
  limit: integerQuery(100, 1, 500),
  offset: integerQuery(0, 0, 1_000_000),
  ticker: ticker.optional(),
  workflow: z.string().trim().min(1).max(100).optional(),
}).strict();

export const forecastListQuery = z.object({
  limit: integerQuery(500, 1, 999),
  offset: integerQuery(0, 0, 1_000_000),
  ticker: ticker.optional(),
  status: z.enum(["open", "graded", "superseded", "cancelled"]).optional(),
}).strict();

export const runIdParams = z.object({ id: z.string().uuid() }).strict();

export const promptVersionCreate = z.object({
  prompt_id: z.string().trim().min(2).max(100),
  version: versionLabel,
  role: z.string().trim().min(2).max(160),
  schema_version: versionLabel,
  prompt_body: z.string().min(1).max(200_000),
  status: z.enum(["draft", "active", "retired"]).default("active"),
  description: z.string().trim().max(2000).nullable().optional(),
  metadata: jsonObject.default({}),
}).strict();

export const agentRunCreate = z.object({
  workflow_id: z.string().trim().min(2).max(100),
  workflow_version: versionLabel,
  external_key: z.string().trim().min(3).max(240).nullable().optional(),
  prompt_id: z.string().trim().min(2).max(100).nullable().optional(),
  prompt_version: versionLabel.nullable().optional(),
  agent_name: z.string().trim().min(2).max(100),
  status: z.enum(["queued", "running"]).default("running"),
  ticker: ticker.nullable().optional(),
  task_id: z.string().uuid().nullable().optional(),
  tools_used: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  source_count: z.number().int().min(0).max(100_000).default(0),
  input_ref: jsonObject.default({}),
  output_ref: jsonObject.default({}),
  started_at: pastOrPresentTimestamp.optional(),
  completed_at: z.never().optional(),
  error: z.string().max(10_000).nullable().optional(),
  metrics: jsonObject.default({}),
  metadata: jsonObject.default({}),
}).strict().superRefine((run, ctx) => {
  if ((run.prompt_id != null) !== (run.prompt_version != null)) {
    ctx.addIssue({
      code: "custom",
      path: [run.prompt_id == null ? "prompt_id" : "prompt_version"],
      message: "Prompt id and prompt version must either both be present or both be null.",
    });
  }
});

export const agentRunPatch = z.object({
  status: z.enum(["running", "succeeded", "failed", "cancelled"]).optional(),
  output_ref: jsonObject.optional(),
  completed_at: pastOrPresentTimestamp.nullable().optional(),
  error: z.string().max(10_000).nullable().optional(),
  metrics: jsonObject.optional(),
  metadata: jsonObject.optional(),
}).strict().superRefine((patch, ctx) => {
  if (Object.keys(patch).length === 0) {
    ctx.addIssue({ code: "custom", message: "Agent run patch cannot be empty." });
  }
  const terminal = patch.status != null && ["succeeded", "failed", "cancelled"].includes(patch.status);
  if (terminal && patch.completed_at == null) {
    ctx.addIssue({ code: "custom", path: ["completed_at"], message: "Terminal agent run status requires completed_at." });
  }
  if (patch.status === "running" && patch.completed_at != null) {
    ctx.addIssue({ code: "custom", path: ["completed_at"], message: "Running agent runs cannot have completed_at." });
  }
  if (patch.status == null && patch.completed_at !== undefined) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Updating completed_at requires an explicit status." });
  }
});

export const agentRunCompletionWindow = z.object({
  started_at: pastOrPresentTimestamp,
  completed_at: pastOrPresentTimestamp,
}).superRefine((window, ctx) => {
  if (Date.parse(window.completed_at) < Date.parse(window.started_at)) {
    ctx.addIssue({
      code: "custom",
      path: ["completed_at"],
      message: "Agent run completed_at cannot be before persisted started_at.",
    });
  }
});

const underwritingNodeCreate = z.object({
  stable_key: stableKey,
  node_type: z.enum(nodeTypes),
  ticker: ticker.nullable().optional(),
  title: z.string().trim().min(1).max(300),
  body: z.string().max(20_000).nullable().optional(),
  status: z.enum(["active", "open", "graded", "superseded"]).default("active"),
  confidence: z.number().min(0).max(1).nullable().optional(),
  as_of: canonicalPastOrPresentTimestamp,
  valid_until: canonicalTimestamp.nullable().optional(),
  agent_run_id: z.string().uuid().nullable().optional(),
  prompt_id: z.string().trim().min(2).max(100).nullable().optional(),
  prompt_version: versionLabel.nullable().optional(),
  payload: jsonObject.default({}),
}).strict().superRefine((node, ctx) => {
  if (node.valid_until != null && Date.parse(node.valid_until) < Date.parse(node.as_of)) {
    ctx.addIssue({
      code: "custom",
      path: ["valid_until"],
      message: "Graph node valid_until must be greater than or equal to as_of.",
    });
  }
  if ((node.prompt_id != null) !== (node.prompt_version != null)) {
    ctx.addIssue({
      code: "custom",
      path: [node.prompt_id == null ? "prompt_id" : "prompt_version"],
      message: "Node prompt id and prompt version must either both be present or both be null.",
    });
  }
});

const underwritingEdgeCreate = z.object({
  from_key: stableKey,
  to_key: stableKey,
  relationship: z.enum(relationships),
  strength: z.number().min(-1).max(1).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
  agent_run_id: z.string().uuid().nullable().optional(),
  metadata: jsonObject.default({}),
}).strict();

export const underwritingGraphBatchCreate = z.object({
  agent_run_id: z.string().uuid(),
  nodes: z.array(underwritingNodeCreate).min(1).max(2000),
  edges: z.array(underwritingEdgeCreate).max(10_000).default([]),
}).strict().superRefine((batch, ctx) => {
  const keys = new Set(batch.nodes.map((node) => node.stable_key));
  if (keys.size !== batch.nodes.length) {
    ctx.addIssue({ code: "custom", path: ["nodes"], message: "Node stable keys must be unique within a graph batch." });
  }
  batch.nodes.forEach((node, index) => {
    if (node.agent_run_id && node.agent_run_id !== batch.agent_run_id) {
      ctx.addIssue({ code: "custom", path: ["nodes", index, "agent_run_id"], message: "Node run ids must match the graph batch run id." });
    }
  });
  const edgeKeys = new Set<string>();
  batch.edges.forEach((edge, index) => {
    const edgeKey = JSON.stringify([edge.from_key, edge.to_key, edge.relationship]);
    if (edgeKeys.has(edgeKey)) {
      ctx.addIssue({ code: "custom", path: ["edges", index], message: "Graph edges must be logically unique within a batch." });
    }
    edgeKeys.add(edgeKey);
    if (!keys.has(edge.from_key) || !keys.has(edge.to_key)) {
      ctx.addIssue({ code: "custom", path: ["edges", index], message: "Every edge endpoint must be present in the submitted node batch." });
    }
    if (edge.agent_run_id && edge.agent_run_id !== batch.agent_run_id) {
      ctx.addIssue({ code: "custom", path: ["edges", index, "agent_run_id"], message: "Edge run ids must match the graph batch run id." });
    }
  });
});

export const forecastCreate = z.object({
  stable_key: stableKey,
  ticker,
  scenario: z.enum(["Bear", "Base", "Bull", "Probability-weighted"]),
  forecast_type: z.enum(["annualized_return", "target_price", "revenue_cagr", "margin", "binary"]),
  horizon_date: z.string().date().refine((value) => value > new Date().toISOString().slice(0, 10), "Forecast horizon must be after today."),
  probability: z.number().min(0).max(1).nullable().optional(),
  predicted_value: z.number().finite(),
  unit: z.string().trim().min(1).max(40).default("ratio"),
  benchmark_symbol: ticker.default("QQQ"),
  benchmark_value: z.number().finite().nullable().optional(),
  agent_run_id: z.string().uuid(),
  model_version: graphModelVersion,
  prompt_id: z.string().trim().min(2).max(100).nullable().optional(),
  prompt_version: versionLabel.nullable().optional(),
  status: z.literal("open").default("open"),
  metadata: jsonObject.default({}),
}).strict().superRefine((forecast, ctx) => {
  if ((forecast.prompt_id != null) !== (forecast.prompt_version != null)) {
    ctx.addIssue({
      code: "custom",
      path: [forecast.prompt_id == null ? "prompt_id" : "prompt_version"],
      message: "Forecast prompt id and prompt version must either both be present or both be null.",
    });
  }
});

export const forecastOutcomeCreate = z.object({
  forecast_id: z.string().uuid(),
  observed_at: pastOrPresentTimestamp,
  actual_value: z.number().finite(),
  qqq_value: z.number().finite().nullable().optional(),
  outcome_occurred: z.boolean().nullable().optional(),
  evidence_url: safeEvidenceUrl,
  notes: z.string().max(4000).nullable().optional(),
  metadata: jsonObject.default({}),
}).strict();

const bestIdeaSnapshotItem = z.object({
  ticker,
  companyName: z.string().trim().max(160).nullable().optional(),
  thesis: z.string().trim().max(4000).nullable().optional(),
  whyBeatQqq: z.string().trim().max(4000).nullable().optional(),
  falsifier: z.string().trim().max(4000).nullable().optional(),
  nextAction: z.string().trim().max(1000).nullable().optional(),
  conviction: z.number().min(0).max(100).nullable().optional(),
  risk: z.number().min(0).max(100).nullable().optional(),
  targetWeight: z.number().min(-1).max(1).nullable().optional(),
  currentWeight: z.number().min(-1).max(1).nullable().optional(),
  score: z.number().min(0).max(100).nullable().optional(),
  theme: z.string().trim().max(80).nullable().optional(),
  persona: z.string().trim().max(80).nullable().optional(),
  qqqLine: z.enum(["above", "below"]).nullable().optional(),
  qqqLineReason: z.string().trim().max(1000).nullable().optional(),
  modeledReturn: z.number().min(-1).max(10).nullable().optional(),
  tags,
}).strict();

export const bestIdeasSnapshotCreate = z.object({
  asOf: z.string().datetime({ offset: true }).optional(),
  thesis: z.string().trim().max(4000).nullable().optional(),
  topTen: z.array(bestIdeaSnapshotItem).min(1).max(10),
  watchlistTen: z.array(bestIdeaSnapshotItem).max(10).default([]),
  actor: z.string().trim().max(64).default("hermes"),
}).strict();

const learningChange = z.object({
  title: z.string().trim().min(1).max(200),
  learning: z.string().trim().min(1).max(4000),
  implication: z.string().trim().min(1).max(4000),
  source: z.string().trim().max(400).nullable().optional(),
  tickers: z.array(ticker).max(20).default([]),
}).strict();

export const learningSnapshotCreate = z.object({
  asOf: z.string().datetime({ offset: true }).optional(),
  summary: z.string().trim().min(1).max(4000),
  principles: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  changes: z.array(learningChange).min(1).max(20),
  actor: z.string().trim().max(64).default("hermes"),
}).strict();

export type IdeaCreate = z.infer<typeof ideaCreate>;
export type NoteCreate = z.infer<typeof noteCreate>;
export type TradeCreate = z.infer<typeof tradeCreate>;
export type MandatePut = z.infer<typeof mandatePut>;
export type QuantJobCreate = z.infer<typeof quantJobCreate>;

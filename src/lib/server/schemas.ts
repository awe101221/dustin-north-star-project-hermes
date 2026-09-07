import { z } from "zod";
import { IDEA_STAGES, NOTE_KINDS } from "@/lib/db/types";

/** Shared zod schemas for UI + agent writes. Numbers are decimal ratios. */
const ticker = z.string().trim().min(1).max(24).transform((s) => s.toUpperCase());
const tags = z.array(z.string().trim().min(1).max(40)).max(30).default([]);
const jsonObject = z.record(z.string(), z.unknown());

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
});

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
});

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
});

export const quantJobPatch = quantJobCreate.omit({ run: true }).partial().extend({
  run_by: z.string().max(64).nullable().optional(),
  error: z.string().max(4000).nullable().optional(),
});

export const agentTaskCreate = z.object({
  task_type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  instructions: z.string().max(20_000).nullable().optional(),
  payload: jsonObject.default({}),
  priority: z.number().int().min(0).max(100).default(50),
  ticker: ticker.nullable().optional(),
  idea_id: z.string().uuid().nullable().optional(),
  created_by: z.string().max(64).default("dustin"),
});

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
});

export const agentComplete = z.object({
  status: z.enum(["done", "failed"]).default("done"),
  result: jsonObject.default({}),
  result_ref: jsonObject.default({}),
  summary: z.string().max(4000).optional(),
});

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
});

export const bestIdeasSnapshotCreate = z.object({
  asOf: z.string().datetime({ offset: true }).optional(),
  thesis: z.string().trim().max(4000).nullable().optional(),
  topTen: z.array(bestIdeaSnapshotItem).min(1).max(10),
  watchlistTen: z.array(bestIdeaSnapshotItem).max(10).default([]),
  actor: z.string().trim().max(64).default("hermes"),
});

const learningChange = z.object({
  title: z.string().trim().min(1).max(200),
  learning: z.string().trim().min(1).max(4000),
  implication: z.string().trim().min(1).max(4000),
  source: z.string().trim().max(400).nullable().optional(),
  tickers: z.array(ticker).max(20).default([]),
});

export const learningSnapshotCreate = z.object({
  asOf: z.string().datetime({ offset: true }).optional(),
  summary: z.string().trim().min(1).max(4000),
  principles: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  changes: z.array(learningChange).min(1).max(20),
  actor: z.string().trim().max(64).default("hermes"),
});

export type IdeaCreate = z.infer<typeof ideaCreate>;
export type NoteCreate = z.infer<typeof noteCreate>;
export type TradeCreate = z.infer<typeof tradeCreate>;
export type MandatePut = z.infer<typeof mandatePut>;
export type QuantJobCreate = z.infer<typeof quantJobCreate>;

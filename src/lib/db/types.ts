/**
 * Row types for every table / view Hermes reads. Hand-written on purpose:
 * the legacy project has 100+ tables and generated types would bury the 20
 * surfaces that matter. Numeric columns arrive from PostgREST as strings for
 * `numeric`, so mappers in each domain module coerce with toNumber().
 */

// ── Legacy (Awe Capital) surfaces ───────────────────────────────────────────

export type Verdict = "BUY" | "BUY-MORE" | "MAINTAIN" | "WATCH" | "TRIM" | "EXIT" | "PASS" | "AVOID" | "SHORT" | "DATA_GAP";

export type AnalystMemoRow = {
  id: string;
  analyst_slug: string;
  ticker: string;
  company_name: string | null;
  source_system: string | null;
  status: string;
  verdict: string;
  horizon_years: string | number | null;
  current_price: string | number | null;
  buy_consideration_price: string | number | null;
  reunderwrite_trigger_price: string | number | null;
  probability_weighted_value: string | number | null;
  expected_irr: string | number | null;
  downside_drawdown_pct: string | number | null;
  math_must_work: boolean | null;
  differentiation_score: string | number | null;
  position_context: unknown;
  memo_markdown: string | null;
  thesis_bullets: unknown;
  valuation: unknown;
  kpis: unknown;
  catalysts: unknown;
  risks: unknown;
  action_plan: unknown;
  data_sources: unknown;
  raw_output: unknown;
  company_metadata: unknown;
  gates: unknown;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AnalystPersonaRow = {
  slug: string;
  display_name: string | null;
  framework_name: string | null;
  framework_version: string | null;
  description: string | null;
  instruction_path: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PersonaCatalogRow = AnalystPersonaRow & {
  headline: string | null;
  persona_prompt: string | null;
  output_route: string | null;
  master_blend_weight: string | number | null;
  artifact_count: number | string;
  memo_count: number | string;
  ticker_count: number | string;
  last_memo_at: string | null;
  knowledge_count: number | string;
};

export type ProjectArtifactRow = {
  artifact_key: string;
  analyst_slug: string;
  artifact_type: string;
  title: string;
  description: string | null;
  source_path: string | null;
  content_format: string;
  content: string;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

export type PromptTemplateRow = {
  id: string;
  kind: string;
  channel: string;
  prompt: string;
  instructions: string | null;
  is_active: boolean;
  version: number;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

export type CompanyRow = {
  ticker: string;
  symbol: string | null;
  company_name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  subindustry: string | null;
  country: string | null;
  currency: string | null;
  provenance: string | null;
  needs_metadata_backfill: boolean | null;
  updated_at: string;
};

export type CompanyFilingRow = {
  id: string;
  ticker: string;
  form_type: string | null;
  filing_date: string | null;
  accession_number: string | null;
  filing_url: string | null;
  review_status: string | null;
  fetched_at: string | null;
};

export type PositionRow = {
  id: string;
  account: string;
  report_date: string;
  symbol: string;
  normalized_symbol: string | null;
  ticker: string | null;
  company_name: string | null;
  asset_type: string | null;
  currency: string | null;
  quantity: string | number | null;
  cost_price: string | number | null;
  close_price: string | number | null;
  cost_basis_usd: string | number | null;
  market_value_usd: string | number | null;
  unrealized_pnl: string | number | null;
  pct_of_nav: string | number | null;
  realized_st: string | number | null;
  realized_lt: string | number | null;
  dividends_ytd: string | number | null;
  ytd_roi_pct: string | number | null;
  ytd_m2m_pnl: string | number | null;
  total_pnl_ytd: string | number | null;
  options_pnl_realized: string | number | null;
  mkt_value_lagged: boolean | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
};

export type OptionPositionRow = {
  id: string;
  report_date: string;
  underlying_symbol: string;
  normalized_underlying: string | null;
  option_right: string;
  strike: string | number;
  expiry: string;
  quantity: string | number;
  market_value_usd: string | number | null;
  unrealized_pnl: string | number | null;
  dte: number | null;
};

export type NavHistoryRow = {
  id: string;
  account: string;
  snapshot_date: string;
  net_liquidation: string | number | null;
  cash_balance: string | number | null;
  ytd_return_pct: string | number | null;
  source: string | null;
};

export type BenchmarkSeriesRow = {
  as_of: string;
  portfolio_nav: string | number | null;
  portfolio_index: string | number | null;
  qqq_adj_close: string | number | null;
  qqq_index: string | number | null;
  cumulative_alpha: string | number | null;
  annualized_alpha: string | number | null;
  net_external_flows: string | number | null;
  portfolio_ytd_twr: string | number | null;
  cash_balance: string | number | null;
  notes: string | null;
};

export type AnnualReturnRow = {
  year: number;
  period_start: string;
  period_end: string;
  twr_pct: string | number | null;
  qqq_return_pct: string | number | null;
  starting_nav: string | number | null;
  ending_nav: string | number | null;
  net_deposits: string | number | null;
  source: string | null;
  notes: string | null;
};

export type SleeveRow = {
  id: string;
  name: string;
  manager: string | null;
  trade_authority: string | null;
  benchmark_symbol: string | null;
  inception_date: string | null;
  starting_capital: string | number | null;
  base_currency: string | null;
  status: string | null;
};

export type SleeveRecommendationRow = {
  id: string;
  sleeve_id: string;
  as_of: string;
  rank: number;
  symbol: string;
  company_name: string | null;
  asset_class: string;
  action: string;
  approval_status: string;
  target_weight: string | number | null;
  target_dollars: string | number | null;
  reference_price: string | number | null;
  thesis: string | null;
  why_beat_qqq: string | null;
  falsifier: string | null;
  catalyst: string | null;
  valuation_summary: string | null;
};

export type SleeveNavRow = {
  sleeve_id: string;
  as_of: string;
  nav: string | number | null;
  cash: string | number | null;
  invested_market_value: string | number | null;
  total_return: string | number | null;
  qqq_return: string | number | null;
  active_return: string | number | null;
};

export type SleeveLedgerRow = {
  id: string;
  sleeve_id: string;
  event_date: string;
  event_type: string;
  amount: string | number | null;
  cash_delta: string | number | null;
  description: string | null;
  approved_by: string | null;
};

export type MasterRecommendationRow = {
  id: string;
  as_of: string;
  ticker: string;
  action: string;
  mcs: string | number | null;
  current_weight_pct: string | number | null;
  target_weight_pct: string | number | null;
  reference_price: string | number | null;
  size_suggestion: string | null;
  rationale: string | null;
  memo_refs: unknown;
  status: string;
  mcs_rank: number | null;
};

export type MasterAlertRow = {
  id: string;
  as_of: string;
  ticker: string;
  alert_type: string;
  trigger_price: string | number | null;
  live_price: string | number | null;
  pct_to_trigger: string | number | null;
  analyst_slug: string | null;
  memo_id: string | null;
  note: string | null;
};

export type MasterDigestRow = {
  as_of: string;
  digest_markdown: string;
  stats: Record<string, unknown> | null;
};

export type MasterScoreRow = {
  id: string;
  as_of: string;
  ticker: string;
  company_name: string | null;
  brad_score: string | number | null;
  pabrai_score: string | number | null;
  public_vc_score: string | number | null;
  mcs: string | number | null;
  rank: number | null;
  disqualified: boolean;
  disqualify_reason: string | null;
};

export type DecisionScorecardRow = {
  decision_id: string;
  ticker: string;
  decision_date: string;
  verdict: string;
  price: string | number | null;
  quantity: string | number | null;
  rationale: string | null;
  evaluation_date: string | null;
  current_price: string | number | null;
  realized_return_pct: string | number | null;
  annualized_return_pct: string | number | null;
  qqq_return_pct: string | number | null;
  alpha_pct: string | number | null;
  thesis_status: string | null;
};

export type ScreenerRow = {
  memo_id: string;
  analyst_slug: string;
  ticker: string;
  symbol: string;
  company_name: string | null;
  verdict: string;
  analyzed_at: string | null;
  memo_age_days: number | null;
  memo_price: string | number | null;
  memo_expected_irr: string | number | null;
  memo_pwv: string | number | null;
  buy_consideration_price: string | number | null;
  reunderwrite_trigger_price: string | number | null;
  quote_price: string | number | null;
  quote_as_of: string | null;
  price_drift_pct: string | number | null;
  expected_irr_at_quote: string | number | null;
  probability_weighted_value_pv: string | number | null;
  margin_of_safety_ratio_pv: string | number | null;
  downside_drawdown_pct_at_quote: string | number | null;
  buy_pierced: boolean | null;
  trigger_pierced: boolean | null;
  spawn_recommended: boolean | null;
  downside_drawdown_pct: string | number | null;
  math_must_work: boolean | null;
  horizon_years: string | number | null;
  source_system: string | null;
  chassis: string | null;
  market_cap_mm: string | number | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  mcs: string | number | null;
  mcs_rank: number | null;
  brad_score: string | number | null;
  pabrai_score: string | number | null;
  public_vc_score: string | number | null;
  health: string | null;
  is_rankable: boolean | null;
  has_blocker: boolean | null;
  issue_count: number | null;
  held_weight: string | number | null;
  held_value: string | number | null;
};

export type GuruCrossoverRow = {
  ticker_symbol: string;
  issuer_name: string | null;
  report_date: string;
  buyers: number | string;
  sellers: number | string;
  new_buyers: number | string;
  sold_out: number | string;
  buy_value: string | number | null;
  sell_value: string | number | null;
  buyer_names: string[] | null;
  seller_names: string[] | null;
};

export type TrackedHoldingRow = {
  investor_id: string;
  report_date: string;
  ticker_symbol: string | null;
  issuer_name: string | null;
  shares: string | number | null;
  value_reported: string | number | null;
  display_name?: string;
};

export type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  summary: string | null;
  core_thesis: string | null;
  why_now: string | null;
  time_horizon: string | null;
  confidence: string | null;
  updated_at: string;
};

export type TopRankingRow = {
  id: string;
  analyst_slug: string;
  theme_slug: string | null;
  as_of: string;
  tier: string;
  rank: number;
  ticker: string;
  company_name: string | null;
  memo_id: string | null;
  rationale: string | null;
  primary_caveat: string | null;
  source_system: string | null;
  scores: Record<string, unknown> | null;
  latest_memo_verdict: string | null;
  memo_is_latest: boolean | null;
  snapshot_age_days: number | null;
};

export type ForecastEvaluationRow = {
  forecast_id: string;
  stable_key: string;
  ticker: string;
  scenario: "Bear" | "Base" | "Bull" | "Probability-weighted";
  forecast_type: string;
  model_version: string;
  as_of: string;
  horizon_date: string;
  probability: string | number | null;
  predicted_value: string | number;
  unit: string;
  benchmark_symbol: string;
  benchmark_value: string | number | null;
  status: "open" | "graded" | "superseded" | "cancelled";
  outcome_id: string | null;
  observed_at: string | null;
  actual_value: string | number | null;
  qqq_value: string | number | null;
  outcome_occurred: boolean | null;
  absolute_error: string | number | null;
  alpha: string | number | null;
  directional_hit: boolean | null;
  brier_component: string | number | null;
  agent_run_id: string | null;
};

export type UnderwritingNodeRow = {
  id: string;
  stable_key: string;
  node_type: string;
  ticker: string | null;
  title: string;
  body: string | null;
  status: string;
  confidence: string | number | null;
  as_of: string;
  valid_until: string | null;
  supersedes_id: string | null;
  agent_run_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UnderwritingEdgeRow = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship: string;
  strength: string | number | null;
  note: string | null;
  agent_run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AgentRunRow = {
  id: string;
  workflow_id: string;
  workflow_version: string;
  external_key: string | null;
  prompt_id: string | null;
  prompt_version: string | null;
  agent_name: string;
  status: string;
  ticker: string | null;
  task_id: string | null;
  tools_used: string[];
  source_count: number;
  input_ref: Record<string, unknown>;
  output_ref: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  metrics: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type PromptVersionRow = {
  prompt_id: string;
  version: string;
  role: string;
  schema_version: string;
  prompt_body: string;
  content_sha256: string | null;
  status: string;
  description: string | null;
  metadata: Record<string, unknown>;
  released_at: string;
};

// ── Hermes extension ───────────────────────────────────────────────────────

export type IdeaStage = "sourcing" | "diligence" | "live" | "monitor" | "archive";
export const IDEA_STAGES: IdeaStage[] = ["sourcing", "diligence", "live", "monitor", "archive"];

export type IdeaRow = {
  id: string;
  ticker: string;
  symbol: string;
  company_name: string | null;
  stage: IdeaStage;
  sort_order: number;
  conviction: number | null;
  risk_score: number | null;
  target_weight_pct: string | number | null;
  current_weight_pct: string | number | null;
  thesis: string | null;
  why_beat_qqq: string | null;
  falsifier: string | null;
  catalyst: string | null;
  next_action: string | null;
  persona_slug: string | null;
  memo_id: string | null;
  theme_slug: string | null;
  tags: string[];
  source: string;
  source_ref: Record<string, unknown>;
  owner: string;
  archived_reason: string | null;
  metadata: Record<string, unknown>;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
};

export type IdeaEventRow = {
  id: string;
  idea_id: string;
  event_type: string;
  from_stage: string | null;
  to_stage: string | null;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type NoteKind = "memo" | "note" | "journal" | "decision" | "review" | "meeting" | "agent";
export const NOTE_KINDS: NoteKind[] = ["note", "memo", "journal", "decision", "review", "meeting", "agent"];

export type NoteRow = {
  id: string;
  kind: NoteKind;
  title: string;
  body_md: string;
  tickers: string[];
  tags: string[];
  persona_slug: string | null;
  idea_id: string | null;
  linked_memo_id: string | null;
  verdict: string | null;
  conviction: number | null;
  author: string;
  source_system: string;
  is_pinned: boolean;
  occurred_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ResearchStreamRow = {
  id: string;
  kind: string;
  source_table: "analyst_memos" | "hermes_notes";
  title: string;
  ticker: string | null;
  company_name: string | null;
  persona_slug: string | null;
  verdict: string | null;
  source_system: string | null;
  expected_irr: string | number | null;
  downside_drawdown_pct: string | number | null;
  current_price: string | number | null;
  buy_consideration_price: string | number | null;
  reunderwrite_trigger_price: string | number | null;
  probability_weighted_value: string | number | null;
  tags: string[];
  excerpt: string | null;
  body_length: number | null;
  is_latest: boolean;
  occurred_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type SearchHit = {
  id: string;
  kind: string;
  source_table: string;
  title: string;
  ticker: string | null;
  persona_slug: string | null;
  verdict: string | null;
  occurred_at: string | null;
  rank: number;
  headline: string | null;
};

export type TradeRow = {
  id: string;
  external_key: string | null;
  trade_time: string;
  trade_date: string;
  symbol: string;
  ticker: string | null;
  company_name: string | null;
  asset_type: string;
  side: string;
  quantity: string | number | null;
  price: string | number | null;
  currency: string;
  notional_usd: string | number | null;
  fees_usd: string | number | null;
  realized_pnl_usd: string | number | null;
  sleeve_id: string;
  idea_id: string | null;
  memo_id: string | null;
  rationale: string | null;
  tags: string[];
  source: string;
  source_ref: Record<string, unknown>;
  created_at: string;
};

export type PerformancePointRow = {
  observation_date: string;
  series: "portfolio" | "benchmark";
  nav: string | number | null;
  daily_return: string | number | null;
  index_value: string | number | null;
  ytd_return: string | number | null;
  source: string;
};

export type MandateRule = { id: string; title: string; detail?: string; kind?: "rule" | "gate" | "limit" | "process" };
export type MandateKpi = { id: string; label: string; target?: string; source?: string; detail?: string };
export type MandateSleeve = { id: string; name: string; role: string; target_weight?: number; benchmark?: string; note?: string };

export type MandateRow = {
  id: string;
  version: number;
  title: string;
  mission: string;
  benchmark_symbol: string;
  horizon_years: number;
  hurdle_irr: string | number;
  rules: MandateRule[];
  kpis: MandateKpi[];
  sleeves: MandateSleeve[];
  guardrails: MandateRule[];
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type KnowledgeRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  persona_slug: string | null;
  body_md: string;
  summary: string | null;
  source_repo: string | null;
  source_path: string | null;
  content_sha256: string | null;
  tags: string[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type QuantJobKind = "screen" | "backtest" | "factor" | "signal" | "custom";
export type QuantJobRow = {
  id: string;
  kind: QuantJobKind;
  name: string;
  description: string | null;
  spec: Record<string, unknown>;
  status: "draft" | "queued" | "running" | "done" | "error";
  result: Record<string, unknown> | null;
  result_summary: string | null;
  requested_by: string;
  run_by: string | null;
  error: string | null;
  is_saved: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

export type AgentTaskRow = {
  id: string;
  task_type: string;
  title: string;
  instructions: string | null;
  payload: Record<string, unknown>;
  status: "open" | "claimed" | "done" | "failed" | "cancelled";
  priority: number;
  ticker: string | null;
  idea_id: string | null;
  assigned_agent: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  result_ref: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ActivityRow = {
  id: string;
  kind: string;
  ref_table: string | null;
  ref_id: string | null;
  ticker: string | null;
  title: string;
  detail: string | null;
  actor: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

import { z } from "zod";
import { isMarketSession } from "./market-calendar";

const text = z.string().trim().min(1).max(4000);
const key = z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/);
const date = z.iso.date();
const evidenceUrl = z.url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) &&
    !/(^|\.)(localhost|local|test|invalid|example|internal|onion|lan|home)$/i.test(url.hostname) &&
    !/[\s\\]/.test(value) && !/[?&](apikey|api_key|token|key|secret)=/i.test(value);
}, "Public HTTPS evidence URL without credentials required");
const common = {
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  falsifier: text,
  evidence_urls: z.array(evidenceUrl).min(1).max(20),
  assumption_ids: z.array(key).min(1).max(20),
};
const market = z.object({ ...common, expected_alpha: z.number().min(-1).max(10) }).strict();
const operating = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("sec_kpi"), label: text, target: z.number().finite(),
    operator: z.enum(["gte", "lte"]), unit: key, period_start: date, period_end: date, due_date: date,
    cik: z.string().regex(/^\d{1,10}$/), taxonomy: z.enum(["us-gaap", "ifrs-full"]), concept: key }).strict(),
  z.object({ ...common, kind: z.literal("milestone"), label: text, due_date: date,
    resolution_rule: text }).strict(),
]);

/** Ratios, not percentage points. Probability = P(alpha > 0) or P(KPI/milestone met). */
export const forecastLadderCreate = z.object({
  run_id: z.uuid(), ticker: z.string().regex(/^[A-Z][A-Z0-9.-]{0,19}$/), model_version: text,
  thesis_key: key, conclusion: text, change_reason: text,
  ranking: z.object({ lane: z.enum(["top-ten", "watchlist"]), rank: z.number().int().min(1).max(10),
    qqq_decision: z.enum(["above", "below"]), reason: text }).strict(),
  assumptions: z.array(z.object({ id: key, claim: text, falsifier: text,
    evidence_urls: z.array(evidenceUrl).min(1).max(20) }).strict()).min(1).max(20),
  market_90d: market, market_12m: market, operating,
}).strict().superRefine((input, ctx) => {
  const ids = new Set(input.assumptions.map((a) => a.id));
  if (ids.size !== input.assumptions.length) ctx.addIssue({ code: "custom", message: "Assumption ids must be unique" });
  for (const forecast of [input.market_90d, input.market_12m, input.operating]) {
    if (forecast.assumption_ids.some((id) => !ids.has(id))) ctx.addIssue({ code: "custom", message: "Unknown assumption reference" });
  }
  if (input.operating.kind === "sec_kpi" && (input.operating.period_start >= input.operating.period_end || input.operating.period_end > input.operating.due_date)) {
    ctx.addIssue({ code: "custom", message: "KPI period must end before its grading deadline" });
  }
});
export type ForecastLadderInput = z.infer<typeof forecastLadderCreate>;
export type MarketContract = z.infer<typeof market>;
export type OperatingContract = z.infer<typeof operating>;

export const ladderReviewCreate = z.object({
  forecast_id: z.uuid(), reviewer: text, failed_assumption_ids: z.array(key).max(20),
  finding: text, recommended_change: text, evidence_urls: z.array(evidenceUrl).min(1).max(20),
  // Recommendations are experiments, never silently applied to production prompts.
  disposition: z.enum(["investigate", "test-prompt", "test-model", "no-change"]),
}).strict();

export type PriceSeries = Record<string, number>;
export class EvidencePending extends Error {}
/** Exact completed sessions at registration day + 1 and maturity.
 * Entry is future to registration: no look-ahead selection of an already known close.
 * Both endpoints come from one adjusted-history response per symbol. */
export function marketObservation(stock: PriceSeries, qqq: PriceSeries, start: string, due: string, today: string) {
  const first = start;
  const last = due;
  if (!isMarketSession(first) || !isMarketSession(last) || first >= last || last >= today) throw new EvidencePending("Non-trading, unknown or incomplete endpoint date; keep pending without date substitution");
  const values = [stock[first], stock[last], qqq[first], qqq[last]];
  if (values.some((n) => n === undefined || !Number.isFinite(n) || n <= 0)) throw new EvidencePending("Invalid adjusted-price evidence");
  const stockReturn = stock[last]! / stock[first]! - 1;
  const qqqReturn = qqq[last]! / qqq[first]! - 1;
  // Flag possible unit/corporate-action errors for manual investigation, not a fake outcome.
  if (Math.abs(stockReturn) > 3 || Math.abs(qqqReturn) > 1) throw new EvidencePending("Extreme return requires corporate-action review");
  return { kind: "market" as const, start_date: first, end_date: last,
    stock_start: stock[first], stock_end: stock[last], qqq_start: qqq[first], qqq_end: qqq[last] };
}

export type LadderEvaluation = {
  id: string; ladder_id: string; ticker: string; horizon: "90d" | "12m" | "quarter";
  start_date: string; due_date: string; registered_at: string;
  contract: MarketContract | OperatingContract; payload: ForecastLadderInput;
  agent_name: string; prompt_id: string; prompt_version: string; model_version: string;
  outcome_id: string | null; actual_value: number | string | null; alpha: number | string | null;
  hit: boolean | null; brier: number | string | null; absolute_error: number | string | null;
  evidence_urls: string[] | null; observation: Record<string, unknown> | null;
  measurement_policy?: string | null;
};

export function forecastMisses(forecasts: LadderEvaluation[]) {
  return forecasts.filter((f) => f.outcome_id && ((f.contract.probability >= .5) !== f.hit || (f.alpha !== null && Number(f.absolute_error) >= .1)))
    .sort((a, b) => Number(b.brier) - Number(a.brier));
}

export function ladderMetrics(rows: LadderEvaluation[]) {
  const groups = new Map<string, LadderEvaluation[]>();
  for (const r of rows) {
    const type = r.horizon === "quarter" ? (r.contract as OperatingContract).kind : "market_alpha";
    const basis = r.horizon === "quarter" ? "operating" : String(r.observation?.policy_version ?? r.measurement_policy ?? "legacy-unspecified");
    const group = [r.horizon, type, basis, r.agent_name, r.prompt_id, r.prompt_version, r.model_version].join(" · ");
    groups.set(group, [...(groups.get(group) ?? []), r]);
  }
  return [...groups].map(([cohort, forecasts]) => {
    const graded = forecasts.filter((f) => f.outcome_id);
    const mean = (field: "alpha" | "brier" | "absolute_error") => {
      const values = graded.filter((f) => field !== "absolute_error" || f.horizon !== "quarter").map((f) => f[field]).filter((v) => v !== null).map(Number);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    const bins = [0, 0.2, 0.4, 0.6, 0.8].map((lo, index) => {
      // Integer bin assignment avoids overlapping float boundaries (0.4 + 0.2).
      const subset = graded.filter((f) => Math.min(4, Math.floor(f.contract.probability * 5)) === index);
      return { lo, n: subset.length, predicted: subset.length ? subset.reduce((n, f) => n + f.contract.probability, 0) / subset.length : null,
        observed: subset.length ? subset.filter((f) => f.hit).length / subset.length : null };
    });
    return { cohort, registered: forecasts.length, n: graded.length, alpha: mean("alpha"), brier: mean("brier"), alphaMae: mean("absolute_error"), bins,
      accuracy: graded.length ? graded.filter((f) => (f.contract.probability >= 0.5) === f.hit).length / graded.length : null };
  });
}

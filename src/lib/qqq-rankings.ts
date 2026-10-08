import { z } from "zod";
import { isModelStale } from "@/lib/model-freshness";
import { bareSymbol } from "@/lib/utils";

import { RANKING_LIMIT, RANKING_HORIZON_YEARS, RANKING_MAX_AGE_DAYS, type RankingSleeve } from "@/lib/ranking-constants";
export { RANKING_LIMIT, RANKING_HORIZON_YEARS, RANKING_MAX_AGE_DAYS, SLEEVE_LABELS, type RankingSleeve } from "@/lib/ranking-constants";
const nonempty = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const evidenceUrl = z.url().refine((s) => new URL(s).protocol === "https:", "HTTPS evidence required");
const ticker = nonempty.max(30).regex(/^(?:[A-Z]+:)?[A-Z0-9][A-Z0-9.-]*$/);

export const rankingForecastSchema = z.object({
  securityId: nonempty.toUpperCase().regex(/^(ISIN:[A-Z]{2}[A-Z0-9]{9}[0-9]|SEC:\d{10}:[A-Z0-9-]+)$/),
  ticker,
  companyName: nonempty.max(160),
  modelAsOf: timestamp,
  priceAsOf: timestamp,
  currentPrice: z.number().finite().positive(),
  currency: nonempty.max(8),
  thesis: nonempty.max(4000),
  whyBeatQqq: nonempty.max(4000),
  falsifier: nonempty.max(4000),
  nextAction: nonempty.max(1000),
  theme: nonempty.max(160),
  evidenceUrls: z.array(evidenceUrl).min(1).max(30),
  limitations: nonempty.max(4000),
  capitalStructure: nonempty.max(4000),
  probabilityRationale: nonempty.max(4000),
  scenarios: z.array(z.object({
    name: nonempty.max(100),
    benchmarkScenario: nonempty.max(100),
    probability: z.number().finite().min(0).max(1),
    stockAnnualizedReturn: z.number().finite().min(-1).max(10),
    stockTerminalPrice: z.number().finite().min(0),
    qqqAnnualizedReturn: z.number().finite().min(-1).max(10),
    rationale: nonempty.max(4000),
  }).strict()).min(3).max(12),
}).strict().superRefine((row, ctx) => {
  if (Math.abs(row.scenarios.reduce((n, s) => n + s.probability, 0) - 1) > 1e-9)
    ctx.addIssue({ code: "custom", path: ["scenarios"], message: "Scenario probabilities must sum to one" });
  if (new Set(row.scenarios.map((s) => s.name.toLowerCase())).size !== row.scenarios.length)
    ctx.addIssue({ code: "custom", path: ["scenarios"], message: "Scenario names must be unique" });
  row.scenarios.forEach((s, i) => {
    const impliedPrice = row.currentPrice * (1 + s.stockAnnualizedReturn) ** RANKING_HORIZON_YEARS;
    if (!Number.isFinite(impliedPrice) || Math.abs(impliedPrice - s.stockTerminalPrice) > Math.max(0.02, impliedPrice * 1e-6))
      ctx.addIssue({ code: "custom", path: ["scenarios", i, "stockTerminalPrice"], message: "Five-year terminal price must reproduce the stock CAGR (within price rounding)" });
  });
});

/** A shared comparator prevents mixing horizons, dividends, and return hurdles. */
export const rankingDraftSchema = z.object({
  schemaVersion: z.literal("qqq-top50/v1"),
  sleeve: z.enum(["core", "ai-regime"]),
  asOf: timestamp,
  horizonYears: z.literal(RANKING_HORIZON_YEARS),
  returnBasis: z.literal("price-only"),
  benchmark: z.literal("QQQ"),
  benchmarkAsOf: timestamp,
  benchmarkPrice: z.number().finite().positive(),
  benchmarkEvidenceUrls: z.array(evidenceUrl).min(1).max(20),
  benchmarkScenarios: z.array(z.object({
    name: nonempty.max(100),
    probability: z.number().finite().min(0).max(1),
    annualizedReturn: z.number().finite().min(-1).max(10),
    rationale: nonempty.max(4000),
  }).strict()).min(3).max(5),
  methodology: nonempty.max(6000),
  forecasts: z.array(rankingForecastSchema).min(1).max(500),
}).strict().superRefine((draft, ctx) => {
  if (Math.abs(draft.benchmarkScenarios.reduce((n, s) => n + s.probability, 0) - 1) > 1e-9 || new Set(draft.benchmarkScenarios.map((s) => s.name)).size !== draft.benchmarkScenarios.length)
    ctx.addIssue({ code: "custom", path: ["benchmarkScenarios"], message: "QQQ scenarios must be unique and sum to one" });
  const securities = draft.forecasts.map((f) => f.securityId);
  if (new Set(securities).size !== securities.length || new Set(draft.forecasts.map((f) => f.ticker)).size !== draft.forecasts.length)
    ctx.addIssue({ code: "custom", path: ["forecasts"], message: "Duplicate company in sleeve" });
  draft.forecasts.forEach((f, i) => {
    for (const scenario of f.scenarios) {
      const benchmark = draft.benchmarkScenarios.find((b) => b.name === scenario.benchmarkScenario);
      if (!benchmark || scenario.qqqAnnualizedReturn !== benchmark.annualizedReturn)
        ctx.addIssue({ code: "custom", path: ["forecasts", i, "scenarios"], message: "Every stock scenario must match a shared QQQ scenario return" });
    }
    for (const benchmark of draft.benchmarkScenarios) {
      const mass = f.scenarios.filter((s) => s.benchmarkScenario === benchmark.name).reduce((n, s) => n + s.probability, 0);
      if (Math.abs(mass - benchmark.probability) > 1e-9)
        ctx.addIssue({ code: "custom", path: ["forecasts", i, "scenarios"], message: "Every company must use the same QQQ marginal probability distribution" });
    }
    if (Date.parse(f.priceAsOf) !== Date.parse(draft.benchmarkAsOf))
      ctx.addIssue({ code: "custom", path: ["forecasts", i, "priceAsOf"], message: "Stock and QQQ must use the same valuation timestamp" });
    if (Date.parse(f.modelAsOf) > Date.parse(draft.asOf))
      ctx.addIssue({ code: "custom", path: ["forecasts", i, "modelAsOf"], message: "Model cannot postdate publication" });
  });
  if (Date.parse(draft.benchmarkAsOf) > Date.parse(draft.asOf))
    ctx.addIssue({ code: "custom", path: ["benchmarkAsOf"], message: "Benchmark cannot postdate publication" });
});

const attestation = z.object({
  taskId: z.string().regex(/^t_[a-f0-9]{8}$/),
  runId: z.string().regex(/^[1-9][0-9]*$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedAt: timestamp,
}).strict();
export const rankingPublicationSchema = z.object({
  draft: rankingDraftSchema,
  author: z.literal("investment-underwriter"),
  review: attestation.extend({ actor: z.literal("evidence-risk-reviewer"), verdict: z.enum(["PASS", "PASS WITH CAVEATS"]) }),
  approval: attestation.extend({ actor: z.literal("north-star-pm"), decision: z.literal("APPROVE RANKING PUBLICATION") }),
}).strict().superRefine((p, ctx) => {
  if (new Set([p.author, p.review.actor, p.approval.actor]).size !== 3 || p.review.taskId === p.approval.taskId || p.review.runId === p.approval.runId)
    ctx.addIssue({ code: "custom", path: ["review"], message: "Author, independent reviewer, and PM must be distinct" });
  if (p.review.contentHash !== p.approval.contentHash)
    ctx.addIssue({ code: "custom", path: ["approval"], message: "Review and approval must bind identical content" });
  if (Date.parse(p.review.reviewedAt) < Date.parse(p.draft.asOf) || Date.parse(p.approval.reviewedAt) < Date.parse(p.review.reviewedAt))
    ctx.addIssue({ code: "custom", path: ["approval", "reviewedAt"], message: "Approval must follow independent review of the publication" });
});

export type RankingForecast = z.infer<typeof rankingForecastSchema>;
export type RankingDraft = z.infer<typeof rankingDraftSchema>;
export type RankingPublication = z.infer<typeof rankingPublicationSchema>;
export type RankingProvenance = Omit<RankingPublication, "draft"> & { draft: Omit<RankingDraft, "forecasts"> };
export type RankedForecast = RankingForecast & {
  rank: number;
  probabilityBeatQqq: number;
  expectedAnnualizedReturn: number;
  expectedQqqReturn: number;
};
export type RankingCandidate = { ticker: string; companyName: string | null; thesis: string | null; nextAction: string | null };
export type SleeveRanking = {
  sleeve: RankingSleeve;
  asOf: string | null;
  publication: RankingProvenance | null;
  rows: RankedForecast[];
  stale: RankingForecast[];
  candidates: RankingCandidate[];
  missingSlots: number;
};

export function forecastMetrics(f: RankingForecast) {
  const probability = f.scenarios.reduce((n, s) => n + (s.stockAnnualizedReturn > s.qqqAnnualizedReturn ? s.probability : 0), 0);
  return {
    // Ties with QQQ are not outperformance. Do not multiply marginal scenario
    // probabilities: the stock and QQQ outcomes describe the SAME scenario.
    probabilityBeatQqq: Math.min(1, probability),
    expectedAnnualizedReturn: f.scenarios.reduce((n, s) => n + s.probability * s.stockAnnualizedReturn, 0),
    expectedQqqReturn: f.scenarios.reduce((n, s) => n + s.probability * s.qqqAnnualizedReturn, 0),
  };
}

export function rankForecasts(forecasts: RankingForecast[]): RankedForecast[] {
  return forecasts.map((f) => ({ ...f, ...forecastMetrics(f) }))
    .sort((a, b) => b.probabilityBeatQqq - a.probabilityBeatQqq || bareSymbol(a.ticker).localeCompare(bareSymbol(b.ticker)) || a.securityId.localeCompare(b.securityId))
    .slice(0, RANKING_LIMIT).map((f, i) => ({ ...f, rank: i + 1 }));
}

/** Call only with publications whose content hash was verified by the loader. */
export function buildSleeveRanking(sleeve: RankingSleeve, publications: RankingPublication[], candidates: RankingCandidate[] = [], now = new Date().toISOString()): SleeveRanking {
  const publication = latestRankingPublication(sleeve, publications, now);
  const forecasts = publication?.draft.forecasts ?? [];
  const stale = forecasts.filter((f) => isModelStale(f.modelAsOf, now, RANKING_MAX_AGE_DAYS) || isModelStale(f.priceAsOf, now, RANKING_MAX_AGE_DAYS));
  const blocked = new Set(stale.map((f) => f.securityId));
  const rows = rankForecasts(forecasts.filter((f) => !blocked.has(f.securityId)));
  const covered = new Set(forecasts.map((f) => bareSymbol(f.ticker).toUpperCase()));
  const seen = new Set<string>();
  const pending = candidates.filter((c) => {
    const symbol = bareSymbol(c.ticker).toUpperCase();
    if (!symbol || covered.has(symbol) || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  }).sort((a, b) => a.ticker.localeCompare(b.ticker));
  let provenance: RankingProvenance | null = null;
  if (publication) {
    const { forecasts: _forecasts, ...header } = publication.draft;
    provenance = { ...publication, draft: header };
  }
  return { sleeve, asOf: publication?.draft.asOf ?? null, publication: provenance, rows, stale, candidates: pending, missingSlots: Math.max(0, RANKING_LIMIT - rows.length) };
}

export function latestRankingPublication(sleeve: RankingSleeve, publications: RankingPublication[], now = new Date().toISOString()): RankingPublication | null {
  return publications.filter((p) => p.draft.sleeve === sleeve && Date.parse(p.approval.reviewedAt) <= Date.parse(now))
    .sort((a, b) => Date.parse(b.draft.asOf) - Date.parse(a.draft.asOf) || Date.parse(b.approval.reviewedAt) - Date.parse(a.approval.reviewedAt))[0] ?? null;
}

/** Active sleeves use one shared comparator and one numeric model per security. */
export function assertSharedForecastConsistency(verified: RankingPublication[], now = new Date().toISOString()): void {
  const latest = (["core", "ai-regime"] as const).map((sleeve) => latestRankingPublication(sleeve, verified, now));
  const contracts = new Map<string, string>();
  let benchmarkContract: string | null = null;
  for (const p of latest) {
    if (p) {
      const date = Date.parse(p.draft.benchmarkAsOf);
      const contract = JSON.stringify({ date, price: p.draft.benchmarkPrice, scenarios: p.draft.benchmarkScenarios
        .map(({ name, probability, annualizedReturn }) => ({ name, probability, annualizedReturn }))
        .sort((a, b) => a.name.localeCompare(b.name)) });
      if (benchmarkContract && benchmarkContract !== contract)
        throw new Error("Active sleeves must share the exact QQQ benchmark date, price, and assumptions");
      benchmarkContract = contract;
    }
    for (const f of p?.draft.forecasts ?? []) {
      const key = f.securityId;
      const scenarios = f.scenarios.map(({ benchmarkScenario, probability, stockAnnualizedReturn, stockTerminalPrice, qqqAnnualizedReturn }) =>
        ({ benchmarkScenario, probability, stockAnnualizedReturn, stockTerminalPrice, qqqAnnualizedReturn }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const contract = JSON.stringify({ currentPrice: f.currentPrice, currency: f.currency, scenarios });
      if (contracts.has(key) && contracts.get(key) !== contract)
        throw new Error("Shared company has conflicting same-date QQQ forecasts across sleeves");
      contracts.set(key, contract);
    }
  }
}

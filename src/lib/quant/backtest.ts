import { alignSeries, beta, informationRatio, levelsToReturns, maxDrawdown, summarize, type ReturnPoint } from "@/lib/stats";
import type { DailyBar } from "./prices";

/**
 * Deterministic backtest engine. Two strategy families ship:
 *
 *  1. `basket`  — equal- or custom-weight basket of tickers, rebalanced on a
 *     calendar (none/monthly/quarterly), measured against a benchmark. This is
 *     the "would this pipeline beat QQQ" question.
 *  2. `overlay` — the realised portfolio daily series with a cash/leverage
 *     overlay applied (e.g. 90% invested + 10% cash, or 1.2x), to see what
 *     sizing discipline would have done to Sharpe and drawdown.
 *
 * Inputs are plain arrays so the engine is testable without a database or a
 * network; the runner assembles prices via the PriceProvider.
 */
export type BacktestSpec =
  | {
      strategy: "basket";
      tickers: string[];
      weights?: Record<string, number>; // defaults to equal weight
      benchmark: string;
      from: string;
      to?: string;
      rebalance: "none" | "monthly" | "quarterly";
      costBps?: number;
    }
  | {
      strategy: "overlay";
      exposure: number; // 1 = fully invested, 0.8 = 80%, 1.2 = levered
      cashRate?: number; // annual rate earned on cash / paid on leverage
      from?: string;
      to?: string;
    };

export type EquityPoint = { date: string; strategy: number; benchmark: number };

export type BacktestResult = {
  strategy: string;
  from: string | null;
  to: string | null;
  days: number;
  equity: EquityPoint[];
  stats: {
    strategy: ReturnType<typeof summarize>;
    benchmark: ReturnType<typeof summarize>;
    activeCumulative: number | null;
    beta: number | null;
    trackingError: number | null;
    informationRatio: number | null;
    maxDrawdown: number | null;
  };
  notes: string[];
};

function rebalanceDue(prev: string, cur: string, mode: "none" | "monthly" | "quarterly") {
  if (mode === "none") return false;
  const pm = prev.slice(0, 7);
  const cm = cur.slice(0, 7);
  if (pm === cm) return false;
  if (mode === "monthly") return true;
  const month = Number(cur.slice(5, 7));
  return month === 1 || month === 4 || month === 7 || month === 10;
}

export function runBasketBacktest(
  spec: Extract<BacktestSpec, { strategy: "basket" }>,
  prices: Record<string, DailyBar[]>,
  benchmark: DailyBar[],
): BacktestResult {
  const notes: string[] = [];
  const tickers = spec.tickers.filter((t) => (prices[t]?.length ?? 0) > 1);
  const missing = spec.tickers.filter((t) => !tickers.includes(t));
  if (missing.length) notes.push(`No price history for: ${missing.join(", ")} — excluded.`);
  if (tickers.length === 0) throw new Error("No priced tickers in basket.");

  // Common calendar = benchmark dates where every ticker has a close.
  const closeMaps = new Map(tickers.map((t) => [t, new Map(prices[t]!.map((b) => [b.date, b.close]))]));
  const to = spec.to ?? "9999-12-31";
  const dates = benchmark.map((b) => b.date).filter((d) => d >= spec.from && d <= to && tickers.every((t) => closeMaps.get(t)!.has(d)));
  if (dates.length < 10) throw new Error("Fewer than 10 overlapping trading days; widen the window or check tickers.");

  const targetW = new Map<string, number>();
  const rawWeights = spec.weights ?? {};
  const totalW = tickers.reduce((acc, t) => acc + (rawWeights[t] ?? 1), 0);
  for (const t of tickers) targetW.set(t, (rawWeights[t] ?? 1) / totalW);

  const cost = (spec.costBps ?? 0) / 10_000;
  const holdings = new Map<string, number>(); // dollars per name
  let equity = 100;
  for (const t of tickers) holdings.set(t, equity * targetW.get(t)!);
  const benchMap = new Map(benchmark.map((b) => [b.date, b.close]));
  const bench0 = benchMap.get(dates[0]!)!;
  const points: EquityPoint[] = [{ date: dates[0]!, strategy: 100, benchmark: 100 }];

  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1]!;
    const cur = dates[i]!;
    let total = 0;
    for (const t of tickers) {
      const p0 = closeMaps.get(t)!.get(prev)!;
      const p1 = closeMaps.get(t)!.get(cur)!;
      const v = holdings.get(t)! * (p1 / p0);
      holdings.set(t, v);
      total += v;
    }
    if (rebalanceDue(prev, cur, spec.rebalance)) {
      let turnover = 0;
      for (const t of tickers) {
        const target = total * targetW.get(t)!;
        turnover += Math.abs(target - holdings.get(t)!);
        holdings.set(t, target);
      }
      const fee = turnover * cost;
      total -= fee;
      const scale = total / Array.from(holdings.values()).reduce((a, b) => a + b, 0);
      for (const t of tickers) holdings.set(t, holdings.get(t)! * scale);
    }
    equity = total;
    points.push({ date: cur, strategy: equity, benchmark: (benchMap.get(cur)! / bench0) * 100 });
  }

  return finish("basket", points, notes);
}

export function runOverlayBacktest(spec: Extract<BacktestSpec, { strategy: "overlay" }>, portfolio: ReturnPoint[], benchmarkLevels: DailyBar[]): BacktestResult {
  const notes: string[] = [];
  const benchReturns = levelsToReturns(benchmarkLevels.map((b) => ({ date: b.date, level: b.close })));
  const aligned = alignSeries(portfolio, benchReturns);
  const from = spec.from ?? "0000-01-01";
  const to = spec.to ?? "9999-12-31";
  const dailyCash = (spec.cashRate ?? 0.045) / 252;
  const idx = aligned.dates.map((d, i) => i).filter((i) => aligned.dates[i]! >= from && aligned.dates[i]! <= to);
  if (idx.length < 10) throw new Error("Fewer than 10 aligned days in window.");
  let s = 100;
  let b = 100;
  const points: EquityPoint[] = [];
  for (const i of idx) {
    const r = aligned.a[i]! * spec.exposure + (1 - spec.exposure) * dailyCash;
    s *= 1 + r;
    b *= 1 + aligned.b[i]!;
    points.push({ date: aligned.dates[i]!, strategy: s, benchmark: b });
  }
  notes.push(`Exposure ${spec.exposure}x, cash rate ${((spec.cashRate ?? 0.045) * 100).toFixed(1)}% on the un-invested remainder.`);
  return finish("overlay", points, notes);
}

function finish(strategy: string, points: EquityPoint[], notes: string[]): BacktestResult {
  const stratRet = levelsToReturns(points.map((p) => ({ date: p.date, level: p.strategy })));
  const benchRet = levelsToReturns(points.map((p) => ({ date: p.date, level: p.benchmark })));
  const s = summarize(stratRet);
  const bsum = summarize(benchRet);
  const ir = informationRatio(stratRet.map((p) => p.r), benchRet.map((p) => p.r));
  return {
    strategy,
    from: points[0]?.date ?? null,
    to: points[points.length - 1]?.date ?? null,
    days: points.length,
    equity: points,
    stats: {
      strategy: s,
      benchmark: bsum,
      activeCumulative: s.cumulative !== null && bsum.cumulative !== null ? s.cumulative - bsum.cumulative : null,
      beta: beta(stratRet.map((p) => p.r), benchRet.map((p) => p.r)),
      trackingError: ir.trackingError,
      informationRatio: ir.informationRatio,
      maxDrawdown: maxDrawdown(stratRet.map((p) => p.r))?.maxDrawdown ?? null,
    },
    notes,
  };
}

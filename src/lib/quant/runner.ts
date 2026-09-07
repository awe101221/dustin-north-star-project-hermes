import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPerformancePoints } from "@/lib/db/portfolio";
import { getUniverse } from "@/lib/db/quant";
import type { QuantJobRow } from "@/lib/db/types";
import { priceProvider } from "@/lib/env";
import { runBasketBacktest, runOverlayBacktest, type BacktestSpec } from "./backtest";
import { getPriceProvider } from "./prices";
import { runScreen, summarizeScreen, type ScreenSpec } from "./screener";

/**
 * Executes a hermes_quant_jobs row and persists the result. Screens run
 * against the live memo universe; backtests fetch daily closes through the
 * configured provider. Agents can also mark jobs done themselves via the
 * agent API when they run heavier research off-platform.
 */
export async function runQuantJob(db: SupabaseClient, job: QuantJobRow): Promise<QuantJobRow> {
  const started = new Date().toISOString();
  await db.from("hermes_quant_jobs").update({ status: "running", started_at: started, error: null }).eq("id", job.id);
  try {
    let result: Record<string, unknown>;
    let summary: string;
    if (job.kind === "screen") {
      const universe = await getUniverse(db);
      const rows = runScreen(universe, job.spec as ScreenSpec);
      const s = summarizeScreen(rows);
      result = {
        summary: s,
        rows: rows.slice(0, 200).map((r) => ({
          ticker: r.ticker,
          company: r.companyName,
          persona: r.persona,
          verdict: r.verdict,
          expectedIrr: r.expectedIrr,
          mos: r.mos,
          downside: r.downside,
          quote: r.quotePrice,
          buyPrice: r.buyPrice,
          distanceToBuy: r.distanceToBuy,
          heldWeight: r.heldWeight,
          memoId: r.memoId,
        })),
      };
      summary = `${s.count} names (${s.held} held), median IRR ${s.medianIrr !== null ? (s.medianIrr * 100).toFixed(1) + "%" : "—"}`;
    } else if (job.kind === "backtest") {
      const spec = job.spec as BacktestSpec;
      const provider = getPriceProvider(priceProvider());
      if (spec.strategy === "basket") {
        const bench = await provider.daily(spec.benchmark, spec.from);
        const prices: Record<string, import("./prices").DailyBar[]> = {};
        await Promise.all(
          spec.tickers.map(async (t) => {
            try {
              prices[t] = await provider.daily(t, spec.from);
            } catch {
              prices[t] = [];
            }
          }),
        );
        const bt = runBasketBacktest(spec, prices, bench);
        result = { ...bt, equity: thin(bt.equity, 400) };
        summary = `${(bt.stats.strategy.cumulative! * 100).toFixed(1)}% vs ${(bt.stats.benchmark.cumulative! * 100).toFixed(1)}% ${spec.benchmark} · Sharpe ${bt.stats.strategy.sharpe?.toFixed(2) ?? "—"} · MaxDD ${((bt.stats.maxDrawdown ?? 0) * 100).toFixed(1)}%`;
      } else {
        const perf = await getPerformancePoints(db, spec.from);
        const portfolio = perf.filter((p) => p.series === "portfolio" && p.dailyReturn !== null).map((p) => ({ date: p.date, r: p.dailyReturn! }));
        const benchLevels = perf.filter((p) => p.series === "benchmark" && p.indexValue !== null).map((p) => ({ date: p.date, close: p.indexValue! }));
        if (portfolio.length < 10) throw new Error("No daily portfolio series in hermes_performance_points — run `npm run migrate:performance` first.");
        const bt = runOverlayBacktest(spec, portfolio, benchLevels);
        result = { ...bt, equity: thin(bt.equity, 400) };
        summary = `${(bt.stats.strategy.cumulative! * 100).toFixed(1)}% vs QQQ ${(bt.stats.benchmark.cumulative! * 100).toFixed(1)}% · Sharpe ${bt.stats.strategy.sharpe?.toFixed(2) ?? "—"} · MaxDD ${((bt.stats.maxDrawdown ?? 0) * 100).toFixed(1)}%`;
      }
    } else {
      throw new Error(`Hermes has no built-in runner for kind=${job.kind}; an agent must complete it via /api/agent/quant-jobs.`);
    }
    const finished = new Date().toISOString();
    const saved = await db.from("hermes_quant_jobs").update({ status: "done", result, result_summary: summary, run_by: "hermes_engine", finished_at: finished }).eq("id", job.id).select("*").limit(1);
    return (saved.data?.[0] as QuantJobRow) ?? { ...job, status: "done", result, result_summary: summary };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const saved = await db.from("hermes_quant_jobs").update({ status: "error", error: message, finished_at: new Date().toISOString() }).eq("id", job.id).select("*").limit(1);
    return (saved.data?.[0] as QuantJobRow) ?? { ...job, status: "error", error: message };
  }
}

function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[Math.floor(i)]!);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]!);
  return out;
}

import { describe, expect, it } from "vitest";
import { runBasketBacktest, runOverlayBacktest } from "./backtest";
import type { DailyBar } from "./prices";

function series(start: number, dailyRet: number, days: number, from = new Date("2026-01-01")): DailyBar[] {
  const out: DailyBar[] = [];
  let px = start;
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    out.push({ date: d.toISOString().slice(0, 10), close: px });
    px *= 1 + dailyRet;
  }
  return out;
}

describe("basket backtest", () => {
  it("tracks a single ticker exactly with no rebalance", () => {
    const a = series(100, 0.01, 30);
    const bench = series(50, 0.005, 30);
    const res = runBasketBacktest({ strategy: "basket", tickers: ["A"], benchmark: "B", from: "2026-01-01", rebalance: "none" }, { A: a }, bench);
    expect(res.days).toBe(30);
    const last = res.equity[res.equity.length - 1]!;
    expect(last.strategy).toBeCloseTo((a[29]!.close / a[0]!.close) * 100, 6);
    expect(last.benchmark).toBeCloseTo((bench[29]!.close / bench[0]!.close) * 100, 6);
    expect(res.stats.activeCumulative!).toBeGreaterThan(0);
  });

  it("equal-weights two tickers and rebalances monthly", () => {
    const a = series(100, 0.02, 70);
    const b = series(100, 0.0, 70);
    const bench = series(100, 0.01, 70);
    const none = runBasketBacktest({ strategy: "basket", tickers: ["A", "B"], benchmark: "X", from: "2026-01-01", rebalance: "none" }, { A: a, B: b }, bench);
    const monthly = runBasketBacktest({ strategy: "basket", tickers: ["A", "B"], benchmark: "X", from: "2026-01-01", rebalance: "monthly" }, { A: a, B: b }, bench);
    // Rebalancing out of the winner into the flat name lowers terminal wealth here.
    expect(monthly.equity[monthly.equity.length - 1]!.strategy).toBeLessThan(none.equity[none.equity.length - 1]!.strategy);
    expect(monthly.notes).toEqual([]);
  });

  it("excludes tickers without prices and throws when none remain", () => {
    const bench = series(100, 0.01, 20);
    expect(() => runBasketBacktest({ strategy: "basket", tickers: ["ZZZ"], benchmark: "X", from: "2026-01-01", rebalance: "none" }, {}, bench)).toThrow(/No priced tickers/);
  });
});

describe("overlay backtest", () => {
  it("scales returns by exposure", () => {
    // Varying returns so variance is non-zero and beta is defined.
    const bench: DailyBar[] = [];
    let px = 100;
    for (let i = 0; i < 40; i++) {
      const d = new Date(new Date("2026-01-01").getTime() + i * 86400000);
      bench.push({ date: d.toISOString().slice(0, 10), close: px });
      px *= 1 + (i % 3 === 0 ? 0.02 : i % 3 === 1 ? -0.01 : 0.005);
    }
    const port = bench.slice(1).map((b, i) => ({ date: b.date, r: bench[i + 1]!.close / bench[i]!.close - 1 }));
    const full = runOverlayBacktest({ strategy: "overlay", exposure: 1, cashRate: 0 }, port, bench);
    const half = runOverlayBacktest({ strategy: "overlay", exposure: 0.5, cashRate: 0 }, port, bench);
    expect(full.stats.beta!).toBeCloseTo(1, 6);
    expect(half.stats.beta!).toBeCloseTo(0.5, 6);
    expect(half.stats.strategy.vol!).toBeCloseTo(full.stats.strategy.vol! / 2, 6);
  });
});

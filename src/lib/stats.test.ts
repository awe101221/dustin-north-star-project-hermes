import { describe, expect, it } from "vitest";
import {
  alignSeries,
  annualizedReturn,
  beta,
  cumulativeReturn,
  hitRate,
  informationRatio,
  levelsToReturns,
  maxDrawdown,
  rebase,
  rolling,
  sharpe,
  sortino,
  summarize,
} from "./stats";

describe("stats", () => {
  it("compounds cumulative return", () => {
    expect(cumulativeReturn([0.1, -0.05])).toBeCloseTo(1.1 * 0.95 - 1, 10);
    expect(cumulativeReturn([])).toBe(0);
  });

  it("annualizes a daily series", () => {
    const daily = Array.from({ length: 252 }, () => 0.0005);
    const ann = annualizedReturn(daily)!;
    expect(ann).toBeCloseTo(Math.pow(1.0005, 252) - 1, 10);
  });

  it("returns null for degenerate sharpe/sortino", () => {
    expect(sharpe([0.01])).toBeNull();
    expect(sharpe([0.01, 0.01, 0.01])).toBeNull(); // zero stdev
    expect(sortino([0.01, 0.02, 0.03])).toBeNull(); // no downside
  });

  it("sortino penalizes downside only", () => {
    const mixed = [0.02, -0.01, 0.015, -0.02, 0.01];
    expect(sortino(mixed)).not.toBeNull();
    expect(sortino(mixed)!).toBeGreaterThan(sharpe(mixed)!);
  });

  it("finds max drawdown peak/trough", () => {
    const dd = maxDrawdown([0.1, -0.2, 0.05, -0.1, 0.3])!;
    // equity: 1.1, 0.88, 0.924, 0.8316, 1.081 → peak 1.1 (idx0), trough 0.8316 (idx3)
    expect(dd.peakIndex).toBe(0);
    expect(dd.troughIndex).toBe(3);
    expect(dd.maxDrawdown).toBeCloseTo(0.8316 / 1.1 - 1, 6);
  });

  it("computes beta of a leveraged clone as ~2", () => {
    const bench = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02];
    const port = bench.map((r) => r * 2);
    expect(beta(port, bench)!).toBeCloseTo(2, 10);
  });

  it("information ratio is null when tracking error is zero", () => {
    const b = [0.01, 0.02, -0.01];
    expect(informationRatio(b, b).informationRatio).toBeNull();
  });

  it("hit rate counts outperforming periods", () => {
    expect(hitRate([0.02, 0.01, -0.01], [0.01, 0.02, -0.02])).toBeCloseTo(2 / 3, 10);
  });

  it("levels → returns and rebase", () => {
    const levels = [
      { date: "2026-01-01", level: 100 },
      { date: "2026-01-02", level: 110 },
      { date: "2026-01-03", level: 99 },
    ];
    const r = levelsToReturns(levels);
    expect(r).toHaveLength(2);
    expect(r[0]!.r).toBeCloseTo(0.1, 10);
    expect(r[1]!.r).toBeCloseTo(-0.1, 10);
    expect(rebase([{ date: "a", level: 50 }, { date: "b", level: 75 }]).map((l) => l.level)).toEqual([100, 150]);
  });

  it("aligns series on shared dates", () => {
    const a = [{ date: "d1", r: 0.1 }, { date: "d2", r: 0.2 }, { date: "d3", r: 0.3 }];
    const b = [{ date: "d2", r: 0.02 }, { date: "d3", r: 0.03 }, { date: "d4", r: 0.04 }];
    const aligned = alignSeries(a, b);
    expect(aligned.dates).toEqual(["d2", "d3"]);
    expect(aligned.a).toEqual([0.2, 0.3]);
    expect(aligned.b).toEqual([0.02, 0.03]);
  });

  it("rolling emits nulls until the window fills", () => {
    const pts = [1, 2, 3, 4].map((n) => ({ date: `d${n}`, r: n / 100 }));
    const out = rolling(pts, 3, (v) => v.length);
    expect(out.map((o) => o.value)).toEqual([null, null, 3, 3]);
  });

  it("summarize handles empty input", () => {
    const s = summarize([]);
    expect(s.observations).toBe(0);
    expect(s.sharpe).toBeNull();
    expect(s.maxDrawdown).toBeNull();
  });
});

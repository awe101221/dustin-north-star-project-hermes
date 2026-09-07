/**
 * Portfolio statistics on daily (or irregular) return series.
 *
 * Conventions: returns are decimal ratios (0.012 = 1.2%). Annualization uses
 * 252 trading days for daily series. Every function tolerates short series and
 * returns null instead of NaN so the UI can render "—".
 */

export type ReturnPoint = { date: string; r: number };

const TRADING_DAYS = 252;

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[], sample = true): number | null {
  const n = values.length;
  if (n < (sample ? 2 : 1)) return null;
  const m = mean(values)!;
  const ss = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(ss / (sample ? n - 1 : n));
}

export function downsideDeviation(values: number[], mar = 0): number | null {
  if (values.length < 2) return null;
  const downs = values.map((v) => Math.min(0, v - mar));
  const ss = downs.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(ss / values.length);
}

export function cumulativeReturn(values: number[]): number {
  return values.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

export function annualizedReturn(values: number[], periodsPerYear = TRADING_DAYS): number | null {
  if (values.length === 0) return null;
  const total = cumulativeReturn(values);
  const years = values.length / periodsPerYear;
  if (years <= 0) return null;
  return Math.pow(1 + total, 1 / years) - 1;
}

export function annualizedVol(values: number[], periodsPerYear = TRADING_DAYS): number | null {
  const sd = stdev(values);
  return sd === null ? null : sd * Math.sqrt(periodsPerYear);
}

/** Sharpe with a per-period risk-free rate (annual rf / periodsPerYear). */
export function sharpe(values: number[], annualRf = 0, periodsPerYear = TRADING_DAYS): number | null {
  if (values.length < 2) return null;
  const rfp = annualRf / periodsPerYear;
  const excess = values.map((v) => v - rfp);
  const m = mean(excess)!;
  const sd = stdev(excess);
  if (sd === null || sd === 0) return null;
  return (m / sd) * Math.sqrt(periodsPerYear);
}

export function sortino(values: number[], annualRf = 0, periodsPerYear = TRADING_DAYS): number | null {
  if (values.length < 2) return null;
  const rfp = annualRf / periodsPerYear;
  const excess = values.map((v) => v - rfp);
  const m = mean(excess)!;
  const dd = downsideDeviation(excess, 0);
  if (dd === null || dd === 0) return null;
  return (m / dd) * Math.sqrt(periodsPerYear);
}

export function maxDrawdown(values: number[]): { maxDrawdown: number; peakIndex: number; troughIndex: number } | null {
  if (values.length === 0) return null;
  let equity = 1;
  let peak = 1;
  let peakIndex = 0;
  let worst = 0;
  let worstPeak = 0;
  let worstTrough = 0;
  values.forEach((r, i) => {
    equity *= 1 + r;
    if (equity > peak) {
      peak = equity;
      peakIndex = i;
    }
    const dd = equity / peak - 1;
    if (dd < worst) {
      worst = dd;
      worstPeak = peakIndex;
      worstTrough = i;
    }
  });
  return { maxDrawdown: worst, peakIndex: worstPeak, troughIndex: worstTrough };
}

/** OLS beta of portfolio vs benchmark (aligned arrays). */
export function beta(port: number[], bench: number[]): number | null {
  const n = Math.min(port.length, bench.length);
  if (n < 3) return null;
  const p = port.slice(0, n);
  const b = bench.slice(0, n);
  const mp = mean(p)!;
  const mb = mean(b)!;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (p[i]! - mp) * (b[i]! - mb);
    varB += (b[i]! - mb) ** 2;
  }
  if (varB === 0) return null;
  return cov / varB;
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a.slice(0, n))!;
  const mb = mean(b.slice(0, n))!;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/** Tracking error and information ratio of active returns (port - bench). */
export function informationRatio(port: number[], bench: number[], periodsPerYear = TRADING_DAYS): { trackingError: number | null; informationRatio: number | null } {
  const n = Math.min(port.length, bench.length);
  if (n < 2) return { trackingError: null, informationRatio: null };
  const active = Array.from({ length: n }, (_, i) => port[i]! - bench[i]!);
  const te = stdev(active);
  if (te === null || te === 0) return { trackingError: te === null ? null : 0, informationRatio: null };
  const m = mean(active)!;
  return { trackingError: te * Math.sqrt(periodsPerYear), informationRatio: (m / te) * Math.sqrt(periodsPerYear) };
}

export function hitRate(port: number[], bench: number[]): number | null {
  const n = Math.min(port.length, bench.length);
  if (n === 0) return null;
  let wins = 0;
  for (let i = 0; i < n; i++) if (port[i]! > bench[i]!) wins++;
  return wins / n;
}

/** Rolling metric over a window of N observations; emits one point per date. */
export function rolling<T>(points: ReturnPoint[], window: number, fn: (values: number[]) => T | null): Array<{ date: string; value: T | null }> {
  const out: Array<{ date: string; value: T | null }> = [];
  for (let i = 0; i < points.length; i++) {
    if (i + 1 < window) {
      out.push({ date: points[i]!.date, value: null });
      continue;
    }
    const slice = points.slice(i + 1 - window, i + 1).map((p) => p.r);
    out.push({ date: points[i]!.date, value: fn(slice) });
  }
  return out;
}

/** Convert an index/NAV level series into period returns. */
export function levelsToReturns(levels: Array<{ date: string; level: number }>): ReturnPoint[] {
  const out: ReturnPoint[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1]!.level;
    const cur = levels[i]!.level;
    if (prev > 0 && Number.isFinite(cur)) out.push({ date: levels[i]!.date, r: cur / prev - 1 });
  }
  return out;
}

/** Align two dated return series on common dates. */
export function alignSeries(a: ReturnPoint[], b: ReturnPoint[]): { dates: string[]; a: number[]; b: number[] } {
  const mapB = new Map(b.map((p) => [p.date, p.r]));
  const dates: string[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  for (const p of a) {
    const rb = mapB.get(p.date);
    if (rb !== undefined) {
      dates.push(p.date);
      av.push(p.r);
      bv.push(rb);
    }
  }
  return { dates, a: av, b: bv };
}

/** Rebase a level series to 100 at the first observation. */
export function rebase(levels: Array<{ date: string; level: number }>, base = 100) {
  const first = levels.find((l) => l.level > 0)?.level;
  if (!first) return levels.map((l) => ({ ...l, level: base }));
  return levels.map((l) => ({ date: l.date, level: (l.level / first) * base }));
}

export type SeriesSummary = {
  observations: number;
  from: string | null;
  to: string | null;
  cumulative: number | null;
  annualized: number | null;
  vol: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  bestDay: number | null;
  worstDay: number | null;
  positiveDays: number | null;
};

export function summarize(points: ReturnPoint[], annualRf = 0, periodsPerYear = TRADING_DAYS): SeriesSummary {
  const values = points.map((p) => p.r);
  const dd = maxDrawdown(values);
  return {
    observations: values.length,
    from: points[0]?.date ?? null,
    to: points[points.length - 1]?.date ?? null,
    cumulative: values.length ? cumulativeReturn(values) : null,
    annualized: annualizedReturn(values, periodsPerYear),
    vol: annualizedVol(values, periodsPerYear),
    sharpe: sharpe(values, annualRf, periodsPerYear),
    sortino: sortino(values, annualRf, periodsPerYear),
    maxDrawdown: dd?.maxDrawdown ?? null,
    bestDay: values.length ? Math.max(...values) : null,
    worstDay: values.length ? Math.min(...values) : null,
    positiveDays: values.length ? values.filter((v) => v > 0).length / values.length : null,
  };
}

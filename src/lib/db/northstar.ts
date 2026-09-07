import { toArray, toRecord } from "@/lib/utils";
import { alignSeries, beta, correlation, hitRate, informationRatio, summarize, type ReturnPoint, type SeriesSummary } from "@/lib/stats";
import { getAnnualReturns, getBenchmarkSeries, getNavHistory, getPerformancePoints, type AnnualReturn, type BenchmarkPoint, type NavPoint } from "./portfolio";
import { QQQ_PRIOR_YEAR_CLOSE } from "./hub";
import { num, unwrap, type Db } from "./query";
import type { MandateKpi, MandateRow, MandateRule, MandateSleeve } from "./types";

export type Mandate = {
  id: string;
  version: number;
  title: string;
  mission: string;
  benchmark: string;
  horizonYears: number;
  hurdleIrr: number;
  rules: MandateRule[];
  kpis: MandateKpi[];
  sleeves: MandateSleeve[];
  guardrails: MandateRule[];
  metadata: Record<string, unknown>;
  updatedAt: string | null;
};

/** Source-controlled default so the North Star renders before the seed runs. */
export const DEFAULT_MANDATE: Mandate = {
  id: "north-star",
  version: 0,
  title: "North Star Project Hermes",
  mission: "Beat QQQ over 10 years — compound capital above the Nasdaq-100 benchmark, after fees and taxes, without risks that can permanently impair the mission.",
  benchmark: "QQQ",
  horizonYears: 10,
  hurdleIrr: 0.15,
  rules: [
    { id: "hurdle", title: "15% expected IRR hurdle on every new underwrite", kind: "gate" },
    { id: "qqq-alt", title: "Every position must state why it beats QQQ and what makes QQQ the better hold", kind: "gate" },
    { id: "falsifier", title: "No thesis without a falsifier and a re-underwrite trigger", kind: "gate" },
    { id: "human", title: "Dustin has final authority on sizing, trades and broker actions", kind: "process" },
  ],
  kpis: [
    { id: "ytd-alpha", label: "YTD TWR vs QQQ", target: "> 0pp" },
    { id: "rolling-sharpe", label: "Rolling 60d Sharpe", target: "> 1.0" },
    { id: "hit-rate", label: "Decision hit rate vs QQQ", target: "> 55%" },
  ],
  sleeves: [{ id: "ibkr-core", name: "IBKR Core", role: "Main compounding book", benchmark: "QQQ" }],
  guardrails: [{ id: "no-orders", title: "Hermes never places orders; it researches, proposes and tracks", kind: "limit" }],
  metadata: {},
  updatedAt: null,
};

export function mapMandate(r: MandateRow): Mandate {
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    mission: r.mission,
    benchmark: r.benchmark_symbol,
    horizonYears: r.horizon_years,
    hurdleIrr: num(r.hurdle_irr) ?? 0.15,
    rules: toArray(r.rules).map((x) => toRecord(x) as unknown as MandateRule),
    kpis: toArray(r.kpis).map((x) => toRecord(x) as unknown as MandateKpi),
    sleeves: toArray(r.sleeves).map((x) => toRecord(x) as unknown as MandateSleeve),
    guardrails: toArray(r.guardrails).map((x) => toRecord(x) as unknown as MandateRule),
    metadata: toRecord(r.metadata),
    updatedAt: r.updated_at,
  };
}

export async function getMandate(db: Db): Promise<Mandate> {
  const rows = unwrap(await db.from("hermes_mandate").select("*").eq("id", "north-star").limit(1), "mandate") as MandateRow[];
  return rows[0] ? mapMandate(rows[0]) : DEFAULT_MANDATE;
}

// ── Stats assembly ──────────────────────────────────────────────────────────

export type NorthStarStats = {
  asOf: string | null;
  nav: number | null;
  ytdTwr: number | null;
  qqqYtd: number | null;
  ytdAlphaPp: number | null;
  cumulativeAlpha: number | null;
  sinceDate: string | null;
  portfolioIndex: number | null;
  qqqIndex: number | null;
  annual: AnnualReturn[];
  daily: {
    available: boolean;
    from: string | null;
    to: string | null;
    portfolio: SeriesSummary | null;
    benchmark: SeriesSummary | null;
    beta: number | null;
    correlation: number | null;
    trackingError: number | null;
    informationRatio: number | null;
    hitRate: number | null;
    rolling: Array<{ date: string; sharpe60: number | null; sortino60: number | null; sharpe120: number | null; sortino120: number | null; alpha60: number | null }>;
    curve: Array<{ date: string; portfolio: number; benchmark: number }>;
  };
  benchmarkSeries: BenchmarkPoint[];
  navHistory: NavPoint[];
};

function rollingWindow(points: ReturnPoint[], window: number, fn: (v: number[]) => number | null) {
  const out: Array<number | null> = [];
  for (let i = 0; i < points.length; i++) {
    if (i + 1 < window) {
      out.push(null);
      continue;
    }
    out.push(fn(points.slice(i + 1 - window, i + 1).map((p) => p.r)));
  }
  return out;
}

export async function getNorthStarStats(db: Db): Promise<NorthStarStats> {
  const [benchmark, nav, annual, perf] = await Promise.all([getBenchmarkSeries(db), getNavHistory(db), getAnnualReturns(db), getPerformancePoints(db)]);

  const latestBench = benchmark[benchmark.length - 1] ?? null;
  const latestNav = nav[nav.length - 1] ?? null;
  const firstBench = benchmark[0] ?? null;

  // QQQ YTD: daily benchmark series when imported, else adjusted close vs the
  // prior year-end close recorded with the annual returns.
  const year = (latestBench?.date ?? latestNav?.date ?? new Date().toISOString()).slice(0, 4);
  let qqqYtd: number | null = null;
  const portfolioBench = perf.filter((p) => p.series === "benchmark");
  const latestBenchPerf = [...portfolioBench].reverse().find((p) => p.ytdReturn !== null);
  const priorClose = QQQ_PRIOR_YEAR_CLOSE[year] ?? null;
  if (latestBenchPerf?.ytdReturn !== null && latestBenchPerf?.ytdReturn !== undefined) {
    qqqYtd = latestBenchPerf.ytdReturn;
  } else if (priorClose && latestBench?.qqqClose) {
    qqqYtd = latestBench.qqqClose / priorClose - 1;
  }
  const ytdTwr = latestNav?.ytdTwr ?? null;

  // Daily series (imported from the reference DB; empty until migrate:performance runs)
  const portPts: ReturnPoint[] = perf.filter((p) => p.series === "portfolio" && p.dailyReturn !== null).map((p) => ({ date: p.date, r: p.dailyReturn! }));
  const benchLevels = portfolioBench.filter((p) => p.indexValue !== null).map((p) => ({ date: p.date, level: p.indexValue! }));
  const benchPts: ReturnPoint[] = [];
  for (let i = 1; i < benchLevels.length; i++) {
    const prev = benchLevels[i - 1]!;
    const cur = benchLevels[i]!;
    if (prev.level > 0) benchPts.push({ date: cur.date, r: cur.level / prev.level - 1 });
  }
  const aligned = alignSeries(portPts, benchPts);
  const alignedPort: ReturnPoint[] = aligned.dates.map((d, i) => ({ date: d, r: aligned.a[i]! }));
  const alignedBench: ReturnPoint[] = aligned.dates.map((d, i) => ({ date: d, r: aligned.b[i]! }));
  const activePts: ReturnPoint[] = aligned.dates.map((d, i) => ({ date: d, r: aligned.a[i]! - aligned.b[i]! }));

  const sharpe60 = rollingWindow(alignedPort, 60, (v) => summarize(v.map((r, i) => ({ date: String(i), r }))).sharpe);
  const sortino60 = rollingWindow(alignedPort, 60, (v) => summarize(v.map((r, i) => ({ date: String(i), r }))).sortino);
  const sharpe120 = rollingWindow(alignedPort, 120, (v) => summarize(v.map((r, i) => ({ date: String(i), r }))).sharpe);
  const sortino120 = rollingWindow(alignedPort, 120, (v) => summarize(v.map((r, i) => ({ date: String(i), r }))).sortino);
  const alpha60 = rollingWindow(activePts, 60, (v) => v.reduce((acc, r) => acc * (1 + r), 1) - 1);

  let pl = 100;
  let bl = 100;
  const curve = aligned.dates.map((d, i) => {
    pl *= 1 + aligned.a[i]!;
    bl *= 1 + aligned.b[i]!;
    return { date: d, portfolio: pl, benchmark: bl };
  });

  const ir = informationRatio(aligned.a, aligned.b);

  return {
    asOf: latestBench?.date ?? latestNav?.date ?? null,
    nav: latestNav?.nav ?? latestBench?.nav ?? null,
    ytdTwr,
    qqqYtd,
    ytdAlphaPp: ytdTwr !== null && qqqYtd !== null ? (ytdTwr - qqqYtd) * 100 : null,
    cumulativeAlpha: latestBench?.cumulativeAlpha ?? null,
    sinceDate: firstBench?.date ?? null,
    portfolioIndex: latestBench?.portfolioIndex ?? null,
    qqqIndex: latestBench?.qqqIndex ?? null,
    annual,
    daily: {
      available: aligned.dates.length >= 20,
      from: aligned.dates[0] ?? null,
      to: aligned.dates[aligned.dates.length - 1] ?? null,
      portfolio: alignedPort.length ? summarize(alignedPort) : null,
      benchmark: alignedBench.length ? summarize(alignedBench) : null,
      beta: beta(aligned.a, aligned.b),
      correlation: correlation(aligned.a, aligned.b),
      trackingError: ir.trackingError,
      informationRatio: ir.informationRatio,
      hitRate: hitRate(aligned.a, aligned.b),
      rolling: aligned.dates.map((date, i) => ({ date, sharpe60: sharpe60[i] ?? null, sortino60: sortino60[i] ?? null, sharpe120: sharpe120[i] ?? null, sortino120: sortino120[i] ?? null, alpha60: alpha60[i] ?? null })),
      curve,
    },
    benchmarkSeries: benchmark,
    navHistory: nav,
  };
}

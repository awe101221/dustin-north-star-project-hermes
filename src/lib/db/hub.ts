import { sum } from "@/lib/utils";
import {
  bucketExposure,
  computeAttribution,
  getAnnualReturns,
  getBenchmarkSeries,
  getDecisionScorecard,
  getLatestDigest,
  getLatestOptions,
  getLatestPositions,
  getNavHistory,
  getOpenRecommendations,
  getPerformancePoints,
  getRecentAlerts,
  getSleeves,
  getTrades,
  type Alert,
  type AnnualReturn,
  type Attribution,
  type Decision,
  type ExposureBucket,
  type OptionPosition,
  type Position,
  type Recommendation,
  type Sleeve,
  type Trade,
} from "./portfolio";
import type { Db } from "./query";
import type { MasterDigestRow } from "./types";

/**
 * QQQ adjusted close on the last trading day of the prior year. Used only as
 * the YTD anchor when the daily benchmark series has not been imported yet;
 * the value is the one recorded in portfolio_annual_returns.notes for 2025.
 */
export const QQQ_PRIOR_YEAR_CLOSE: Record<string, number> = { "2026": 612.8629 };

export type YtdPoint = { date: string; portfolio: number | null; qqq: number | null };

export type PortfolioHub = {
  asOf: string | null;
  nav: number | null;
  cash: number | null;
  ytdTwr: number | null;
  qqqYtd: number | null;
  ytdAlphaPp: number | null;
  cumulativeAlpha: number | null;
  alphaSince: string | null;
  unrealized: number;
  marketValue: number;
  positions: Position[];
  options: OptionPosition[];
  optionsMv: number;
  exposures: { sector: ExposureBucket[]; currency: ExposureBucket[]; country: ExposureBucket[] };
  concentration: { top5: number; top10: number; top20: number; count: number };
  attribution: Attribution[];
  startingNav: number | null;
  ytdSeries: YtdPoint[];
  seriesSource: "daily" | "statements";
  annual: AnnualReturn[];
  sleeves: Sleeve[];
  recommendations: Recommendation[];
  alerts: Alert[];
  digest: MasterDigestRow | null;
  trades: Trade[];
  decisions: { total: number; graded: number; hits: number; hitRate: number | null; avgAlphaPp: number | null; recent: Decision[] };
};

export async function getPortfolioHub(db: Db): Promise<PortfolioHub> {
  const [positions, options, nav, bench, annual, sleeves, recommendations, alerts, digest, trades, decisions, perf] = await Promise.all([
    getLatestPositions(db),
    getLatestOptions(db),
    getNavHistory(db),
    getBenchmarkSeries(db),
    getAnnualReturns(db),
    getSleeves(db),
    getOpenRecommendations(db),
    getRecentAlerts(db, 40),
    getLatestDigest(db),
    getTrades(db, { limit: 60 }),
    getDecisionScorecard(db),
    getPerformancePoints(db),
  ]);

  const latestNav = nav[nav.length - 1] ?? null;
  const latestBench = bench[bench.length - 1] ?? null;
  const year = (latestNav?.date ?? latestBench?.date ?? new Date().toISOString()).slice(0, 4);
  const priorClose = QQQ_PRIOR_YEAR_CLOSE[year] ?? null;

  // YTD series: daily (imported) when present, else statement snapshots.
  const dailyPort = perf.filter((p) => p.series === "portfolio" && p.ytdReturn !== null && p.date.startsWith(year));
  const dailyBench = new Map(perf.filter((p) => p.series === "benchmark" && p.ytdReturn !== null).map((p) => [p.date, p.ytdReturn!]));
  let ytdSeries: YtdPoint[];
  let seriesSource: PortfolioHub["seriesSource"];
  if (dailyPort.length >= 20) {
    seriesSource = "daily";
    ytdSeries = dailyPort.map((p) => ({ date: p.date, portfolio: p.ytdReturn, qqq: dailyBench.get(p.date) ?? null }));
  } else {
    seriesSource = "statements";
    const benchByDate = new Map(bench.map((b) => [b.date, b]));
    ytdSeries = nav
      .filter((n) => n.date.startsWith(year) && n.ytdTwr !== null)
      .map((n) => {
        const b = benchByDate.get(n.date);
        return { date: n.date, portfolio: n.ytdTwr, qqq: b?.qqqClose && priorClose ? b.qqqClose / priorClose - 1 : null };
      });
  }

  const latestDailyBench = [...dailyBench.entries()].sort((a, b) => a[0].localeCompare(b[0])).pop();
  const qqqYtd = latestDailyBench?.[1] ?? (latestBench?.qqqClose && priorClose ? latestBench.qqqClose / priorClose - 1 : null);
  const ytdTwr = latestNav?.ytdTwr ?? null;

  const marketValue = sum(positions.map((p) => p.marketValue));
  const navValue = latestNav?.nav ?? latestBench?.nav ?? marketValue;
  const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue);
  const weightOf = (n: number) => sum(sorted.slice(0, n).map((p) => p.weight));
  const startingNav = annual.find((a) => a.year === Number(year) - 1)?.endingNav ?? nav.find((n) => n.date === `${year}-01-01`)?.nav ?? null;

  const graded = decisions.filter((d) => d.alpha !== null);
  const hits = graded.filter((d) => (d.alpha ?? 0) > 0).length;

  return {
    asOf: latestNav?.date ?? latestBench?.date ?? positions[0]?.reportDate ?? null,
    nav: navValue,
    cash: latestNav?.cash ?? null,
    ytdTwr,
    qqqYtd,
    ytdAlphaPp: ytdTwr !== null && qqqYtd !== null ? (ytdTwr - qqqYtd) * 100 : null,
    cumulativeAlpha: latestBench?.cumulativeAlpha ?? null,
    alphaSince: bench[0]?.date ?? null,
    unrealized: sum(positions.map((p) => p.unrealizedPnl)),
    marketValue,
    positions: sorted,
    options,
    optionsMv: sum(options.map((o) => o.marketValue)),
    exposures: {
      sector: bucketExposure(positions, (p) => p.sector, navValue),
      currency: bucketExposure(positions, (p) => p.currency, navValue, "USD"),
      country: bucketExposure(positions, (p) => p.country, navValue),
    },
    concentration: { top5: weightOf(5), top10: weightOf(10), top20: weightOf(20), count: positions.length },
    attribution: startingNav ? computeAttribution(positions, startingNav) : computeAttribution(positions, navValue),
    startingNav,
    ytdSeries,
    seriesSource,
    annual,
    sleeves,
    recommendations,
    alerts,
    digest,
    trades,
    decisions: {
      total: decisions.length,
      graded: graded.length,
      hits,
      hitRate: graded.length ? hits / graded.length : null,
      avgAlphaPp: graded.length ? (sum(graded.map((d) => d.alpha)) / graded.length) * 100 : null,
      recent: decisions.slice(0, 12),
    },
  };
}

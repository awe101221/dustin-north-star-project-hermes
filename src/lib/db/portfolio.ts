import { bareSymbol, groupBy, sum } from "@/lib/utils";
import { num, selectAll, unwrap, type Db } from "./query";
import type {
  AnnualReturnRow,
  BenchmarkSeriesRow,
  DecisionScorecardRow,
  MasterAlertRow,
  MasterDigestRow,
  MasterRecommendationRow,
  NavHistoryRow,
  OptionPositionRow,
  PerformancePointRow,
  PositionRow,
  SleeveLedgerRow,
  SleeveNavRow,
  SleeveRecommendationRow,
  SleeveRow,
  TradeRow,
} from "./types";

// ── Positions ───────────────────────────────────────────────────────────────

export type Position = {
  id: string;
  symbol: string;
  ticker: string | null;
  companyName: string;
  currency: string;
  quantity: number;
  costPrice: number | null;
  closePrice: number | null;
  costBasis: number;
  marketValue: number;
  unrealizedPnl: number;
  weight: number; // decimal ratio of NAV
  realized: number;
  dividendsYtd: number;
  ytdRoi: number | null; // decimal ratio
  ytdM2mPnl: number | null;
  totalPnlYtd: number | null;
  optionsPnlRealized: number | null;
  lagged: boolean;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  reportDate: string;
};

export function mapPosition(row: PositionRow): Position {
  return {
    id: row.id,
    symbol: row.symbol,
    ticker: row.ticker,
    companyName: row.company_name ?? row.symbol,
    currency: row.currency ?? "USD",
    quantity: num(row.quantity) ?? 0,
    costPrice: num(row.cost_price),
    closePrice: num(row.close_price),
    costBasis: num(row.cost_basis_usd) ?? 0,
    marketValue: num(row.market_value_usd) ?? 0,
    unrealizedPnl: num(row.unrealized_pnl) ?? 0,
    weight: num(row.pct_of_nav) ?? 0,
    realized: (num(row.realized_st) ?? 0) + (num(row.realized_lt) ?? 0),
    dividendsYtd: num(row.dividends_ytd) ?? 0,
    ytdRoi: num(row.ytd_roi_pct),
    ytdM2mPnl: num(row.ytd_m2m_pnl),
    totalPnlYtd: num(row.total_pnl_ytd),
    optionsPnlRealized: num(row.options_pnl_realized),
    lagged: Boolean(row.mkt_value_lagged),
    sector: row.sector,
    industry: row.industry,
    country: row.country,
    exchange: row.exchange,
    reportDate: row.report_date,
  };
}

export async function getLatestPositions(db: Db): Promise<Position[]> {
  const rows = await selectAll<PositionRow>((from, to) =>
    db.from("hermes_positions_latest").select("*").order("market_value_usd", { ascending: false }).range(from, to),
  );
  return rows.map(mapPosition).filter((p) => p.quantity !== 0 || p.marketValue !== 0);
}

export type OptionPosition = {
  id: string;
  underlying: string;
  right: "C" | "P" | string;
  strike: number;
  expiry: string;
  quantity: number;
  marketValue: number;
  unrealizedPnl: number;
  dte: number | null;
};

export async function getLatestOptions(db: Db): Promise<OptionPosition[]> {
  const latest = unwrap(
    await db.from("ibkr_option_positions").select("report_date").order("report_date", { ascending: false }).limit(1),
    "options latest date",
  ) as Array<{ report_date: string }>;
  const date = latest[0]?.report_date;
  if (!date) return [];
  const rows = unwrap(
    await db.from("ibkr_option_positions").select("*").eq("report_date", date).order("market_value_usd", { ascending: true }),
    "options",
  ) as OptionPositionRow[];
  return rows.map((r) => ({
    id: r.id,
    underlying: r.underlying_symbol,
    right: r.option_right,
    strike: num(r.strike) ?? 0,
    expiry: r.expiry,
    quantity: num(r.quantity) ?? 0,
    marketValue: num(r.market_value_usd) ?? 0,
    unrealizedPnl: num(r.unrealized_pnl) ?? 0,
    dte: r.dte,
  }));
}

// ── NAV / benchmark ─────────────────────────────────────────────────────────

export type NavPoint = { date: string; nav: number; cash: number | null; ytdTwr: number | null };

export async function getNavHistory(db: Db): Promise<NavPoint[]> {
  const rows = unwrap(await db.from("ibkr_nav_history").select("*").order("snapshot_date", { ascending: true }), "nav history") as NavHistoryRow[];
  return rows
    .map((r) => ({ date: r.snapshot_date, nav: num(r.net_liquidation) ?? 0, cash: num(r.cash_balance), ytdTwr: num(r.ytd_return_pct) }))
    .filter((p) => p.nav > 0);
}

export type BenchmarkPoint = {
  date: string;
  nav: number | null;
  portfolioIndex: number | null;
  qqqClose: number | null;
  qqqIndex: number | null;
  cumulativeAlpha: number | null;
  externalFlows: number | null;
  ytdTwr: number | null;
  cash: number | null;
};

export async function getBenchmarkSeries(db: Db): Promise<BenchmarkPoint[]> {
  const rows = unwrap(await db.from("hermes_benchmark_series").select("*").order("as_of", { ascending: true }), "benchmark series") as BenchmarkSeriesRow[];
  return rows.map((r) => ({
    date: r.as_of,
    nav: num(r.portfolio_nav),
    portfolioIndex: num(r.portfolio_index),
    qqqClose: num(r.qqq_adj_close),
    qqqIndex: num(r.qqq_index),
    cumulativeAlpha: num(r.cumulative_alpha),
    externalFlows: num(r.net_external_flows),
    ytdTwr: num(r.portfolio_ytd_twr),
    cash: num(r.cash_balance),
  }));
}

export type AnnualReturn = {
  year: number;
  twr: number | null;
  qqq: number | null;
  alphaPp: number | null;
  startingNav: number | null;
  endingNav: number | null;
  netDeposits: number | null;
  source: string | null;
  notes: string | null;
  partial: boolean;
};

export async function getAnnualReturns(db: Db): Promise<AnnualReturn[]> {
  const rows = unwrap(await db.from("portfolio_annual_returns").select("*").order("year", { ascending: true }), "annual returns") as AnnualReturnRow[];
  return rows.map((r) => {
    const twr = num(r.twr_pct);
    const qqq = num(r.qqq_return_pct);
    return {
      year: r.year,
      twr,
      qqq,
      alphaPp: twr !== null && qqq !== null ? (twr - qqq) * 100 : null,
      startingNav: num(r.starting_nav),
      endingNav: num(r.ending_nav),
      netDeposits: num(r.net_deposits),
      source: r.source,
      notes: r.notes,
      partial: false,
    };
  });
}

export type PerformancePoint = { date: string; series: "portfolio" | "benchmark"; nav: number | null; dailyReturn: number | null; indexValue: number | null; ytdReturn: number | null };

export async function getPerformancePoints(db: Db, since?: string): Promise<PerformancePoint[]> {
  const rows = await selectAll<PerformancePointRow>((from, to) => {
    let q = db.from("hermes_performance_points").select("*").order("observation_date", { ascending: true });
    if (since) q = q.gte("observation_date", since);
    return q.range(from, to);
  });
  return rows.map((r) => ({
    date: r.observation_date,
    series: r.series,
    nav: num(r.nav),
    dailyReturn: num(r.daily_return),
    indexValue: num(r.index_value),
    ytdReturn: num(r.ytd_return),
  }));
}

// ── Sleeves ─────────────────────────────────────────────────────────────────

export type Sleeve = {
  id: string;
  name: string;
  manager: string | null;
  tradeAuthority: string | null;
  benchmark: string;
  inceptionDate: string | null;
  startingCapital: number;
  status: string | null;
  latestNav: { date: string; nav: number; cash: number | null; invested: number | null; totalReturn: number | null; qqqReturn: number | null; activeReturn: number | null } | null;
  recommendations: Array<{
    id: string;
    rank: number;
    asOf: string;
    symbol: string;
    companyName: string | null;
    assetClass: string;
    action: string;
    approvalStatus: string;
    targetWeight: number | null;
    targetDollars: number | null;
    referencePrice: number | null;
    thesis: string | null;
    whyBeatQqq: string | null;
    falsifier: string | null;
    catalyst: string | null;
    valuationSummary: string | null;
  }>;
  ledger: Array<{ id: string; date: string; type: string; amount: number | null; cashDelta: number | null; description: string | null; approvedBy: string | null }>;
};

export async function getSleeves(db: Db): Promise<Sleeve[]> {
  const [sleeves, recs, navs, ledger] = await Promise.all([
    db.from("hermes_sleeves").select("*").order("inception_date", { ascending: true }),
    db.from("hermes_sleeve_recommendations").select("*").order("as_of", { ascending: false }).order("rank", { ascending: true }).limit(200),
    db.from("hermes_sleeve_nav_history").select("*").order("as_of", { ascending: false }).limit(200),
    db.from("hermes_sleeve_ledger").select("*").order("event_date", { ascending: false }).limit(200),
  ]);
  const sleeveRows = unwrap(sleeves, "sleeves") as SleeveRow[];
  const recRows = unwrap(recs, "sleeve recs") as SleeveRecommendationRow[];
  const navRows = unwrap(navs, "sleeve nav") as SleeveNavRow[];
  const ledgerRows = unwrap(ledger, "sleeve ledger") as SleeveLedgerRow[];

  return sleeveRows.map((s) => {
    const sleeveRecs = recRows.filter((r) => r.sleeve_id === s.id);
    const latestAsOf = sleeveRecs[0]?.as_of;
    const nav = navRows.find((n) => n.sleeve_id === s.id);
    return {
      id: s.id,
      name: s.name,
      manager: s.manager,
      tradeAuthority: s.trade_authority,
      benchmark: s.benchmark_symbol ?? "QQQ",
      inceptionDate: s.inception_date,
      startingCapital: num(s.starting_capital) ?? 0,
      status: s.status,
      latestNav: nav
        ? {
            date: nav.as_of,
            nav: num(nav.nav) ?? 0,
            cash: num(nav.cash),
            invested: num(nav.invested_market_value),
            totalReturn: num(nav.total_return),
            qqqReturn: num(nav.qqq_return),
            activeReturn: num(nav.active_return),
          }
        : null,
      recommendations: sleeveRecs
        .filter((r) => r.as_of === latestAsOf)
        .map((r) => ({
          id: r.id,
          rank: r.rank,
          asOf: r.as_of,
          symbol: r.symbol,
          companyName: r.company_name,
          assetClass: r.asset_class,
          action: r.action,
          approvalStatus: r.approval_status,
          targetWeight: num(r.target_weight),
          targetDollars: num(r.target_dollars),
          referencePrice: num(r.reference_price),
          thesis: r.thesis,
          whyBeatQqq: r.why_beat_qqq,
          falsifier: r.falsifier,
          catalyst: r.catalyst,
          valuationSummary: r.valuation_summary,
        })),
      ledger: ledgerRows
        .filter((l) => l.sleeve_id === s.id)
        .map((l) => ({ id: l.id, date: l.event_date, type: l.event_type, amount: num(l.amount), cashDelta: num(l.cash_delta), description: l.description, approvedBy: l.approved_by })),
    };
  });
}

// ── Master layer (recommendations, alerts, digest, scorecard) ───────────────

export type Recommendation = {
  id: string;
  asOf: string;
  ticker: string;
  action: string;
  mcs: number | null;
  currentWeight: number | null;
  targetWeight: number | null;
  referencePrice: number | null;
  sizeSuggestion: string | null;
  rationale: string | null;
  memoRefs: Array<{ lens?: string; memo_id?: string; verdict?: string }>;
  status: string;
  rank: number | null;
};

export async function getOpenRecommendations(db: Db): Promise<Recommendation[]> {
  const rows = unwrap(await db.from("open_master_recommendations").select("*").limit(100), "open recommendations") as MasterRecommendationRow[];
  return rows.map((r) => ({
    id: r.id,
    asOf: r.as_of,
    ticker: r.ticker,
    action: r.action,
    mcs: num(r.mcs),
    currentWeight: num(r.current_weight_pct),
    targetWeight: num(r.target_weight_pct),
    referencePrice: num(r.reference_price),
    sizeSuggestion: r.size_suggestion,
    rationale: r.rationale,
    memoRefs: Array.isArray(r.memo_refs) ? (r.memo_refs as Recommendation["memoRefs"]) : [],
    status: r.status,
    rank: r.mcs_rank,
  }));
}

export type Alert = {
  id: string;
  asOf: string;
  ticker: string;
  type: string;
  triggerPrice: number | null;
  livePrice: number | null;
  pctToTrigger: number | null;
  persona: string | null;
  memoId: string | null;
  note: string | null;
};

export async function getRecentAlerts(db: Db, limit = 30): Promise<Alert[]> {
  const rows = unwrap(await db.from("master_alerts").select("*").order("as_of", { ascending: false }).limit(limit), "alerts") as MasterAlertRow[];
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const r of rows) {
    const key = `${r.ticker}:${r.alert_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.id,
      asOf: r.as_of,
      ticker: r.ticker,
      type: r.alert_type,
      triggerPrice: num(r.trigger_price),
      livePrice: num(r.live_price),
      pctToTrigger: num(r.pct_to_trigger),
      persona: r.analyst_slug,
      memoId: r.memo_id,
      note: r.note,
    });
  }
  return out;
}

export async function getLatestDigest(db: Db): Promise<MasterDigestRow | null> {
  const rows = unwrap(await db.from("master_digests").select("*").order("as_of", { ascending: false }).limit(1), "digest") as MasterDigestRow[];
  return rows[0] ?? null;
}

export type Decision = {
  id: string;
  ticker: string;
  date: string;
  verdict: string;
  price: number | null;
  quantity: number | null;
  rationale: string | null;
  evaluatedAt: string | null;
  currentPrice: number | null;
  realizedReturn: number | null;
  qqqReturn: number | null;
  alpha: number | null;
  status: string | null;
};

export async function getDecisionScorecard(db: Db): Promise<Decision[]> {
  const rows = unwrap(await db.from("hermes_decision_scorecard").select("*").order("decision_date", { ascending: false }).limit(500), "scorecard") as DecisionScorecardRow[];
  return rows.map((r) => ({
    id: r.decision_id,
    ticker: r.ticker,
    date: r.decision_date,
    verdict: r.verdict,
    price: num(r.price),
    quantity: num(r.quantity),
    rationale: r.rationale,
    evaluatedAt: r.evaluation_date,
    currentPrice: num(r.current_price),
    realizedReturn: num(r.realized_return_pct),
    qqqReturn: num(r.qqq_return_pct),
    alpha: num(r.alpha_pct),
    status: r.thesis_status,
  }));
}

// ── Trades ──────────────────────────────────────────────────────────────────

export type Trade = {
  id: string;
  tradeTime: string;
  tradeDate: string;
  symbol: string;
  ticker: string | null;
  companyName: string | null;
  assetType: string;
  side: string;
  quantity: number | null;
  price: number | null;
  currency: string;
  notional: number | null;
  fees: number | null;
  realizedPnl: number | null;
  sleeveId: string;
  ideaId: string | null;
  memoId: string | null;
  rationale: string | null;
  tags: string[];
  source: string;
};

export function mapTrade(r: TradeRow): Trade {
  return {
    id: r.id,
    tradeTime: r.trade_time,
    tradeDate: r.trade_date,
    symbol: r.symbol,
    ticker: r.ticker,
    companyName: r.company_name,
    assetType: r.asset_type,
    side: r.side,
    quantity: num(r.quantity),
    price: num(r.price),
    currency: r.currency,
    notional: num(r.notional_usd),
    fees: num(r.fees_usd),
    realizedPnl: num(r.realized_pnl_usd),
    sleeveId: r.sleeve_id,
    ideaId: r.idea_id,
    memoId: r.memo_id,
    rationale: r.rationale,
    tags: r.tags ?? [],
    source: r.source,
  };
}

export async function getTrades(db: Db, opts: { limit?: number; symbol?: string; sleeveId?: string } = {}): Promise<Trade[]> {
  let q = db.from("hermes_trades").select("*").order("trade_time", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.symbol) q = q.eq("symbol", opts.symbol.toUpperCase());
  if (opts.sleeveId) q = q.eq("sleeve_id", opts.sleeveId);
  const rows = unwrap(await q, "trades") as TradeRow[];
  return rows.map(mapTrade);
}

// ── Derived analytics ───────────────────────────────────────────────────────

export type ExposureBucket = { key: string; label: string; value: number; weight: number; count: number };

export function bucketExposure(positions: Position[], by: (p: Position) => string | null, nav: number, unknownLabel = "Unclassified"): ExposureBucket[] {
  const groups = groupBy(positions, (p) => by(p) ?? unknownLabel);
  const out: ExposureBucket[] = [];
  for (const [key, items] of groups) {
    const value = sum(items.map((p) => p.marketValue));
    out.push({ key, label: key, value, weight: nav > 0 ? value / nav : 0, count: items.length });
  }
  return out.sort((a, b) => b.value - a.value);
}

export type Attribution = {
  symbol: string;
  ticker: string | null;
  companyName: string;
  weight: number;
  pnlYtd: number; // total pnl incl. realized, dividends, options
  contribution: number; // decimal ratio of starting NAV
  ytdRoi: number | null;
  sector: string | null;
};

/**
 * Per-name YTD contribution: total P&L attributable to the name divided by the
 * year's starting NAV. Uses the statement's own total_pnl when present, which
 * already includes realized, unrealized, dividends and option P&L on the
 * underlying; falls back to unrealized + realized + dividends.
 */
export function computeAttribution(positions: Position[], startingNav: number): Attribution[] {
  return positions
    .map((p) => {
      const pnl = p.totalPnlYtd ?? p.unrealizedPnl + p.realized + p.dividendsYtd + (p.optionsPnlRealized ?? 0);
      return {
        symbol: p.symbol,
        ticker: p.ticker,
        companyName: p.companyName,
        weight: p.weight,
        pnlYtd: pnl,
        contribution: startingNav > 0 ? pnl / startingNav : 0,
        ytdRoi: p.ytdRoi,
        sector: p.sector,
      };
    })
    .sort((a, b) => b.pnlYtd - a.pnlYtd);
}

export function positionForTicker(positions: Position[], ticker: string): Position | null {
  const sym = bareSymbol(ticker);
  return positions.find((p) => p.ticker === ticker) ?? positions.find((p) => p.symbol.toUpperCase() === sym) ?? null;
}

import { num, selectAll, unwrap, type Db } from "./query";
import type { AgentTaskRow, GuruCrossoverRow, MasterScoreRow, QuantJobRow, ScreenerRow, TrackedHoldingRow } from "./types";

// ── Screener universe ───────────────────────────────────────────────────────

export type UniverseRow = {
  memoId: string;
  persona: string;
  ticker: string;
  symbol: string;
  companyName: string;
  verdict: string;
  analyzedAt: string | null;
  ageDays: number | null;
  memoPrice: number | null;
  expectedIrr: number | null;
  pwv: number | null;
  buyPrice: number | null;
  triggerPrice: number | null;
  quotePrice: number | null;
  quoteAsOf: string | null;
  drift: number | null;
  irrAtQuote: number | null;
  pwvPv: number | null;
  mos: number | null;
  downsideAtQuote: number | null;
  buyPierced: boolean;
  triggerPierced: boolean;
  respawn: boolean;
  downside: number | null;
  mathMustWork: boolean | null;
  horizon: number | null;
  sourceSystem: string | null;
  chassis: string | null;
  marketCapMm: number | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  mcs: number | null;
  mcsRank: number | null;
  bradScore: number | null;
  pabraiScore: number | null;
  vcScore: number | null;
  health: string | null;
  rankable: boolean;
  blocker: boolean;
  issues: number;
  heldWeight: number | null;
  heldValue: number | null;
  /** upside to buy price: (buy - quote)/quote; negative = above buy zone */
  distanceToBuy: number | null;
};

export function mapUniverseRow(r: ScreenerRow): UniverseRow {
  const quote = num(r.quote_price) ?? num(r.memo_price);
  const buy = num(r.buy_consideration_price);
  return {
    memoId: r.memo_id,
    persona: r.analyst_slug,
    ticker: r.ticker,
    symbol: r.symbol,
    companyName: r.company_name ?? r.ticker,
    verdict: r.verdict,
    analyzedAt: r.analyzed_at,
    ageDays: r.memo_age_days,
    memoPrice: num(r.memo_price),
    expectedIrr: num(r.memo_expected_irr),
    pwv: num(r.memo_pwv),
    buyPrice: buy,
    triggerPrice: num(r.reunderwrite_trigger_price),
    quotePrice: num(r.quote_price),
    quoteAsOf: r.quote_as_of,
    drift: num(r.price_drift_pct),
    irrAtQuote: num(r.expected_irr_at_quote),
    pwvPv: num(r.probability_weighted_value_pv),
    mos: num(r.margin_of_safety_ratio_pv),
    downsideAtQuote: num(r.downside_drawdown_pct_at_quote),
    buyPierced: Boolean(r.buy_pierced),
    triggerPierced: Boolean(r.trigger_pierced),
    respawn: Boolean(r.spawn_recommended),
    downside: num(r.downside_drawdown_pct),
    mathMustWork: r.math_must_work,
    horizon: num(r.horizon_years),
    sourceSystem: r.source_system,
    chassis: r.chassis,
    marketCapMm: num(r.market_cap_mm),
    sector: r.sector,
    industry: r.industry,
    country: r.country,
    mcs: num(r.mcs),
    mcsRank: r.mcs_rank,
    bradScore: num(r.brad_score),
    pabraiScore: num(r.pabrai_score),
    vcScore: num(r.public_vc_score),
    health: r.health,
    rankable: Boolean(r.is_rankable),
    blocker: Boolean(r.has_blocker),
    issues: r.issue_count ?? 0,
    heldWeight: num(r.held_weight),
    heldValue: num(r.held_value),
    distanceToBuy: quote && buy ? (buy - quote) / quote : null,
  };
}

export async function getUniverse(db: Db): Promise<UniverseRow[]> {
  const rows = await selectAll<ScreenerRow>((from, to) => db.from("hermes_screener_universe").select("*").order("analyzed_at", { ascending: false }).range(from, to));
  return rows.map(mapUniverseRow);
}

export async function getUniverseForTicker(db: Db, ticker: string): Promise<UniverseRow[]> {
  const rows = unwrap(await db.from("hermes_screener_universe").select("*").ilike("ticker", ticker).order("analyzed_at", { ascending: false }), "universe for ticker") as ScreenerRow[];
  return rows.map(mapUniverseRow);
}

// ── Master scores ───────────────────────────────────────────────────────────

export type MasterScore = { ticker: string; companyName: string | null; asOf: string; brad: number | null; pabrai: number | null; vc: number | null; mcs: number | null; rank: number | null; disqualified: boolean; reason: string | null };

export async function getMasterScores(db: Db, limit = 100): Promise<MasterScore[]> {
  const rows = unwrap(await db.from("latest_master_scores").select("*").eq("disqualified", false).order("rank", { ascending: true }).limit(limit), "master scores") as MasterScoreRow[];
  return rows.map((r) => ({
    ticker: r.ticker,
    companyName: r.company_name,
    asOf: r.as_of,
    brad: num(r.brad_score),
    pabrai: num(r.pabrai_score),
    vc: num(r.public_vc_score),
    mcs: num(r.mcs),
    rank: r.rank,
    disqualified: r.disqualified,
    reason: r.disqualify_reason,
  }));
}

// ── Guru / 13F ──────────────────────────────────────────────────────────────

export type GuruSignal = {
  symbol: string;
  issuer: string | null;
  reportDate: string;
  buyers: number;
  sellers: number;
  newBuyers: number;
  soldOut: number;
  buyValue: number | null;
  sellValue: number | null;
  buyerNames: string[];
  sellerNames: string[];
  net: number;
};

export async function getGuruCrossover(db: Db, opts: { minBuyers?: number; limit?: number; reportDate?: string } = {}): Promise<GuruSignal[]> {
  let q = db.from("hermes_guru_crossover").select("*").order("buyers", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.minBuyers) q = q.gte("buyers", opts.minBuyers);
  if (opts.reportDate) q = q.eq("report_date", opts.reportDate);
  const rows = unwrap(await q, "guru crossover") as GuruCrossoverRow[];
  return rows.map((r) => {
    const buyers = num(r.buyers) ?? 0;
    const sellers = num(r.sellers) ?? 0;
    return {
      symbol: r.ticker_symbol,
      issuer: r.issuer_name,
      reportDate: r.report_date,
      buyers,
      sellers,
      newBuyers: num(r.new_buyers) ?? 0,
      soldOut: num(r.sold_out) ?? 0,
      buyValue: num(r.buy_value),
      sellValue: num(r.sell_value),
      buyerNames: r.buyer_names ?? [],
      sellerNames: r.seller_names ?? [],
      net: buyers - sellers,
    };
  });
}

export async function getGuruSignalForSymbol(db: Db, symbol: string): Promise<GuruSignal[]> {
  const rows = unwrap(await db.from("hermes_guru_crossover").select("*").eq("ticker_symbol", symbol.toUpperCase()).order("report_date", { ascending: false }), "guru for symbol") as GuruCrossoverRow[];
  return rows.map((r) => ({
    symbol: r.ticker_symbol,
    issuer: r.issuer_name,
    reportDate: r.report_date,
    buyers: num(r.buyers) ?? 0,
    sellers: num(r.sellers) ?? 0,
    newBuyers: num(r.new_buyers) ?? 0,
    soldOut: num(r.sold_out) ?? 0,
    buyValue: num(r.buy_value),
    sellValue: num(r.sell_value),
    buyerNames: r.buyer_names ?? [],
    sellerNames: r.seller_names ?? [],
    net: (num(r.buyers) ?? 0) - (num(r.sellers) ?? 0),
  }));
}

export type Holder = { investor: string; reportDate: string; shares: number | null; value: number | null };

export async function getHoldersForSymbol(db: Db, symbol: string, limit = 40): Promise<Holder[]> {
  const rows = unwrap(
    await db
      .from("tracked_13f_holdings")
      .select("investor_id, report_date, ticker_symbol, issuer_name, shares, value_reported, tracked_13f_investors(display_name)")
      .eq("ticker_symbol", symbol.toUpperCase())
      .order("report_date", { ascending: false })
      .order("value_reported", { ascending: false })
      .limit(limit * 3),
    "holders",
  ) as unknown as Array<TrackedHoldingRow & { tracked_13f_investors: { display_name: string } | { display_name: string }[] | null }>;
  const latest = rows[0]?.report_date;
  return rows
    .filter((r) => r.report_date === latest)
    .slice(0, limit)
    .map((r) => {
      const inv = Array.isArray(r.tracked_13f_investors) ? r.tracked_13f_investors[0] : r.tracked_13f_investors;
      return { investor: inv?.display_name ?? r.investor_id, reportDate: r.report_date, shares: num(r.shares), value: num(r.value_reported) };
    });
}

// ── Quant jobs & agent tasks ───────────────────────────────────────────────

export async function getQuantJobs(db: Db, kind?: QuantJobRow["kind"], limit = 50): Promise<QuantJobRow[]> {
  let q = db.from("hermes_quant_jobs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (kind) q = q.eq("kind", kind);
  return unwrap(await q, "quant jobs") as QuantJobRow[];
}

export async function getQuantJob(db: Db, id: string): Promise<QuantJobRow | null> {
  const rows = unwrap(await db.from("hermes_quant_jobs").select("*").eq("id", id).limit(1), "quant job") as QuantJobRow[];
  return rows[0] ?? null;
}

export async function getAgentTasks(db: Db, opts: { status?: string; limit?: number } = {}): Promise<AgentTaskRow[]> {
  let q = db.from("hermes_agent_tasks").select("*").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  return unwrap(await q, "agent tasks") as AgentTaskRow[];
}

import { bareSymbol } from "@/lib/utils";
import { num, selectAll, unwrap, type Db } from "./query";
import type { CompanyFilingRow, CompanyRow, ThemeRow } from "./types";

export type Company = {
  ticker: string;
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  subindustry: string | null;
  country: string | null;
  currency: string | null;
  provenance: string | null;
  updatedAt: string;
};

export function mapCompany(r: CompanyRow): Company {
  return {
    ticker: r.ticker,
    symbol: r.symbol ?? bareSymbol(r.ticker),
    name: r.company_name ?? r.ticker,
    exchange: r.exchange,
    sector: r.sector,
    industry: r.industry,
    subindustry: r.subindustry,
    country: r.country,
    currency: r.currency,
    provenance: r.provenance,
    updatedAt: r.updated_at,
  };
}

export async function getCompany(db: Db, ticker: string): Promise<Company | null> {
  const upper = ticker.toUpperCase();
  const sym = bareSymbol(upper);
  const rows = unwrap(
    await db.from("investment_companies").select("*").or(`ticker.eq.${upper},symbol.eq.${sym}`).order("updated_at", { ascending: false }).limit(5),
    "company",
  ) as CompanyRow[];
  const exact = rows.find((r) => r.ticker === upper) ?? rows[0];
  return exact ? mapCompany(exact) : null;
}

export async function searchCompanies(db: Db, query: string, limit = 12): Promise<Company[]> {
  const q = query.trim();
  if (!q) return [];
  const upper = q.toUpperCase();
  const rows = unwrap(
    await db
      .from("investment_companies")
      .select("*")
      .or(`symbol.ilike.${upper}%,ticker.ilike.%:${upper}%,company_name.ilike.%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(limit),
    "search companies",
  ) as CompanyRow[];
  return rows.map(mapCompany).sort((a, b) => (a.symbol === upper ? -1 : b.symbol === upper ? 1 : 0));
}

export async function listCompanies(db: Db, opts: { sector?: string; limit?: number } = {}): Promise<Company[]> {
  let q = db.from("investment_companies").select("*").order("updated_at", { ascending: false }).limit(opts.limit ?? 1000);
  if (opts.sector) q = q.eq("sector", opts.sector);
  const rows = unwrap(await q, "companies") as CompanyRow[];
  return rows.map(mapCompany);
}

export type CompanyCoverage = {
  memoId: string;
  persona: string;
  ticker: string;
  symbol: string;
  companyName: string;
  verdict: string;
  analyzedAt: string | null;
  expectedIrr: number | null;
};

/**
 * Latest memo coverage for the company index. This intentionally reads the
 * narrow research stream rather than hermes_screener_universe: the company
 * index already loads positions separately and does not need the screener's
 * live-price, score, health, or lateral position joins.
 */
export async function getCompanyCoverage(db: Db): Promise<CompanyCoverage[]> {
  type CoverageRow = {
    id: string;
    ticker: string;
    company_name: string | null;
    persona_slug: string | null;
    verdict: string | null;
    occurred_at: string | null;
    expected_irr: number | string | null;
  };
  const rows = await selectAll<CoverageRow>((from, to) => db
    .from("hermes_research_stream")
    .select("id,ticker,company_name,persona_slug,verdict,occurred_at,expected_irr")
    .eq("source_table", "analyst_memos")
    .eq("is_latest", true)
    .order("occurred_at", { ascending: false })
    .range(from, to), 1000, 5000);
  return rows
    .filter((row): row is CoverageRow & { ticker: string; persona_slug: string; verdict: string } => (
      Boolean(row.ticker && row.persona_slug && row.verdict)
    ))
    .map((row) => ({
      memoId: row.id,
      persona: row.persona_slug,
      ticker: row.ticker,
      symbol: bareSymbol(row.ticker),
      companyName: row.company_name ?? row.ticker,
      verdict: row.verdict,
      analyzedAt: row.occurred_at,
      expectedIrr: num(row.expected_irr),
    }));
}

export type Filing = { id: string; form: string | null; date: string | null; accession: string | null; url: string | null; status: string | null };

export async function getFilings(db: Db, ticker: string, limit = 25): Promise<Filing[]> {
  const rows = unwrap(
    await db.from("company_filings").select("id, ticker, form_type, filing_date, accession_number, filing_url, review_status, fetched_at").ilike("ticker", ticker).order("filing_date", { ascending: false }).limit(limit),
    "filings",
  ) as CompanyFilingRow[];
  return rows.map((r) => ({ id: r.id, form: r.form_type, date: r.filing_date, accession: r.accession_number, url: r.filing_url, status: r.review_status }));
}

export async function getThemes(db: Db): Promise<ThemeRow[]> {
  return unwrap(await db.from("themes").select("id, slug, name, status, summary, core_thesis, why_now, time_horizon, confidence, updated_at").order("updated_at", { ascending: false }), "themes") as ThemeRow[];
}

export async function getThemesForTicker(db: Db, ticker: string): Promise<Array<{ slug: string; name: string; role: string | null; why: string | null }>> {
  const sym = bareSymbol(ticker);
  const rows = unwrap(
    await db.from("theme_company_links").select("ticker, role_in_theme, why_mentioned, themes(slug, name)").or(`ticker.eq.${ticker.toUpperCase()},ticker.ilike.%:${sym},ticker.eq.${sym}`).limit(20),
    "themes for ticker",
  ) as unknown as Array<{ ticker: string; role_in_theme: string | null; why_mentioned: string | null; themes: { slug: string; name: string } | { slug: string; name: string }[] | null }>;
  return rows
    .map((r) => {
      const theme = Array.isArray(r.themes) ? r.themes[0] : r.themes;
      return theme ? { slug: theme.slug, name: theme.name, role: r.role_in_theme, why: r.why_mentioned } : null;
    })
    .filter((x): x is { slug: string; name: string; role: string | null; why: string | null } => Boolean(x));
}

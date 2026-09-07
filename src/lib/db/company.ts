import { bareSymbol } from "@/lib/utils";
import { unwrap, type Db } from "./query";
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

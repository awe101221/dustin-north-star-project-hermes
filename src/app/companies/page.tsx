import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { listCompanies } from "@/lib/db/company";
import { getUniverse } from "@/lib/db/quant";
import { getLatestPositions } from "@/lib/db/portfolio";
import { getIdeas } from "@/lib/db/pipeline";
import { safeLoad } from "@/lib/server/safe";
import { bareSymbol } from "@/lib/utils";
import { CompaniesTable, type CompanyListRow } from "@/components/companies/companies-table";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const db = serverReadClient();
  const header = <PageHeader eyebrow="Universe" title="Companies" description="Every company the brain knows about: memo coverage per lens, latest verdicts, live weight, pipeline stage. Click through for the full dossier." />;
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(async () => {
    const [companies, universe, positions, ideas] = await Promise.all([listCompanies(db, { limit: 2000 }), getUniverse(db), getLatestPositions(db), getIdeas(db)]);
    const byTicker = new Map<string, CompanyListRow>();
    for (const c of companies) {
      byTicker.set(c.ticker.toUpperCase(), { ticker: c.ticker, symbol: c.symbol, name: c.name, sector: c.sector, industry: c.industry, country: c.country, lenses: [], bestVerdict: null, bestIrr: null, latestMemoAt: null, weight: null, stage: null, memoCount: 0 });
    }
    for (const u of universe) {
      const key = u.ticker.toUpperCase();
      let row = byTicker.get(key);
      if (!row) {
        row = { ticker: u.ticker, symbol: u.symbol, name: u.companyName, sector: u.sector, industry: u.industry, country: u.country, lenses: [], bestVerdict: null, bestIrr: null, latestMemoAt: null, weight: null, stage: null, memoCount: 0 };
        byTicker.set(key, row);
      }
      row.lenses.push(`${u.persona}:${u.verdict}`);
      row.memoCount += 1;
      if (u.expectedIrr !== null && (row.bestIrr === null || u.expectedIrr > row.bestIrr)) {
        row.bestIrr = u.expectedIrr;
        row.bestVerdict = u.verdict;
      }
      if (!row.latestMemoAt || (u.analyzedAt && u.analyzedAt > row.latestMemoAt)) row.latestMemoAt = u.analyzedAt;
    }
    const posBySymbol = new Map(positions.map((p) => [p.ticker ?? p.symbol.toUpperCase(), p]));
    for (const row of byTicker.values()) {
      const p = posBySymbol.get(row.ticker.toUpperCase()) ?? positions.find((x) => x.symbol.toUpperCase() === bareSymbol(row.ticker));
      if (p) row.weight = p.weight;
    }
    for (const i of ideas) {
      const row = byTicker.get(i.ticker.toUpperCase());
      if (row) row.stage = i.stage;
    }
    return Array.from(byTicker.values()).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.latestMemoAt ?? "").localeCompare(a.latestMemoAt ?? ""));
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  return <>{header}<CompaniesTable rows={result.data} /></>;
}

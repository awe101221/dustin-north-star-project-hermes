import { fail, json, withAgent } from "@/lib/server/handlers";
import { getCompany, getFilings } from "@/lib/db/company";
import { getMemoSummariesForTicker, getNotes } from "@/lib/db/research";
import { getUniverseForTicker, getGuruSignalForSymbol } from "@/lib/db/quant";
import { getLatestPositions, positionForTicker, getTrades } from "@/lib/db/portfolio";
import { getIdeaForTicker } from "@/lib/db/pipeline";
import { getMandate } from "@/lib/db/northstar";
import { getCompanyUnderwriting } from "@/lib/db/underwriting";
import { getForecastLearning } from "@/lib/db/forecast-ladders";
import { bareSymbol } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/context?ticker=NAS:MU
 * One call that returns everything an agent needs before underwriting or
 * reviewing a name: mandate, company record, live position, latest view per
 * lens, memo history (light), pipeline card, notes, recent filings, guru flow.
 */
export const GET = withAgent(async ({ request, db }) => {
  const ticker = (request.nextUrl.searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return fail("ticker query param required.");
  const symbol = bareSymbol(ticker);
  const company = await getCompany(db, ticker);
  const canonical = company?.ticker ?? ticker;
  const [mandate, universe, memos, notes, positions, idea, filings, guru, trades, underwriting, forecast_learning] = await Promise.all([
    getMandate(db),
    getUniverseForTicker(db, canonical),
    getMemoSummariesForTicker(db, canonical, 20),
    getNotes(db, { ticker: canonical, limit: 10 }),
    getLatestPositions(db),
    getIdeaForTicker(db, canonical),
    getFilings(db, canonical, 10),
    getGuruSignalForSymbol(db, symbol),
    getTrades(db, { symbol, limit: 20 }),
    getCompanyUnderwriting(db, canonical),
    getForecastLearning(db, canonical),
  ]);
  return json({
    ticker: company?.ticker ?? ticker,
    symbol,
    mandate: { mission: mandate.mission, hurdle_irr: mandate.hurdleIrr, benchmark: mandate.benchmark, rules: mandate.rules, guardrails: mandate.guardrails },
    company,
    position: positionForTicker(positions, company?.ticker ?? ticker),
    latest_by_lens: universe,
    memo_history: memos,
    pipeline: idea,
    notes: notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body_md: n.body, tags: n.tags, occurred_at: n.occurredAt })),
    filings,
    guru_flow: guru,
    trades,
    underwriting,
    forecast_learning,
    reference_tokens: {
      filings_archive: `company_filings/${company?.ticker ?? ticker}/archive`,
      latest_memo: universe.map((u) => `analyst_memos/${u.persona}/latest/${u.ticker}`),
    },
  });
});

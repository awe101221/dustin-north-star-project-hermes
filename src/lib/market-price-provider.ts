import { EvidencePending, marketObservation } from "./forecast-ladder";
import { MARKET_CALENDAR_VERSION, previousCompletedSession } from "./market-calendar";

export const MARKET_POLICY_VERSION = "price-return-split-v1";
export type HistoricalPrices = {
  provider: string;
  symbol: string;
  retrieved_at: string;
  adjustment_basis: "split-adjusted";
  return_basis: "price-return";
  currency: "USD";
  source_date: string; // Latest completed session actually present, not request date.
  source_url: string; // Public credential-free citation, never authenticated URL.
  endpoint: string; // Credential-free endpoint template for reproducibility.
  prices: Record<string, number>;
};
/** One explicitly selected adapter per sweep. No fallback provider registry. */
export interface HistoricalPriceProvider {
  readonly name: string;
  history(symbol: string, today: string): Promise<HistoricalPrices>;
}

export async function priceReturnEvidence(provider: HistoricalPriceProvider, ticker: string, start: string, due: string, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const [stock, qqq] = await Promise.all([provider.history(ticker, today), provider.history("QQQ", today)]);
  const latest = previousCompletedSession(today);
  for (const [leg, symbol] of [[stock, ticker], [qqq, "QQQ"]] as const) {
    const age = now.getTime() - Date.parse(leg.retrieved_at);
    if (leg.provider !== provider.name || leg.symbol !== symbol || leg.currency !== "USD" ||
        leg.adjustment_basis !== "split-adjusted" || leg.return_basis !== "price-return") {
      throw new EvidencePending("Mismatched provider, instrument, currency or price-return adjustment basis");
    }
    if (!Number.isFinite(age) || age < -300000 || age > 86400000 || !latest || leg.source_date !== latest || !leg.prices[latest]) {
      throw new EvidencePending("Stale or incomplete historical-price evidence; keep pending");
    }
    // Endpoint URLs must never be returned by an adapter with credentials in them.
    let url: URL;
    try { url = new URL(leg.source_url); } catch { throw new EvidencePending("Invalid provider evidence URL"); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname.includes("/user/")) {
      throw new EvidencePending("Unsafe provider evidence URL");
    }
  }
  const endpoints = marketObservation(stock.prices, qqq.prices, start, due, today);
  const provenance = ({ prices: _prices, ...leg }: HistoricalPrices) => ({ ...leg, start_source_date: start, end_source_date: due });
  return { observation: { ...endpoints, provider: provider.name, policy_version: MARKET_POLICY_VERSION,
    adjustment_basis: "split-adjusted", return_basis: "price-return", calendar_version: MARKET_CALENDAR_VERSION,
    stock: provenance(stock), qqq: provenance(qqq) }, evidence_urls: [stock.source_url, qqq.source_url] };
}

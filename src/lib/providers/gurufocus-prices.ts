import { EvidencePending } from "../forecast-ladder";
import { validPriceDate } from "../market-calendar";
import type { HistoricalPriceProvider, HistoricalPrices } from "../market-price-provider";

/** Licensed legacy /price payload: [MM-DD-YYYY, split-adjusted close][];
 * not /unadjusted_price, a live quote, or the separately licensed /data API.
 * https://www.gurufocus.com/news/347921/both-gurufocus-excel-addin-and-api-are-available-to-premium-members-now
 */
export function parseGuruFocusPrices(raw: unknown): Record<string, number> {
  if (!Array.isArray(raw) || !raw.length) throw new EvidencePending("GuruFocus historical prices unavailable; check entitlement/rate limit");
  const prices: Record<string, number> = {};
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || !/^\d{2}-\d{2}-\d{4}$/.test(row[0])) {
      throw new EvidencePending("Ambiguous GuruFocus historical-price response");
    }
    const day = `${row[0].slice(6)}-${row[0].slice(0, 2)}-${row[0].slice(3, 5)}`;
    if (!validPriceDate(day) || typeof row[1] !== "number" || !Number.isFinite(row[1]) || row[1] <= 0 || Object.hasOwn(prices, day)) {
      throw new EvidencePending("Invalid or duplicate GuruFocus historical price");
    }
    prices[day] = row[1];
  }
  return prices;
}

export function createGuruFocusPriceProvider(key?: string, request: typeof fetch = fetch, clock = () => new Date()): HistoricalPriceProvider {
  const cache = new Map<string, Promise<HistoricalPrices>>(); // Only this sweep; failed requests are not retried via another feed.
  return { name: "gurufocus", history(symbol, today) {
    if (!key?.trim() || /SENSITIVE/.test(key)) return Promise.reject(new EvidencePending("GURUFOCUS_API_KEY is not configured"));
    // Unqualified GuruFocus US symbols only. Never strip a foreign exchange prefix.
    if (!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol)) return Promise.reject(new EvidencePending("Ambiguous GuruFocus US symbol"));
    const cacheKey = `${symbol}:${today}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, (async () => {
      let raw: unknown;
      try {
        const response = await request(`https://api.gurufocus.com/public/user/${encodeURIComponent(key)}/stock/${encodeURIComponent(symbol)}/price`,
          { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new EvidencePending(`GuruFocus historical-price HTTP ${response.status}`);
        raw = await response.json();
      } catch (error) {
        if (error instanceof EvidencePending) throw error;
        // API key is in the licensed URL; never propagate fetch/parser error text.
        throw new EvidencePending("GuruFocus historical-price request unavailable; keep pending");
      }
      const prices = parseGuruFocusPrices(raw);
      if (Object.keys(prices).some((day) => day > today)) throw new EvidencePending("Future-dated GuruFocus history is ambiguous");
      const source_date = Object.keys(prices).filter((day) => day < today).sort().at(-1);
      if (!source_date) throw new EvidencePending("No completed GuruFocus historical session");
      return { provider: "gurufocus", symbol, currency: "USD", adjustment_basis: "split-adjusted", return_basis: "price-return",
        retrieved_at: clock().toISOString(), source_date, prices,
        source_url: `https://www.gurufocus.com/stock/${encodeURIComponent(symbol)}/summary`,
        endpoint: "/public/user/{credential}/stock/{symbol}/price" };
    })());
    return cache.get(cacheKey)!;
  } };
}

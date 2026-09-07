/**
 * Daily price provider for the backtest lab. Stooq serves free daily OHLC as
 * CSV with no key (symbol format "qqq.us"). The provider interface is small so
 * a paid feed (Polygon, GuruFocus price history, IBKR) can be dropped in.
 */
export type DailyBar = { date: string; close: number };

export interface PriceProvider {
  name: string;
  daily(symbol: string, from?: string): Promise<DailyBar[]>;
}

function stooqSymbol(symbol: string) {
  const s = symbol.trim().toLowerCase();
  if (s.includes(".")) return s;
  return `${s}.us`;
}

export const stooqProvider: PriceProvider = {
  name: "stooq",
  async daily(symbol, from) {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&i=d`;
    const res = await fetch(url, { next: { revalidate: 3600 }, headers: { accept: "text/csv" } });
    if (!res.ok) throw new Error(`stooq ${symbol}: HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2 || !lines[0]?.toLowerCase().startsWith("date")) throw new Error(`stooq ${symbol}: no data`);
    const bars: DailyBar[] = [];
    for (const line of lines.slice(1)) {
      const [date, , , , close] = line.split(",");
      const c = Number(close);
      if (!date || !Number.isFinite(c)) continue;
      if (from && date < from) continue;
      bars.push({ date, close: c });
    }
    return bars;
  },
};

export const noProvider: PriceProvider = {
  name: "none",
  async daily() {
    throw new Error("HERMES_PRICE_PROVIDER=none: no price feed configured");
  },
};

export function getPriceProvider(name: "stooq" | "none"): PriceProvider {
  return name === "none" ? noProvider : stooqProvider;
}

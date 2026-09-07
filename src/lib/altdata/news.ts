import "server-only";
import { guruFocusApiKey } from "@/lib/env";
import { bareSymbol } from "@/lib/utils";

/**
 * Alternative-data adapters. Each provider returns a normalized news item.
 * GuruFocus is used when a key is configured; SEC EDGAR's public Atom feed is
 * the keyless fallback so the module always does something useful.
 */
export type NewsItem = { title: string; url: string; source?: string; date?: string };

export interface NewsProvider {
  name: string;
  news(ticker: string): Promise<NewsItem[]>;
}

export const guruFocusNews: NewsProvider = {
  name: "gurufocus",
  async news(ticker) {
    const key = guruFocusApiKey();
    if (!key) throw new Error("GURUFOCUS_API_KEY not set");
    const symbol = bareSymbol(ticker);
    const res = await fetch(`https://api.gurufocus.com/public/user/${key}/stock/${encodeURIComponent(symbol)}/news_feed`, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`GuruFocus ${res.status}`);
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data) ? data : Array.isArray((data as { news?: unknown[] })?.news) ? (data as { news: unknown[] }).news : [];
    return list
      .map((raw) => {
        const r = raw as Record<string, unknown>;
        return { title: String(r.headline ?? r.title ?? ""), url: String(r.url ?? r.link ?? ""), source: typeof r.source === "string" ? r.source : "GuruFocus", date: typeof r.date === "string" ? r.date : typeof r.published_at === "string" ? r.published_at : undefined };
      })
      .filter((n) => n.title && n.url)
      .slice(0, 30);
  },
};

export const edgarFilingsFeed: NewsProvider = {
  name: "sec-edgar",
  async news(ticker) {
    const symbol = bareSymbol(ticker);
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=8-K,10-Q,10-K,6-K&dateRange=custom`;
    const res = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(symbol)}&forms=8-K,10-Q,10-K,6-K`, {
      headers: { "user-agent": "Hermes research dashboard (dustinawe@gmail.com)", accept: "application/json" },
      next: { revalidate: 900 },
    }).catch(() => null);
    if (!res || !res.ok) {
      // Full-text search is best-effort; fall back to the company browse Atom feed by ticker.
      const atom = await fetch(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(symbol)}&type=&dateb=&owner=include&count=20&output=atom`, {
        headers: { "user-agent": "Hermes research dashboard (dustinawe@gmail.com)" },
        next: { revalidate: 900 },
      });
      if (!atom.ok) throw new Error(`SEC EDGAR ${atom.status} (${url})`);
      const xml = await atom.text();
      const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 20);
      return entries.map((m) => {
        const block = m[1] ?? "";
        const title = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? "Filing";
        const link = /<link[^>]*href="([^"]+)"/.exec(block)?.[1] ?? "https://www.sec.gov";
        const date = /<updated>([\s\S]*?)<\/updated>/.exec(block)?.[1];
        return { title: title.replace(/&amp;/g, "&"), url: link, source: "SEC EDGAR", date };
      });
    }
    const data = (await res.json()) as { hits?: { hits?: Array<{ _source?: Record<string, unknown>; _id?: string }> } };
    return (data.hits?.hits ?? []).slice(0, 25).map((h) => {
      const s = h._source ?? {};
      const id = String(h._id ?? "");
      const [adsh, file] = id.split(":");
      const ciks = Array.isArray(s.ciks) ? String(s.ciks[0] ?? "") : "";
      return {
        title: `${String(s.form ?? "")} · ${Array.isArray(s.display_names) ? String(s.display_names[0] ?? symbol) : symbol}`,
        url: adsh && file && ciks ? `https://www.sec.gov/Archives/edgar/data/${Number(ciks)}/${adsh.replace(/-/g, "")}/${file}` : "https://www.sec.gov",
        source: "SEC EDGAR",
        date: typeof s.file_date === "string" ? s.file_date : undefined,
      };
    });
  },
};

export function getNewsProviders(): NewsProvider[] {
  return guruFocusApiKey() ? [guruFocusNews, edgarFilingsFeed] : [edgarFilingsFeed];
}

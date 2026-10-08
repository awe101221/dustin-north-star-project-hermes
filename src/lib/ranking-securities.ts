import { z } from "zod";
import reviewed from "./reviewed-ranking-securities.json";
import type { RankingDraft } from "./qqq-rankings";

export const rankingSecuritySchema = z.object({
  canonicalId: z.string().trim().toUpperCase().regex(/^(ISIN:[A-Z]{2}[A-Z0-9]{9}[0-9]|SEC:\d{10}:[A-Z0-9-]+)$/),
  ticker: z.string().trim().toUpperCase().min(1),
  identifiers: z.array(z.string().trim().toUpperCase().min(1)).min(1),
  tickerAliases: z.array(z.string().trim().toUpperCase().min(1)).min(1),
  evidenceUrls: z.array(z.url().refine((s) => new URL(s).protocol === "https:")).min(1),
}).strict();
export type RankingSecurity = z.infer<typeof rankingSecuritySchema>;

/** Only identifiers explicitly resolved by the reviewed master are admitted. */
export function rankingSecurityMaster(input: unknown = reviewed) {
  const records = z.array(rankingSecuritySchema).parse(input);
  const identifiers = new Map<string, RankingSecurity>();
  const tickers = new Map<string, RankingSecurity>();
  const canonicalTickers = new Map<string, string>();
  for (const record of records) {
    if (canonicalTickers.has(record.canonicalId) && canonicalTickers.get(record.canonicalId) !== record.ticker)
      throw new Error("Conflicting canonical security records");
    canonicalTickers.set(record.canonicalId, record.ticker);
    for (const [map, aliases] of [[identifiers, [record.canonicalId, ...record.identifiers]], [tickers, [record.ticker, ...record.tickerAliases]]] as const) {
      for (const alias of aliases) {
        const key = alias.toUpperCase();
        if (map.has(key) && map.get(key)!.canonicalId !== record.canonicalId) throw new Error("Ambiguous reviewed security alias");
        map.set(key, record);
      }
    }
  }
  return { records, identifiers, tickers };
}

/** Never infer a dossier's ranked instrument from a bare-symbol collision. */
export function rankingSecurityForTicker(ticker: string, input: unknown = reviewed): RankingSecurity | null {
  return rankingSecurityMaster(input).tickers.get(ticker.toUpperCase()) ?? null;
}

export function canonicalizeRankingSecurities(draft: RankingDraft, input: unknown = reviewed): RankingDraft {
  const { identifiers, tickers } = rankingSecurityMaster(input);
  const forecasts = draft.forecasts.map((f) => {
    const security = identifiers.get(f.securityId.toUpperCase());
    if (!security || tickers.get(f.ticker.toUpperCase())?.canonicalId !== security.canonicalId)
      throw new Error("Forecast security identity is unresolved in the reviewed security master");
    return { ...f, securityId: security.canonicalId };
  });
  if (new Set(forecasts.map((f) => f.securityId)).size !== forecasts.length) throw new Error("Duplicate canonical security in sleeve");
  return { ...draft, forecasts };
}

import { EvidencePending, type LadderEvaluation, type OperatingContract } from "./forecast-ladder";
import { MARKET_POLICY_VERSION, priceReturnEvidence, type HistoricalPriceProvider } from "./market-price-provider";

type Json = Record<string, unknown>;
const object = (v: unknown): Json => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : {};

/** First filed exact discrete quarter only; never substitute YTD, amended or restated facts. */
export function secObservation(raw: unknown, contract: Extract<OperatingContract, { kind: "sec_kpi" }>, today: string) {
  const root = object(raw);
  if (Number(root.cik) !== Number(contract.cik)) throw new EvidencePending("SEC entity mismatch");
  const facts = object(object(object(root.facts)[contract.taxonomy])[contract.concept]);
  const values = object(facts.units)[contract.unit];
  if (!Array.isArray(values)) throw new EvidencePending("Exact SEC concept/unit unavailable; evidence review required");
  const matches = values.map(object).filter((f) =>
    f.start === contract.period_start && f.end === contract.period_end &&
    typeof f.filed === "string" && f.filed <= today && f.filed >= contract.period_end &&
    ["10-Q", "10-K", "20-F", "40-F", "6-K"].includes(String(f.form)) &&
    typeof f.val === "number" && Number.isFinite(f.val) && /^\d{10}-\d{2}-\d{6}$/.test(String(f.accn)))
    .sort((a, b) => String(a.filed).localeCompare(String(b.filed)) || String(a.accn).localeCompare(String(b.accn)));
  if (!matches.length) throw new EvidencePending("Exact next-quarter SEC fact not published; keep open");
  const first = matches[0]!;
  if (matches.filter((f) => f.filed === first.filed).some((f) => f.val !== first.val)) throw new EvidencePending("Ambiguous SEC facts require evidence review");
  return {
    observation: { kind: "sec_kpi", value: first.val, period_start: contract.period_start, period_end: contract.period_end,
      unit: contract.unit, concept: contract.concept, cik: contract.cik, taxonomy: contract.taxonomy,
      filed: first.filed, accession: first.accn, provider: "sec-companyfacts" },
    evidence_urls: [`https://www.sec.gov/Archives/edgar/data/${Number(contract.cik)}/${String(first.accn).replaceAll("-", "")}/${first.accn}-index.html`,
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${contract.cik.padStart(10, "0")}.json`],
  };
}

export function createEvidenceProvider(config: { prices?: HistoricalPriceProvider; secUserAgent?: string }, request: typeof fetch = fetch, clock = () => new Date()) {
  // Promise cache is per sweep, never persistent across grading vintages.
  const cache = new Map<string, Promise<unknown>>();
  const read = (url: string, headers?: Record<string, string>) => {
    if (!cache.has(url)) cache.set(url, (async () => {
      try {
        const response = await request(url, { headers, redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" });
        if (!response.ok) throw new EvidencePending(`Evidence provider HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        // Fetch errors may embed API keys in URLs. Never propagate them to logs/UI.
        if (error instanceof EvidencePending) throw error;
        throw new EvidencePending("Evidence provider unavailable; retry next sweep");
      }
    })());
    return cache.get(url)!;
  };
  return async (forecast: LadderEvaluation, today = new Date().toISOString().slice(0, 10)) => {
    if (forecast.due_date >= today) throw new EvidencePending("Forecast not due");
    if (forecast.horizon !== "quarter") {
      if (!config.prices) throw new EvidencePending("Historical-price provider is not configured");
      if (forecast.measurement_policy !== MARKET_POLICY_VERSION) throw new EvidencePending("Forecast measurement policy not bound; evidence review required");
      const now = clock();
      if (now.toISOString().slice(0, 10) !== today) throw new EvidencePending("Grading clock and source-date cutoff disagree");
      return priceReturnEvidence(config.prices, forecast.ticker, forecast.start_date, forecast.due_date, now);
    }
    const contract = forecast.contract as OperatingContract;
    if (contract.kind === "milestone") throw new EvidencePending("Milestone needs an evidence-backed earnings/filing review; no automatic false on missing text");
    if (!config.secUserAgent) throw new EvidencePending("SEC_USER_AGENT contact identity is not configured");
    const raw = await read(`https://data.sec.gov/api/xbrl/companyfacts/CIK${contract.cik.padStart(10, "0")}.json`, { "User-Agent": config.secUserAgent });
    return secObservation(raw, contract, today);
  };
}

export async function gradeDueLadders(rows: LadderEvaluation[], provider: ReturnType<typeof createEvidenceProvider>,
  persist: (id: string, observation: Record<string, unknown>, evidence: string[]) => Promise<unknown>, today = new Date().toISOString().slice(0, 10)) {
  const results: Array<{ id: string; ticker: string; status: "graded" | "pending" | "failed"; reason?: string }> = [];
  for (const f of rows.filter((r) => !r.outcome_id && r.due_date < today)) {
    try {
      const evidence = await provider(f, today);
      await persist(f.id, evidence.observation, evidence.evidence_urls);
      results.push({ id: f.id, ticker: f.ticker, status: "graded" });
    } catch (e) {
      results.push({ id: f.id, ticker: f.ticker, status: e instanceof EvidencePending ? "pending" : "failed",
        reason: e instanceof EvidencePending ? e.message : "Outcome persistence failed; immutable replay is safe" });
    }
  }
  return results;
}

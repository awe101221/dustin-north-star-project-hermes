import { forecastLadderCreate } from "../forecast-ladder";

export function ladderFixture() {
  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const common = { probability: .6, confidence: .7, falsifier: "Reported revenue fails the threshold", evidence_urls: ["https://www.sec.gov/Archives/edgar/data/1/filing.htm"], assumption_ids: ["revenue"] };
  return forecastLadderCreate.parse({ run_id: "10000000-0000-4000-8000-000000000001", ticker: "MELI", model_version: "model-v1", thesis_key: "growth-continues",
    conclusion: "Growth creates alpha", change_reason: "Initial forward underwriting", ranking: { lane: "top-ten", rank: 1, qqq_decision: "above", reason: "Evidence-backed growth" },
    assumptions: [{ id: "revenue", claim: "Revenue grows", falsifier: common.falsifier, evidence_urls: common.evidence_urls }],
    market_90d: { ...common, expected_alpha: .03 }, market_12m: { ...common, expected_alpha: .08 },
    operating: { ...common, kind: "sec_kpi", label: "Next-quarter revenue", target: 100, operator: "gte", unit: "USD", cik: "1", taxonomy: "us-gaap", concept: "Revenues", period_start: day(15), period_end: day(105), due_date: day(150) },
  });
}

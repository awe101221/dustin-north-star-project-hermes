import { unwrap, type Db } from "./query";
import { ladderMetrics, type LadderEvaluation } from "../forecast-ladder";

export type LadderReview = { id: string; forecast_id: string; created_at: string; payload: { reviewer: string; failed_assumption_ids: string[]; finding: string; recommended_change: string; disposition: string; evidence_urls: string[] } };

export async function getForecastLearning(db: Db, ticker?: string) {
  const forecasts: LadderEvaluation[] = [];
  const reviews: LadderReview[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("hermes_ladder_evaluations").select("*").order("registered_at", { ascending: false }).order("id");
    if (ticker) query = query.eq("ticker", ticker.split(":").at(-1)!);
    const page = unwrap(await query.range(offset, offset + 999), "short-horizon forecasts") as LadderEvaluation[];
    forecasts.push(...page);
    if (page.length < 1000) break;
  }
  // Restrict ticker reads, chunking to keep PostgREST URLs bounded.
  const ids = forecasts.filter((f) => f.outcome_id).map((f) => f.id);
  for (let chunk = 0; chunk < ids.length; chunk += 100) {
    for (let offset = 0; ; offset += 1000) {
      const page = unwrap(await db.from("hermes_ladder_reviews").select("*").in("forecast_id", ids.slice(chunk, chunk + 100))
        .order("created_at", { ascending: false }).order("id").range(offset, offset + 999), "forecast reviews") as LadderReview[];
      reviews.push(...page);
      if (page.length < 1000) break;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const latest = unwrap(await db.from("hermes_notes").select("metadata").contains("tags", ["best-ideas-snapshot"])
    .order("occurred_at", { ascending: false }).order("id").limit(1), "learning ranking coverage") as Array<{ metadata: { bestIdeas?: { topTen?: Array<{ ticker: string }>; watchlistTen?: Array<{ ticker: string }> } } }>;
  const snapshot = latest[0]?.metadata.bestIdeas;
  const ranked = [...(snapshot?.topTen ?? []), ...(snapshot?.watchlistTen ?? [])].map((i) => i.ticker.split(":").at(-1)!);
  const missingTickers = ranked.filter((t) => (!ticker || t === ticker.split(":").at(-1)) && !forecasts.some((f) => f.ticker === t));
  const misses = forecasts.filter((f) => f.outcome_id && ((f.contract.probability >= .5) !== f.hit || (f.alpha !== null && (Number(f.alpha) < 0 || Number(f.absolute_error) >= .1))))
    .sort((a, b) => Number(b.brier) - Number(a.brier));
  return { forecasts, reviews, cohorts: ladderMetrics(forecasts), misses, missingTickers,
    due: forecasts.filter((f) => !f.outcome_id && f.due_date < today),
    unreviewed: misses.filter((f) => !reviews.some((r) => r.forecast_id === f.id)),
    feedback_policy: "Review evidenced assumption failures; propose versioned prompt/model experiments. No causal attribution from price alone; no automatic production prompt changes. Overlapping forecasts are not independent trials.",
  };
}

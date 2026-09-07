import { hermesClient } from "../lib/rest";
import { log } from "../lib/env";

/**
 * Prints row counts for every Hermes surface and the legacy tables it depends
 * on, plus a search smoke test. Run after migrations/seeds:  npm run db:verify
 */
async function main() {
  const db = hermesClient();
  const tables = [
    "hermes_mandate", "hermes_ideas", "hermes_idea_events", "hermes_notes", "hermes_trades", "hermes_performance_points", "hermes_knowledge", "hermes_quant_jobs", "hermes_agent_tasks", "hermes_activity",
    "analyst_memos", "analyst_personas", "analyst_project_artifacts", "investment_companies", "ibkr_positions", "ibkr_nav_history", "mission_benchmark", "master_recommendations", "tracked_13f_activity",
  ];
  const results: Array<{ table: string; rows: number | string }> = [];
  for (const table of tables) {
    try {
      const key = table === "hermes_performance_points" ? "select=observation_date" : table === "hermes_mandate" ? "select=id" : table === "analyst_personas" || table === "investment_companies" ? "select=ticker,slug" : table === "analyst_project_artifacts" ? "select=artifact_key" : table === "mission_benchmark" ? "select=as_of" : "select=id";
      results.push({ table, rows: await db.count(table, key.includes(",") ? (table === "analyst_personas" ? "select=slug" : "select=ticker") : key) });
    } catch (e) {
      results.push({ table, rows: `error: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}` });
    }
  }
  console.table(results);
  const views = ["hermes_research_stream", "hermes_positions_latest", "hermes_screener_universe", "hermes_benchmark_series", "hermes_decision_scorecard", "hermes_persona_catalog"];
  for (const v of views) {
    const rows = await db.select(v, "select=*&limit=1");
    log(`${v}: ${rows.length ? "ok" : "empty"}`);
  }
  const hits = await db.rpc<Array<{ title: string; ticker: string }>>("hermes_search_research", { q: "advanced packaging", lim: 3 });
  log(`search smoke: ${hits.map((h) => `${h.title} (${h.ticker})`).join(" | ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

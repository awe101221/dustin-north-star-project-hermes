import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { hermesClient } from "../lib/rest";
import { loadEnv, optionalEnv } from "../lib/env";
import { bestIdeasSnapshotNote } from "../../src/lib/best-ideas";
import { bestIdeasSnapshotCreate } from "../../src/lib/server/schemas";
import { forecastLadderCreate, ladderReviewCreate, ladderMetrics, type LadderEvaluation } from "../../src/lib/forecast-ladder";
import { assertLadderRanking } from "../../src/lib/forecast-ranking";
import { createEvidenceProvider, gradeDueLadders } from "../../src/lib/forecast-evidence";

const args = process.argv.slice(2).filter((a) => a !== "--hermes-env");
const [command, ...rest] = args;
if (process.argv.includes("--hermes-env")) {
  // Opt-in protected local credentials, read only. Never write an env file or
  // expose credentials to the model. Canonical destination is guarded by Rest.
  const file = path.join(os.homedir(), ".hermes", ".env");
  const allowed = new Set(["SUPABASE_SERVICE_ROLE_KEY", "ALPHA_VANTAGE_API_KEY", "SEC_USER_AGENT"]);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || !allowed.has(match[1]!)) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[match[1]!] || /SENSITIVE/.test(process.env[match[1]!]!)) process.env[match[1]!] = value;
  }
}
loadEnv();
const db = hermesClient();
const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const fileJson = (file?: string) => {
  if (!file) throw new Error("JSON file path required");
  return JSON.parse(fs.readFileSync(file, "utf8"));
};
async function startRun(model: string, agent: string, externalKey: string, workflow = "weekday-10plus10-learning") {
  const promptBody = fs.readFileSync("docs/workflows/short-horizon-refresh.md", "utf8");
  const version = createHash("sha256").update(promptBody).digest("hex").slice(0, 16);
  const promptId = "short-horizon-refresh";
  // No upserts against immutable prompt history. Verify content on reuse.
  const prompts = await db.select<{ prompt_body: string }>("hermes_prompt_versions", `select=prompt_body&prompt_id=eq.${promptId}&version=eq.${version}`);
  if (prompts.length && prompts[0]!.prompt_body !== promptBody) throw new Error("Prompt hash collision");
  if (!prompts.length) await db.insert("hermes_prompt_versions", [{ prompt_id: promptId, version, role: "investment-forecast-learning", schema_version: "1", prompt_body: promptBody, description: "Evidence-backed forecast ladder and feedback contract" }]);
  const existing = await db.select<{ id: string; metadata: { model_version?: string }; prompt_version: string; agent_name: string }>("hermes_agent_runs", `select=id,metadata,prompt_version,agent_name&external_key=eq.${encodeURIComponent(externalKey)}`);
  if (existing.length) {
    const run = existing[0]!;
    if (run.metadata.model_version !== model || run.prompt_version !== version || run.agent_name !== agent) throw new Error("Run key already has different model/prompt/agent provenance");
    return run.id;
  }
  const rows = await db.insert<{ id: string }>("hermes_agent_runs", [{ workflow_id: workflow, workflow_version: "1", external_key: externalKey,
    prompt_id: promptId, prompt_version: version, agent_name: agent, status: "running", tools_used: [],
    metadata: { model_version: model }, input_ref: { contract: "docs/workflows/short-horizon-refresh.md" } }]);
  return rows[0]!.id;
}
async function main() {
  if (command === "start") {
    const [model, agent, externalKey] = rest;
    if (!model || !agent || !externalKey) throw new Error("start requires actual model version, agent name, and stable invocation key");
    return output({ run_id: await startRun(model, agent, externalKey) });
  }
  if (command === "publish") {
    const input = bestIdeasSnapshotCreate.parse(fileJson(rest[0]));
    if (input.topTen.length !== 10 || input.watchlistTen.length !== 10) throw new Error("Weekday learning refresh requires exactly 10 + 10");
    assertLadderRanking(input);
    const registered = [];
    for (const forecast of input.forecastLadders!) {
      const parsed = forecastLadderCreate.parse(forecast);
      registered.push(await db.rpc("hermes_register_forecast_ladder", { p_input: parsed }));
    }
    const runId = input.forecastLadders![0]!.run_id;
    // Snapshot replay is keyed by the immutable refresh run. Verify payload;
    // never overwrite a publication to make a conflicting retry succeed.
    const note = bestIdeasSnapshotNote(input, input.actor);
    const publication = await db.rpc<{ note: { id: string }; replay: boolean }>("hermes_publish_learning_snapshot", { p_run_id: runId, p_note: note });
    return output({ note_id: publication.note.id, registered, replay: publication.replay });
  }
  if (command === "grade") {
    const forecasts = await db.selectAll<LadderEvaluation>("hermes_ladder_evaluations", "select=*&outcome_id=is.null&order=due_date.asc,id.asc");
    const runId = await startRun("deterministic-evidence-grader-v1", "hermes-outcome-grader", `ladder-grade:${new Date().toISOString()}`, "forecast-outcome-grading");
    const results = await gradeDueLadders(forecasts, createEvidenceProvider({ alphaVantageKey: optionalEnv("ALPHA_VANTAGE_API_KEY"), secUserAgent: optionalEnv("SEC_USER_AGENT") }),
      (id, observation, evidence) => db.rpc("hermes_grade_ladder", { p_forecast_id: id, p_observation: observation, p_evidence_urls: evidence }));
    await db.patch("hermes_agent_runs", `id=eq.${runId}`, { status: results.some((r) => r.status === "failed") ? "failed" : "succeeded", completed_at: "now",
      output_ref: { results, provider_ready: { adjusted_prices: !!optionalEnv("ALPHA_VANTAGE_API_KEY"), sec: !!optionalEnv("SEC_USER_AGENT") } }, metrics: { due: results.length, graded: results.filter((r) => r.status === "graded").length, pending: results.filter((r) => r.status === "pending").length } });
    output({ run_id: runId, results, provider_ready: { adjusted_prices: !!optionalEnv("ALPHA_VANTAGE_API_KEY"), sec: !!optionalEnv("SEC_USER_AGENT") } });
    if (results.some((r) => r.status === "failed")) process.exitCode = 1;
    return;
  }
  if (command === "feedback") {
    const ticker = rest[0]?.toUpperCase();
    if (ticker && !/^[A-Z][A-Z0-9.-]{0,19}$/.test(ticker)) throw new Error("Invalid ticker");
    const forecasts = await db.selectAll<LadderEvaluation>("hermes_ladder_evaluations", `select=*&order=registered_at.desc,id.asc${ticker ? `&ticker=eq.${ticker}` : ""}`);
    const reviews = await db.selectAll("hermes_ladder_reviews", "select=*&order=created_at.desc,id.asc");
    return output({ forecasts, reviews, cohorts: ladderMetrics(forecasts), policy: "Do not infer causality from price. Examine registered assumptions, evidence and prior reviews before the next conclusion. No trades or automatic prompt promotion." });
  }
  if (command === "review") return output(await db.rpc("hermes_review_ladder", { p_input: ladderReviewCreate.parse(fileJson(rest[0])) }));
  if (command === "resolve") {
    const input = fileJson(rest[0]);
    if (!/^[0-9a-f-]{36}$/i.test(input.forecast_id ?? "")) throw new Error("forecast_id required");
    return output(await db.rpc("hermes_grade_ladder", { p_forecast_id: input.forecast_id, p_observation: input.observation, p_evidence_urls: input.evidence_urls }));
  }
  if (command === "complete") {
    const [id, status] = rest;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !["succeeded", "failed"].includes(status ?? "")) throw new Error("complete requires run UUID and succeeded|failed");
    const runs = await db.select<{ status: string; workflow_id: string }>("hermes_agent_runs", `select=status,workflow_id&id=eq.${id}`);
    if (!runs[0]) throw new Error("Run not found");
    if (runs[0].status === status) return output({ run_id: id, status, replay: true });
    const checks = await db.select<{ ticker: string; created_ladder: boolean; payload: { market_90d: { evidence_urls: string[] }; market_12m: { evidence_urls: string[] }; operating: { evidence_urls: string[] } } }>("hermes_ladder_checks", `select=ticker,created_ladder,payload&run_id=eq.${id}`);
    const publications = await db.select<{ note_id: string }>("hermes_learning_publications", `select=note_id&run_id=eq.${id}`);
    if (status === "succeeded" && runs[0].workflow_id === "weekday-10plus10-learning" && (checks.length !== 20 || publications.length !== 1)) throw new Error("Refresh cannot complete without 20 checks and a verified publication");
    const sources = new Set(checks.flatMap((c) => [c.payload.market_90d, c.payload.market_12m, c.payload.operating].flatMap((f) => f.evidence_urls)));
    // PostgreSQL resolves its own clock; local host clock may be ahead of DB.
    await db.patch("hermes_agent_runs", `id=eq.${id}`, { status, completed_at: "now",
      output_ref: { note_id: publications[0]?.note_id ?? null, checked_tickers: checks.map((c) => c.ticker), evidence_urls: [...sources] },
      metrics: { checked: checks.length, output_source_count: sources.size, new_ladders: checks.filter((c) => c.created_ladder).length } });
    return output({ run_id: id, status });
  }
  throw new Error("Commands: start MODEL AGENT KEY | publish FILE | grade | feedback [TICKER] | review FILE | resolve FILE | complete UUID STATUS; optional --hermes-env");
}
main().catch((error) => {
  // REST errors can contain private database details. Keep output actionable but
  // sanitized; validation issues contain paths only, never supplied values.
  const restError = error instanceof Error ? error.message.match(/^PostgREST ([A-Z]+) ([a-zA-Z0-9_/]+) -> (\d+):/) : null;
  const code = error instanceof Error ? error.message.match(/"code":"([a-zA-Z0-9_]+)"/)?.[1] : undefined;
  console.error(restError ? `Learning ${restError[1]} ${restError[2]} failed (HTTP ${restError[3]}${code ? `, ${code}` : ""}); check configuration, run status and immutable replay payload.` : error instanceof Error ? error.message.slice(0, 600) : "Learning operation failed.");
  process.exitCode = 1;
});

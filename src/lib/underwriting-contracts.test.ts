import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("underwriting persistence contracts", () => {
  const migration = source("supabase/migrations/20260907000400_underwriting_graph_evaluation.sql");

  it("protects forecasts from direct mutation and keeps creation insert-only", () => {
    const route = source("src/app/api/agent/forecasts/route.ts");
    expect(route).toContain('.from("hermes_forecasts").insert(');
    expect(route).not.toContain('.from("hermes_forecasts").upsert(');
    expect(migration).toContain("hermes_protect_forecast_immutability");
    expect(migration).toMatch(/revoke\s+update,\s*delete\s+on\s+public\.hermes_forecasts\s+from\s+service_role/i);
    expect(migration).toMatch(/drop constraint if exists hermes_forecasts_forward_horizon_check[\s\S]*add constraint hermes_forecasts_forward_horizon_check[\s\S]*horizon_date > as_of::date/i);
    expect(migration).toMatch(/new\.as_of := pg_catalog\.(statement_timestamp|transaction_timestamp)\(\)/i);
  });

  it("rejects forecast attribution to terminal runs at the API and database boundaries", () => {
    const route = source("src/app/api/agent/forecasts/route.ts");
    const runLookup = route.indexOf('.from("hermes_agent_runs")');
    expect(runLookup).toBeGreaterThan(-1);
    expect(runLookup).toBeLessThan(route.indexOf('.from("hermes_forecasts").insert('));
    expect(route).toContain("Only queued or running agent runs can register forecasts.");
    expect(route).toMatch(/e instanceof DbError[\s\S]*e\.code === "55000"[\s\S]*Only queued or running agent runs can register forecasts/);
    expect(migration).toMatch(/tg_op = 'INSERT'[\s\S]*new\.agent_run_id is not null[\s\S]*from public\.hermes_agent_runs[\s\S]*status not in \('queued', 'running'\)[\s\S]*cannot register forecasts/i);
  });

  it("enforces one logical forecast independent of caller stable keys", () => {
    expect(migration).toMatch(/drop constraint if exists hermes_forecasts_stable_key_model_version_key/i);
    expect(migration).toMatch(/unique \(ticker, scenario, forecast_type, unit, model_version\)/i);
    expect(migration).toMatch(/on conflict \(ticker, scenario, forecast_type, unit, model_version\) do nothing/i);
  });

  it("grades cited due outcomes through one restricted transaction", () => {
    const route = source("src/app/api/agent/forecast-outcomes/route.ts");
    expect(route).toContain('.rpc("hermes_grade_forecast_outcome"');
    expect(migration).toContain("current_date < target.horizon_date");
    expect(migration).toMatch(/create or replace function public\.hermes_grade_forecast_outcome[\s\S]*security definer[\s\S]*set search_path = ''/i);
    expect(migration).toMatch(/revoke all on function public\.hermes_grade_forecast_outcome[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/p_observed_at\s*>\s*pg_catalog\.statement_timestamp\(\)/i);
    expect(migration).toContain("create or replace function public.hermes_is_valid_evidence_url");
    expect(migration).toContain("'^https://(");
    expect(migration).toMatch(/hermes_is_valid_evidence_url\(p_evidence_url\)[\s\S]*Outcome evidence URL/i);
  });

  it("replaces graph edges atomically through a restricted RPC", () => {
    const route = source("src/app/api/agent/underwriting/route.ts");
    expect(route).toContain('.rpc("hermes_replace_underwriting_graph"');
    expect(route).toContain("p_forecasts: null");
    expect(migration).toMatch(/NULL is an explicit graph-only replay sentinel/i);
    expect(migration).toMatch(/create or replace function public\.hermes_replace_underwriting_graph[\s\S]*security definer[\s\S]*set search_path = ''/i);
    expect(migration).not.toMatch(/on conflict \(stable_key, as_of\) do update/i);
    expect(migration).toMatch(/Underwriting node version conflicts with immutable history/i);
    expect(migration).toMatch(/on conflict \(stable_key, as_of\) do nothing/i);
  });

  it("serializes logical node ownership and verifies it before writing edges", () => {
    const lock = migration.indexOf("pg_advisory_xact_lock");
    const insert = migration.indexOf("insert into public.hermes_underwriting_nodes", migration.indexOf("hermes_replace_underwriting_graph"));
    const ownership = migration.indexOf("Every submitted underwriting node must belong to the submitting agent run");
    const edgeInsert = migration.indexOf("insert into public.hermes_underwriting_edges", insert);

    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(insert);
    expect(ownership).toBeGreaterThan(insert);
    expect(ownership).toBeLessThan(edgeInsert);
  });

  it("serializes canonical forecast identities and proves ownership before edge completion", () => {
    const rpc = migration.slice(migration.indexOf("create or replace function public.hermes_replace_underwriting_graph"));
    const lock = rpc.indexOf("Serialize every submitted logical forecast identity in canonical order");
    const conflictCheck = rpc.indexOf("Forecast conflicts with immutable logical forecast history");
    const insert = rpc.indexOf("insert into public.hermes_forecasts");
    const ownership = rpc.indexOf("Every submitted forecast must exactly match immutable content and belong to the submitting agent run");
    const edgeInsert = rpc.indexOf("insert into public.hermes_underwriting_edges");

    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(conflictCheck);
    expect(insert).toBeGreaterThan(conflictCheck);
    expect(ownership).toBeGreaterThan(insert);
    expect(ownership).toBeLessThan(edgeInsert);
  });

  it("rejects future graph and model publication instants inside the graph transaction", () => {
    expect(migration).toMatch(/jsonb_to_recordset\(p_nodes\)[\s\S]*as_of\s*>\s*pg_catalog\.statement_timestamp\(\)[\s\S]*future as_of/i);
    expect(migration).toMatch(/jsonb_to_recordset\(p_forecasts\)[\s\S]*model_version\s*>\s*pg_catalog\.statement_timestamp\(\)[\s\S]*future model_version/i);
  });

  it("rejects duplicate logical edges inside the graph RPC before persistence", () => {
    expect(migration).toMatch(/jsonb_to_recordset\(p_edges\)[\s\S]*group by edge\.from_key, edge\.to_key, edge\.relationship[\s\S]*having count\(\*\) > 1[\s\S]*Graph edges must be logically unique within a batch/i);
  });

  it("allows terminal runs to replay exact output but rejects every terminal mutation", () => {
    expect(migration).toMatch(/select status into run_status[\s\S]*from public\.hermes_agent_runs[\s\S]*for update/i);
    expect(migration).toMatch(/run_status in \('failed', 'cancelled'\)[\s\S]*cannot persist underwriting output/i);
    expect(migration).toMatch(/run_status = 'queued'[\s\S]*status = 'running'/i);
    expect(migration).toMatch(/run_status = 'succeeded'[\s\S]*Terminal agent run replay must exactly match persisted nodes/i);
    expect(migration).toContain("Terminal agent run replay must exactly match persisted edges");
    expect(migration).toContain("Terminal agent run replay must exactly match persisted forecasts");
  });

  it("stores immutable prompt bodies and derives their checksum from that content", () => {
    expect(migration).toContain("prompt_body text");
    expect(migration).toMatch(/digest\(new\.prompt_body,\s*'sha256'/i);
    expect(migration).toContain("hermes_protect_prompt_version");
    expect(migration).toMatch(/revoke\s+update,\s*delete\s+on\s+public\.hermes_prompt_versions\s+from\s+service_role/i);
    const route = source("src/app/api/agent/prompts/route.ts");
    expect(route).toContain('.from("hermes_prompt_versions").insert(');
    expect(route).not.toContain('.from("hermes_prompt_versions").upsert(');
    const seed = source("scripts/seed/seed-underwriting.ts");
    expect(seed).toContain("prompt_body:");
    expect(seed).toMatch(/db\.select<[\s\S]*?>\([\s\S]*?"hermes_prompt_versions"/);
    expect(seed).toContain('db.insert("hermes_prompt_versions"');
    expect(seed).not.toContain("contentStored: false");
    expect(seed).toContain("select=prompt_id,version,role,schema_version,prompt_body,content_sha256,status,description,metadata");
    expect(seed).toContain("assertExactPromptContract(existing[0]!, prompt)");
    const seedPromptContracts = source("scripts/seed/seed-prompt-contracts.ts");
    expect(seedPromptContracts).toContain("Existing prompt version does not match expected immutable contract");
    expect(seedPromptContracts).toContain("isDeepStrictEqual(existing.metadata, expected.metadata)");
    for (const body of [
      "Refresh current prices and source evidence, reconcile every active 10 + 10 company with its model, compare each conclusion with QQQ, preserve falsifiers, and publish one canonical ranked Top 10 plus Watchlist 10 snapshot. Do not authorize or place trades.",
      "Produce a source-backed five-year company underwriting with explicit Bear, Base, and Bull revenue growth, margin, exit-multiple, target-price, and annualized-return assumptions. State probability, risks, monitoring tests, data limitations, and the QQQ opportunity-cost hurdle. Do not rewrite a forecast after it is registered.",
      "Review the active thesis and identify specific source-verifiable evidence that could invalidate each material assumption, impair the downside case, or make QQQ the better default. Keep falsifiers distinct from blended conviction scores.",
      "After a forecast horizon has been reached, record the realized value, realized QQQ comparator when applicable, binary outcome when applicable, and a required evidence URL. Preserve the original forecast and close it atomically. Never grade a forecast early.",
    ]) {
      expect(migration).toContain(body);
    }
    expect(migration).toMatch(/update public\.hermes_prompt_versions[\s\S]*content_sha256 = encode\((?:extensions\.)?digest\(repaired\.prompt_body, 'sha256'\), 'hex'\)[\s\S]*create trigger hermes_prompt_versions_protect/i);
  });

  it("keeps confidential underwriting reads behind the app gate and a server-only privileged client", () => {
    const serverClient = source("src/lib/supabase/server.ts");
    expect(serverClient).toContain('import "server-only"');
    const publicReadFactory = serverClient.slice(
      serverClient.indexOf("export function serverReadClient"),
      serverClient.indexOf("export function underwritingReadClient"),
    );
    expect(publicReadFactory).toContain("publicSupabaseKey()");
    expect(publicReadFactory).not.toContain("serviceRoleKey()");
    expect(serverClient).toMatch(/underwritingReadClient[\s\S]*serviceRoleKey\(\)/);
    expect(source("src/lib/supabase/public.ts")).not.toContain("serviceRoleKey");
    for (const pagePath of [
      "src/app/companies/[ticker]/page.tsx",
      "src/app/evaluation/page.tsx",
      "src/app/system/page.tsx",
    ]) {
      expect(source(pagePath)).toContain("underwritingReadClient()");
    }
    const proxy = source("src/proxy.ts");
    expect(proxy).toContain("verifyCookie(");
    expect(proxy).not.toMatch(/PUBLIC_PATHS[^\n]*(companies|evaluation|system)/);
    for (const routePath of [
      "src/app/api/agent/prompts/route.ts",
      "src/app/api/agent/runs/route.ts",
      "src/app/api/agent/forecasts/route.ts",
      "src/app/api/agent/underwriting/route.ts",
    ]) {
      expect(source(routePath)).toContain("withAgent(");
    }
  });

  it("uses the seed-only atomic completion RPC and never separately patches success", () => {
    const seed = source("scripts/seed/seed-underwriting.ts");
    expect(seed).toContain("hermesClient()");
    expect(seed).not.toContain("createClient(");
    expect(seed).toContain('status: "running"');
    expect(seed).toContain("persistUnderwritingSeedOutput");
    expect(seed).toContain("p_forecasts: forecastRows");
    expect(seed).not.toContain('.from("hermes_forecasts").upsert(');
    expect(seed).not.toMatch(/upsert[\s\S]*hermes_agent_runs/i);
    expect(migration).toMatch(/insert into public\.hermes_forecasts[\s\S]*on conflict \(ticker, scenario, forecast_type, unit, model_version\) do nothing/i);
    expect(seed).not.toMatch(/db\.patch\([\s\S]*?status:\s*"succeeded"/);
    expect(seed).toContain('existingRun.status === "queued"');
    expect(seed).toContain('existingRun.status === "running"');
    expect(seed).toContain('existingRun.status === "succeeded"');
    expect(seed).toContain("Cannot seed underwriting output through terminal run");
    expect(migration).toMatch(/create or replace function public\.hermes_complete_underwriting_seed[\s\S]*security definer[\s\S]*status = 'succeeded'/i);
  });

  it("protects run provenance and valid lifecycle transitions in the database", () => {
    expect(migration).toContain("hermes_protect_agent_run");
    expect(migration).toMatch(/old\.status = 'queued' and new\.status in \('running', 'cancelled'\)/i);
    expect(migration).toMatch(/old\.status = 'running' and new\.status in \('succeeded', 'failed', 'cancelled'\)/i);
    expect(migration).toContain("Agent run provenance is immutable");
    expect(migration).toMatch(/tg_op = 'INSERT'[\s\S]*new\.status not in \('queued', 'running'\)/i);
    expect(migration).toContain("hermes_agent_runs_prompt_provenance_pair_check");
    expect(migration).toMatch(/prompt_id is null[\s\S]*prompt_version is null/i);
    expect(migration).toMatch(/tg_op = 'INSERT'[\s\S]*new\.started_at[\s\S]*statement_timestamp\(\)[\s\S]*cannot use a non-finite or future started_at/i);
    expect(migration).toMatch(/new\.completed_at[\s\S]*old\.started_at[\s\S]*statement_timestamp\(\)[\s\S]*valid finite completion timestamp/i);
  });

  it("uses full forecast identity for rendered company rows", () => {
    const graph = source("src/components/companies/company-underwriting-graph.tsx");
    expect(graph).toContain("forecastRegistryKey(forecast)");
  });

  it("maps run-update lifecycle failures to deterministic client responses", () => {
    const route = source("src/app/api/agent/runs/[id]/route.ts");
    expect(route).toContain('e.code === "55000"');
    expect(route).toContain('e.code === "23514"');
    expect(route).toContain("Agent run not found.");
    expect(route).toMatch(/Agent run not found\."?,\s*404/);
  });

  it("loads complete evaluation collections and exposes unavailable sub-reads", () => {
    const query = source("src/lib/db/underwriting.ts");
    expect(query).toContain("fetchAllRows");
    expect(query).toContain(".range(");
    expect(query).not.toMatch(/hermes_forecast_evaluations"\)\.select\("\*"\)\.order\("as_of", \{ ascending: false \}\)\.limit\(5000\)/);
    const companyQuery = query.slice(query.indexOf("export async function getCompanyUnderwriting"), query.indexOf("export type EvaluationDashboard"));
    expect(companyQuery.match(/fetchAllRows/g)).toHaveLength(4);
    expect(companyQuery).toContain("fetchAllRowsByChunks");
    expect(companyQuery).not.toMatch(/\.limit\(/);
    const company = source("src/app/companies/[ticker]/page.tsx");
    expect(company).toContain("underwritingLoaded");
    expect(company).toContain('title="Underwriting record unavailable"');
    const evaluation = source("src/app/evaluation/page.tsx");
    expect(evaluation).toContain("decisionsLoaded");
    expect(evaluation).toContain('title="Legacy decision outcomes unavailable"');
    const graph = source("src/components/companies/company-underwriting-graph.tsx");
    expect(graph).toContain("Model scenario preview");
    expect(graph).toContain("not recorded");
  });

  it("paginates every agent list with validated offsets and explicit completeness metadata", () => {
    for (const routePath of [
      "src/app/api/agent/prompts/route.ts",
      "src/app/api/agent/runs/route.ts",
      "src/app/api/agent/forecasts/route.ts",
    ]) {
      const route = source(routePath);
      expect(route).toContain("parseQuery(");
      expect(route).toContain(".range(");
      expect(route).toContain("pagination:");
      expect(route).toContain("has_more");
    }
    const runRoute = source("src/app/api/agent/runs/[id]/route.ts");
    expect(runRoute).toContain("runIdParams.safeParse(params)");
    expect(runRoute.indexOf("runIdParams.safeParse(params)")).toBeLessThan(runRoute.indexOf('.from("hermes_agent_runs")'));
  });

  it("keeps system loading recoverable and includes the underwriting seed in migrate:all", () => {
    const page = source("src/app/system/page.tsx");
    expect(page).toContain("safeLoad(");
    expect(page).toContain("<ErrorPanel");
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["migrate:all"]).toContain("seed:underwriting");
  });
});
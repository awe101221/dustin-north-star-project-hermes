import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { acceptedEvidenceUrls, rejectedEvidenceUrls, reservedEvidenceUrls } from "@/lib/test-fixtures/evidence-url-matrix";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260907000400_underwriting_graph_evaluation.sql"),
  "utf8",
);

const runIds = {
  running: "10000000-0000-4000-8000-000000000001",
  queued: "10000000-0000-4000-8000-000000000002",
  succeeded: "10000000-0000-4000-8000-000000000003",
  failed: "10000000-0000-4000-8000-000000000004",
  cancelled: "10000000-0000-4000-8000-000000000005",
  graph: "10000000-0000-4000-8000-000000000006",
  splitWorkflow: "10000000-0000-4000-8000-000000000007",
  rpcInfinity: "10000000-0000-4000-8000-000000000008",
  rpcNegativeInfinity: "10000000-0000-4000-8000-000000000009",
  futureNode: "10000000-0000-4000-8000-000000000010",
  futureModel: "10000000-0000-4000-8000-000000000011",
  futureOutcome: "10000000-0000-4000-8000-000000000012",
  unsafeOutcome: "10000000-0000-4000-8000-000000000013",
  ownerOne: "10000000-0000-4000-8000-000000000014",
  ownerTwo: "10000000-0000-4000-8000-000000000015",
  trimmedOutcome: "10000000-0000-4000-8000-000000000017",
  serviceNode: "10000000-0000-4000-8000-000000000018",
  serviceEdgeOne: "10000000-0000-4000-8000-000000000019",
  serviceEdgeTwo: "10000000-0000-4000-8000-000000000020",
  serviceRpc: "10000000-0000-4000-8000-000000000021",
  triggerEdgeOne: "10000000-0000-4000-8000-000000000022",
  triggerEdgeTwo: "10000000-0000-4000-8000-000000000023",
  duplicateForecast: "10000000-0000-4000-8000-000000000024",
  atomicSuccess: "10000000-0000-4000-8000-000000000025",
  atomicFailure: "10000000-0000-4000-8000-000000000026",
  validUntilRpcEarlier: "10000000-0000-4000-8000-000000000027",
  validUntilRpcInfinity: "10000000-0000-4000-8000-000000000028",
  validUntilRpcNegativeInfinity: "10000000-0000-4000-8000-000000000029",
  validUntilRpcPositive: "10000000-0000-4000-8000-000000000030",
  promptProvenance: "10000000-0000-4000-8000-000000000032",
  partialPromptProvenance: "10000000-0000-4000-8000-000000000033",
  clockSemantics: "10000000-0000-4000-8000-000000000034",
  seedNullActive: "10000000-0000-4000-8000-000000000035",
  seedNullTerminal: "10000000-0000-4000-8000-000000000036",
  seedForecastObject: "10000000-0000-4000-8000-000000000037",
  seedForecastScalar: "10000000-0000-4000-8000-000000000038",
  seedForecastEmpty: "10000000-0000-4000-8000-000000000039",
  seedForecastJsonNull: "10000000-0000-4000-8000-000000000040",
} as const;

const historicalNullProvenanceSeedRunId = "1e48faa4-20e5-4a0d-b155-c3e13762b36d";
const currentSeedTickers = [
  "MELI", "NU", "META", "GOOGL", "APPF", "ACN", "CRDO", "TCEHY", "ANET", "TSM",
  "VRT", "AMKR", "MU", "CAMT", "MRVL", "ASML", "ONTO", "FORM", "GEV", "RXRX",
];
const currentSeedPrompt = { prompt_id: "company-underwrite", prompt_version: "1.0.0" };
const currentSeedRunContract = {
  externalKey: "company-model-registry-import:2026-09-07T20:55:00.000Z",
  workflowId: "company-model-registry-import",
  workflowVersion: "1.0.0",
  agentName: "hermes-pm",
  toolsUsed: ["Yahoo Finance", "FinanceToolkit", "Hermes scenario drafting"],
  sourceCount: 2,
  inputRef: { file: "src/lib/company-models.ts", tickers: currentSeedTickers },
  metadata: { seed: true, provisionalResearch: true, tickers: currentSeedTickers },
} as const;

function seedCompletionPayload(prefix: string, ticker: string) {
  return {
    nodes: [{
      stable_key: `${prefix}:company`,
      node_type: "company",
      ticker,
      title: ticker,
      as_of: "2008-01-01T00:00:00Z",
    }],
    edges: [],
    forecasts: [{
      stable_key: `${prefix}:forecast`,
      ticker,
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: 0.14,
      model_version: "2008-01-01T00:00:00Z",
    }],
    outputRef: { tables: ["hermes_underwriting_nodes", "hermes_underwriting_edges", "hermes_forecasts"] },
    metrics: { companies: 1, graphNodes: 1, graphEdges: 0, forecastsExpected: 1 },
  };
}

function attributedSeedCompletionPayload(prefix: string, ticker: string) {
  const payload = seedCompletionPayload(prefix, ticker);
  return {
    ...payload,
    nodes: payload.nodes.map((node) => ({ ...node, ...currentSeedPrompt })),
    forecasts: payload.forecasts.map((forecast) => ({ ...forecast, ...currentSeedPrompt })),
  };
}

async function createSeedCompletionRpcDb(options: {
  runId?: string;
  status?: "queued" | "running";
} = {}) {
  const seedDb = new PGlite({ extensions: { pgcrypto } });
  await seedDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await seedDb.exec(migration);
  await seedDb.exec(migration);
  await seedDb.query(
    `insert into public.hermes_prompt_versions (
       prompt_id, version, role, schema_version, prompt_body
     ) values ('company-underwrite', '1.0.0', 'Company analyst', 'company-model-v1',
       'Current company underwriting prompt fixture.')`,
  );
  await seedDb.query(
    `insert into public.hermes_agent_runs (
       id, external_key, workflow_id, workflow_version, prompt_id, prompt_version,
       agent_name, status, ticker, task_id, tools_used, source_count, input_ref, metadata
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, null, null, $9, $10, $11::jsonb, $12::jsonb)`,
    [
      options.runId ?? "1f000000-0000-4000-8000-000000000001",
      currentSeedRunContract.externalKey,
      currentSeedRunContract.workflowId,
      currentSeedRunContract.workflowVersion,
      currentSeedPrompt.prompt_id,
      currentSeedPrompt.prompt_version,
      currentSeedRunContract.agentName,
      options.status ?? "running",
      [...currentSeedRunContract.toolsUsed],
      currentSeedRunContract.sourceCount,
      JSON.stringify(currentSeedRunContract.inputRef),
      JSON.stringify(currentSeedRunContract.metadata),
    ],
  );
  return seedDb;
}

async function seedCompletionState(db: PGlite, agentRunId: string) {
  return db.query(
    `select runs.status, runs.completed_at::text, runs.updated_at::text,
            runs.output_ref, runs.metrics,
            (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = runs.id) as nodes,
            (select count(*)::int from public.hermes_underwriting_edges where agent_run_id = runs.id) as edges,
            (select count(*)::int from public.hermes_forecasts where agent_run_id = runs.id) as forecasts
     from public.hermes_agent_runs runs where runs.id = $1`,
    [agentRunId],
  );
}

async function insertForecast(db: PGlite, stableKey: string, agentRunId: string | null, modelVersion: string) {
  return db.query(
    `insert into public.hermes_forecasts (
       stable_key, ticker, scenario, forecast_type, horizon_date,
       predicted_value, agent_run_id, model_version
     ) values ($1, 'MU', 'Base', 'annualized_return', '2099-01-01', 0.14, $2, $3)`,
    [stableKey, agentRunId, modelVersion],
  );
}

async function makeDueForecast(db: PGlite, stableKey: string, agentRunId: string, modelVersion: string) {
  const inserted = await db.query<{ id: string }>(
    `insert into public.hermes_forecasts (
       stable_key, ticker, scenario, forecast_type, horizon_date,
       predicted_value, agent_run_id, model_version
     ) values ($1, 'MU', 'Base', 'annualized_return', '2099-01-01', 0.14, $2, $3)
     returning id`,
    [stableKey, agentRunId, modelVersion],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("Forecast fixture was not inserted.");
  await db.exec("alter table public.hermes_forecasts disable trigger hermes_forecasts_protect_immutability");
  try {
    await db.query(
      `update public.hermes_forecasts
       set as_of = pg_catalog.statement_timestamp() - interval '2 days',
           horizon_date = current_date - 1
       where id = $1`,
      [id],
    );
  } finally {
    await db.exec("alter table public.hermes_forecasts enable trigger hermes_forecasts_protect_immutability");
  }
  return id;
}

async function createLegacyEquivalentInstantDb(options?: {
  conflictingForecast?: boolean;
  conflictingOutcome?: boolean;
  promptPairs?: "same" | "different";
  forecastAuditDifference?: boolean;
  outcomeAuditDifference?: boolean;
}) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  const secondPredictedValue = options?.conflictingForecast ? "0.19" : "0.14";
  const secondActualValue = options?.conflictingOutcome ? "0.18" : "0.12";
  const firstPrompt = options?.promptPairs
    ? "'legacy-prompt-one', '1.0.0'"
    : "null, null";
  const secondPrompt = options?.promptPairs === "different"
    ? "'legacy-prompt-two', '2.0.0'"
    : firstPrompt;
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
    create table public.hermes_prompt_versions (
      prompt_id text not null,
      version text not null,
      role text not null,
      schema_version text not null,
      prompt_body text not null,
      content_sha256 text not null,
      status text not null default 'active',
      description text,
      metadata jsonb not null default '{}'::jsonb,
      released_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (prompt_id, version)
    );
    insert into public.hermes_prompt_versions (
      prompt_id, version, role, schema_version, prompt_body, content_sha256
    ) values
      ('legacy-prompt-one', '1.0.0', 'Legacy one', 'legacy-v1', 'Legacy prompt one.',
       encode(extensions.digest('Legacy prompt one.', 'sha256'), 'hex')),
      ('legacy-prompt-two', '2.0.0', 'Legacy two', 'legacy-v2', 'Legacy prompt two.',
       encode(extensions.digest('Legacy prompt two.', 'sha256'), 'hex'));
    create table public.hermes_forecasts (
      id uuid primary key,
      stable_key text not null,
      ticker text not null,
      scenario text not null,
      forecast_type text not null,
      horizon_date date not null,
      probability numeric,
      predicted_value numeric not null,
      unit text not null default 'ratio',
      benchmark_symbol text not null default 'QQQ',
      benchmark_value numeric,
      agent_run_id uuid,
      prompt_id text,
      prompt_version text,
      model_version text not null,
      as_of timestamptz not null,
      status text not null default 'open',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      constraint hermes_forecasts_logical_identity_key
        unique (ticker, scenario, forecast_type, unit, model_version)
    );
    create table public.hermes_forecast_outcomes (
      id uuid primary key,
      forecast_id uuid not null references public.hermes_forecasts (id) on delete cascade,
      observed_at timestamptz not null,
      actual_value numeric not null,
      qqq_value numeric,
      outcome_occurred boolean,
      evidence_url text not null,
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null,
      unique (forecast_id, observed_at)
    );
    insert into public.hermes_forecasts (
      id, stable_key, ticker, scenario, forecast_type, horizon_date,
      probability, predicted_value, unit, benchmark_symbol, benchmark_value,
      agent_run_id, prompt_id, prompt_version, model_version, as_of, status,
      metadata, created_at, updated_at
    ) values
      (
        '20000000-0000-4000-8000-000000000001', 'legacy-equivalent', 'MU', 'Base',
        'annualized_return', '2026-09-08', 0.6, 0.14, 'ratio', 'QQQ', 0.1,
        null, ${firstPrompt}, '2026-09-07T00:00:00Z', '2026-09-07T01:00:00Z', 'graded',
        '{"source":"legacy"}'::jsonb, '2026-09-07T01:00:00Z', '2026-09-07T02:00:00Z'
      ),
      (
        '20000000-0000-4000-8000-000000000002', 'legacy-equivalent', 'MU', 'Base',
        'annualized_return', '2026-09-08', 0.6, ${secondPredictedValue}, 'ratio', 'QQQ', 0.1,
        null, ${secondPrompt}, '2026-09-06T19:00:00-05:00', '2026-09-07T01:00:00Z', 'graded',
        '{"source":"legacy"}'::jsonb, '2026-09-07T01:00:00Z',
        ${options?.forecastAuditDifference ? "'2026-09-07T02:00:01Z'" : "'2026-09-07T02:00:00Z'"}
      );
    insert into public.hermes_forecast_outcomes (
      id, forecast_id, observed_at, actual_value, qqq_value, outcome_occurred,
      evidence_url, notes, metadata, created_at
    ) values
      (
        '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        '2026-09-08T00:00:00Z', 0.12, 0.1, true, 'https://example.com/legacy-outcome',
        'Legacy grade', '{"grader":"legacy"}'::jsonb, '2026-09-08T01:00:00Z'
      ),
      (
        '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002',
        '2026-09-08T00:00:00Z', ${secondActualValue}, 0.1, true, 'https://example.com/legacy-outcome',
        'Legacy grade', '{"grader":"legacy"}'::jsonb,
        ${options?.outcomeAuditDifference ? "'2026-09-08T01:00:01Z'" : "'2026-09-08T01:00:00Z'"}
      ),
      (
        '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002',
        '2026-09-08T02:00:00Z', 0.13, 0.11, true, 'https://example.com/legacy-outcome-follow-up',
        'Legacy follow-up', '{"grader":"legacy"}'::jsonb, '2026-09-08T03:00:00Z'
      );
  `);
  return legacyDb;
}

async function createLegacyForecastReplayDb(options: {
  id: string;
  stableKey: string;
  modelVersion: string;
  horizonDate: string | null;
  asOf?: string;
  textModelVersion?: boolean;
}) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    create or replace function public.hermes_protect_prompt_version()
    returns trigger language plpgsql set search_path = '' as $sentinel$
    begin
      raise exception 'legacy prompt protection sentinel';
    end;
    $sentinel$;
    drop trigger if exists hermes_forecasts_protect_immutability
      on public.hermes_forecasts;
    alter table public.hermes_forecasts
      drop constraint if exists hermes_forecasts_forward_horizon_check;
    ${options.horizonDate === null
      ? "alter table public.hermes_forecasts alter column horizon_date drop not null;"
      : ""}
    ${options.textModelVersion
      ? `drop view public.hermes_forecast_evaluations;
         alter table public.hermes_forecasts
           drop constraint if exists hermes_forecasts_model_version_finite_check;
         alter table public.hermes_forecasts
           drop constraint if exists hermes_forecasts_model_version_as_of_check;
         alter table public.hermes_forecasts
           drop constraint if exists hermes_forecasts_logical_identity_key;
         alter table public.hermes_forecasts
           alter column model_version type text using model_version::text;
         alter table public.hermes_forecasts
           add constraint hermes_forecasts_logical_identity_key
           unique (ticker, scenario, forecast_type, unit, model_version);`
      : ""}
  `);
  await legacyDb.query(
    `insert into public.hermes_forecasts (
       id, stable_key, ticker, scenario, forecast_type, horizon_date,
       predicted_value, model_version, as_of
     ) values ($1, $2, 'LEGACY', 'Base', 'annualized_return', $3,
       0.14, $4, $5)`,
    [
      options.id,
      options.stableKey,
      options.horizonDate,
      options.modelVersion,
      options.asOf ?? "2020-01-02T12:00:00Z",
    ],
  );
  if (options.textModelVersion) {
    await legacyDb.exec(`
      create view public.hermes_forecast_evaluations as
      select id as forecast_id, stable_key from public.hermes_forecasts;
    `);
  }
  return legacyDb;
}

async function legacyForecastReplayState(db: PGlite, stableKey: string) {
  return db.query(
    `select
       (select row_to_json(forecast_state) from (
          select id, stable_key, model_version::text, horizon_date::text, as_of::text
          from public.hermes_forecasts where stable_key = $1
        ) forecast_state) as persisted_forecast,
       (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'hermes_forecasts'
          and column_name = 'model_version') as model_version_type,
       (select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'hermes_forecasts'
          and column_name = 'horizon_date') as horizon_date_nullable,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_forecasts'::regclass) as forecast_constraints,
       pg_catalog.pg_get_viewdef('public.hermes_forecast_evaluations'::regclass, true)
         as forecast_evaluation_view,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_prompt_version()'::regprocedure
       ) as prompt_protection_function,
       (select array_agg(tgname order by tgname)
        from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_forecasts'::regclass
          and not tgisinternal) as forecast_triggers`,
    [stableKey],
  );
}

async function createPromptReplayDb() {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    drop trigger if exists hermes_prompt_versions_protect on public.hermes_prompt_versions;
    drop trigger if exists hermes_prompt_versions_hash_body on public.hermes_prompt_versions;
    alter table public.hermes_prompt_versions alter column prompt_body drop not null;
    alter table public.hermes_prompt_versions alter column content_sha256 drop not null;
    alter table public.hermes_prompt_versions drop constraint if exists hermes_prompt_versions_content_hash_check;
  `);
  return legacyDb;
}

async function createOutcomeTimestampUpgradeDb(observedAt: string) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  const runId = "70000000-0000-4000-8000-000000000001";
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    alter table public.hermes_forecast_outcomes
      drop constraint if exists hermes_forecast_outcomes_observed_at_valid_check;
    drop trigger if exists hermes_forecast_outcomes_validate_insert
      on public.hermes_forecast_outcomes;
  `);
  await legacyDb.query(
    `insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status)
     values ($1, 'legacy-outcome-timestamp', '1.0.0', 'vitest', 'running')`,
    [runId],
  );
  const forecastId = await makeDueForecast(
    legacyDb,
    "legacy-outcome-timestamp",
    runId,
    "2009-03-01T00:00:00Z",
  );
  await legacyDb.query(
    `insert into public.hermes_forecast_outcomes (
       forecast_id, observed_at, actual_value, qqq_value, evidence_url
     ) values ($1, $2, 0.11, 0.1, 'https://example.com/outcome')`,
    [forecastId, observedAt],
  );
  return legacyDb;
}

async function createEvidenceUrlUpgradeDb(evidenceUrl: string) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  const runId = "70000000-0000-4000-8000-000000000003";
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    drop trigger if exists hermes_forecast_outcomes_validate_insert
      on public.hermes_forecast_outcomes;
    alter table public.hermes_forecast_outcomes
      drop constraint if exists hermes_forecast_outcomes_evidence_url_fqdn_check;
    create or replace function public.hermes_is_valid_evidence_url(value text)
    returns boolean language sql immutable strict set search_path = '' as $$
      select true
    $$;
  `);
  await legacyDb.query(
    `insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status)
     values ($1, 'legacy-evidence-url', '1.0.0', 'vitest', 'running')`,
    [runId],
  );
  const forecastId = await makeDueForecast(
    legacyDb,
    "legacy-evidence-url",
    runId,
    "2009-03-02T00:00:00Z",
  );
  await legacyDb.query(
    `insert into public.hermes_forecast_outcomes (
       id, forecast_id, observed_at, actual_value, evidence_url
     ) values (
       '76000000-0000-4000-8000-000000000001', $1,
       pg_catalog.statement_timestamp() - interval '1 minute', 0.11, $2
     )`,
    [forecastId, evidenceUrl],
  );
  return legacyDb;
}

async function evidenceUrlUpgradeState(db: PGlite) {
  return db.query<{
    outcome: Record<string, unknown>;
    validator: string;
    constraint_definition: string | null;
    constraint_validated: boolean | null;
    prompt_hash_constraint_count: number;
  }>(
    `select
       (select row_to_json(o) from (
          select id, forecast_id, evidence_url
          from public.hermes_forecast_outcomes
          where id = '76000000-0000-4000-8000-000000000001'
        ) o) as outcome,
       pg_catalog.pg_get_functiondef(
         'public.hermes_is_valid_evidence_url(text)'::regprocedure
       ) as validator,
       (select pg_catalog.pg_get_constraintdef(oid)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_forecast_outcomes'::regclass
          and conname = 'hermes_forecast_outcomes_evidence_url_fqdn_check') as constraint_definition,
       (select convalidated
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_forecast_outcomes'::regclass
          and conname = 'hermes_forecast_outcomes_evidence_url_fqdn_check') as constraint_validated,
       (select count(*)::int
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_prompt_versions'::regclass
          and conname = 'hermes_prompt_versions_content_hash_check') as prompt_hash_constraint_count`,
  );
}

async function createGraphTimestampUpgradeDb(asOf: string) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  const runId = "70000000-0000-4000-8000-000000000002";
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    alter table public.hermes_underwriting_nodes
      drop constraint if exists hermes_underwriting_nodes_as_of_valid_check;
    drop trigger if exists hermes_underwriting_nodes_validate_insert
      on public.hermes_underwriting_nodes;
  `);
  await legacyDb.query(
    `insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status)
     values ($1, 'legacy-graph-timestamp', '1.0.0', 'vitest', 'running')`,
    [runId],
  );
  await legacyDb.query(
    `insert into public.hermes_underwriting_nodes (
       stable_key, node_type, title, as_of, agent_run_id
     ) values ('legacy-graph-timestamp', 'company', 'Legacy graph', $1, $2)`,
    [asOf, runId],
  );
  return legacyDb;
}

async function createGraphValidUntilUpgradeDb(validUntilSql: string) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    alter table public.hermes_underwriting_nodes
      drop constraint if exists hermes_underwriting_nodes_valid_until_valid_check;
    drop trigger if exists hermes_underwriting_nodes_validate_insert
      on public.hermes_underwriting_nodes;
    create or replace function public.hermes_validate_underwriting_node_insert()
    returns trigger language plpgsql set search_path = '' as $$
    begin
      raise exception 'legacy graph validation sentinel' using errcode = '55000';
    end;
    $$;
    insert into public.hermes_agent_runs (
      id, workflow_id, workflow_version, agent_name, status
    ) values (
      '74000000-0000-4000-8000-000000000001',
      'legacy-graph-valid-until', '1.0.0', 'vitest', 'running'
    );
    insert into public.hermes_underwriting_nodes (
      id, stable_key, node_type, title, as_of, valid_until, agent_run_id
    ) values (
      '75000000-0000-4000-8000-000000000001',
      'legacy-graph-valid-until', 'company', 'Legacy graph validity',
      '2009-05-01T00:00:00Z', ${validUntilSql},
      '74000000-0000-4000-8000-000000000001'
    );
  `);
  return legacyDb;
}

async function graphValidUntilSchemaState(db: PGlite) {
  return db.query(
    `select
       (select row_to_json(node_state) from (
          select id, stable_key, as_of::text, valid_until::text
          from public.hermes_underwriting_nodes
          where id = '75000000-0000-4000-8000-000000000001'
        ) node_state) as persisted_node,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_underwriting_nodes'::regclass) as node_constraints,
       pg_catalog.pg_get_functiondef(
         'public.hermes_validate_underwriting_node_insert()'::regprocedure
       ) as node_validation_function,
       pg_catalog.pg_get_functiondef(
         'public.hermes_replace_underwriting_graph(uuid,jsonb,jsonb,jsonb)'::regprocedure
       ) as graph_rpc_function,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_underwriting_nodes'::regclass
          and tgname = 'hermes_underwriting_nodes_validate_insert'
          and not tgisinternal) as node_validation_triggers`,
  );
}

type RegistrationTimestampTarget = "agent-run-started-at" | "forecast-as-of";
type InvalidRegistrationTimestamp = "future" | "non-finite";

async function createRegistrationTimestampUpgradeDb(
  target: RegistrationTimestampTarget,
  invalidTimestamp: InvalidRegistrationTimestamp,
) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  const timestampSql = invalidTimestamp === "future"
    ? "pg_catalog.statement_timestamp() + interval '1 year'"
    : "'infinity'::timestamptz";
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;
    drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;
    alter table public.hermes_agent_runs
      drop constraint if exists hermes_agent_runs_started_at_valid_check;
    alter table public.hermes_agent_runs
      drop constraint if exists hermes_agent_runs_registration_chronology_check;
    alter table public.hermes_forecasts
      drop constraint if exists hermes_forecasts_as_of_valid_check;
    alter table public.hermes_forecasts
      drop constraint if exists hermes_forecasts_forward_horizon_check;
  `);

  if (target === "agent-run-started-at") {
    await legacyDb.exec(`
      insert into public.hermes_agent_runs (
        id, workflow_id, workflow_version, agent_name, status, started_at
      ) values (
        '71000000-0000-4000-8000-000000000001',
        'legacy-invalid-started-at', '1.0.0', 'vitest', 'running', ${timestampSql}
      );
    `);
  } else {
    await legacyDb.exec(`
      insert into public.hermes_forecasts (
        id, stable_key, ticker, scenario, forecast_type, horizon_date,
        predicted_value, model_version, as_of
      ) values (
        '72000000-0000-4000-8000-000000000001',
        'legacy-invalid-forecast-as-of', 'MU', 'Base', 'annualized_return',
        '2099-01-01', 0.14, '2020-01-01T00:00:00Z', ${timestampSql}
      );
    `);
  }
  return legacyDb;
}

async function registrationTimestampSchemaState(db: PGlite, target: RegistrationTimestampTarget) {
  const table = target === "agent-run-started-at" ? "hermes_agent_runs" : "hermes_forecasts";
  const identityColumn = target === "agent-run-started-at" ? "workflow_id" : "stable_key";
  const timestampColumn = target === "agent-run-started-at" ? "started_at" : "as_of";
  return db.query(
    `select
       (select ${timestampColumn}::text from public.${table}
        where ${identityColumn} = $1) as persisted_timestamp,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_agent_runs'::regclass) as run_constraints,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_forecasts'::regclass) as forecast_constraints,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_agent_run()'::regprocedure
       ) as run_protection_function,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_forecast_immutability()'::regprocedure
       ) as forecast_protection_function,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_prompt_versions'::regclass
          and tgname = 'hermes_prompt_versions_protect' and not tgisinternal) as prompt_protection_triggers,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_agent_runs'::regclass
          and tgname = 'hermes_agent_runs_protect' and not tgisinternal) as run_protection_triggers,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_forecasts'::regclass
          and tgname = 'hermes_forecasts_protect_immutability' and not tgisinternal) as forecast_protection_triggers`,
    [target === "agent-run-started-at" ? "legacy-invalid-started-at" : "legacy-invalid-forecast-as-of"],
  );
}

async function createForecastPublicationChronologyUpgradeDb() {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    drop trigger hermes_forecasts_protect_immutability on public.hermes_forecasts;
    alter table public.hermes_forecasts
      drop constraint if exists hermes_forecasts_model_version_as_of_check;
    insert into public.hermes_forecasts (
      id, stable_key, ticker, scenario, forecast_type, horizon_date,
      predicted_value, model_version, as_of, created_at, updated_at
    ) values (
      '89800000-0000-4000-8000-000000000001',
      'legacy-model-after-as-of', 'CROSS', 'Base', 'annualized_return',
      '2099-01-01', 0.14, '2006-01-02T00:00:00Z',
      '2006-01-01T00:00:00Z', '2006-01-03T00:00:00Z', '2006-01-03T00:00:00Z'
    );
  `);
  return legacyDb;
}

async function forecastPublicationChronologyState(db: PGlite) {
  return db.query(
    `select
       (select row_to_json(persisted) from (
          select id, stable_key, model_version::text, as_of::text, created_at::text, updated_at::text
          from public.hermes_forecasts
          where id = '89800000-0000-4000-8000-000000000001'
        ) persisted) as persisted_row,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_forecasts'::regclass) as constraints,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_forecast_immutability()'::regprocedure
       ) as protection_function,
       (select array_agg(tgname order by tgname)
        from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_forecasts'::regclass
          and not tgisinternal) as triggers`,
  );
}

async function createLegacyQueuedRunChronologyReplayDb() {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    drop trigger hermes_agent_runs_protect on public.hermes_agent_runs;
    alter table public.hermes_agent_runs
      drop constraint if exists hermes_agent_runs_registration_chronology_check;
    insert into public.hermes_agent_runs (
      id, workflow_id, workflow_version, external_key, agent_name, status,
      started_at, completed_at, metadata, created_at, updated_at
    ) values (
      '1e48faa4-20e5-4a0d-b155-c3e13762b36d',
      'company-model-registry-import', '1.0.0',
      'company-model-registry-import:2026-09-07T20:55:00.000Z',
      'hermes-seed', 'succeeded',
      '2026-09-08T00:17:00Z', '2026-09-08T00:17:05Z',
      '{"seed":true}'::jsonb,
      '2026-09-07T22:47:00Z', '2026-09-08T00:17:05Z'
    );
  `);
  return legacyDb;
}

type AuditOrderingTarget = "prompt" | "run" | "node" | "forecast";

const auditOrderingTargets: AuditOrderingTarget[] = ["prompt", "run", "node", "forecast"];

const auditOrderingIdentity = {
  prompt: "legacy-audit-order@1.0.0",
  run: "89710000-0000-4000-8000-000000000001",
  node: "89710000-0000-4000-8000-000000000002",
  forecast: "89710000-0000-4000-8000-000000000003",
} as const;

const auditOrderingTable = {
  prompt: "hermes_prompt_versions",
  run: "hermes_agent_runs",
  node: "hermes_underwriting_nodes",
  forecast: "hermes_forecasts",
} as const;

async function createAuditOrderingUpgradeDb(target: AuditOrderingTarget) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  const table = auditOrderingTable[target];
  await legacyDb.exec(`
    alter table public.${table}
      drop constraint if exists ${table}_audit_chronology_check;
    ${target === "prompt" ? "drop trigger if exists hermes_prompt_versions_a_validate_timestamps on public.hermes_prompt_versions;" : ""}
    ${target === "run" ? "drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;" : ""}
    ${target === "node" ? "drop trigger if exists hermes_underwriting_nodes_validate_insert on public.hermes_underwriting_nodes;" : ""}
    ${target === "forecast" ? "drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;" : ""}
  `);
  const invalidRows = {
    prompt: `insert into public.hermes_prompt_versions (
      prompt_id, version, role, schema_version, prompt_body, released_at, created_at, updated_at
    ) values (
      'legacy-audit-order', '1.0.0', 'Legacy', '1.0.0', 'Legacy audit order.',
      '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z', '2000-01-01T00:00:00Z'
    )`,
    run: `insert into public.hermes_agent_runs (
      id, workflow_id, workflow_version, agent_name, status, started_at, created_at, updated_at
    ) values (
      '${auditOrderingIdentity.run}', 'legacy-audit-order', '1.0.0', 'vitest', 'running',
      '1999-12-31T00:00:00Z', '2000-01-02T00:00:00Z', '2000-01-01T00:00:00Z'
    )`,
    node: `insert into public.hermes_underwriting_nodes (
      id, stable_key, node_type, title, as_of, created_at, updated_at
    ) values (
      '${auditOrderingIdentity.node}', 'legacy-audit-order', 'company', 'Legacy audit order',
      '1999-12-31T00:00:00Z', '2000-01-02T00:00:00Z', '2000-01-01T00:00:00Z'
    )`,
    forecast: `insert into public.hermes_forecasts (
      id, stable_key, ticker, scenario, forecast_type, horizon_date,
      predicted_value, model_version, as_of, created_at, updated_at
    ) values (
      '${auditOrderingIdentity.forecast}', 'legacy-audit-order', 'AUDORDER', 'Base',
      'annualized_return', '2099-01-01', 0.14, '1999-12-31T00:00:00Z',
      '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z', '2000-01-01T00:00:00Z'
    )`,
  } as const;
  await legacyDb.exec(invalidRows[target]);
  return legacyDb;
}

async function auditOrderingState(targetDb: PGlite, target: AuditOrderingTarget) {
  const table = auditOrderingTable[target];
  const predicate = target === "prompt"
    ? "prompt_id = 'legacy-audit-order' and version = '1.0.0'"
    : `id = '${auditOrderingIdentity[target]}'`;
  return targetDb.query(
    `select
       (select row_to_json(persisted) from (
          select * from public.${table} where ${predicate}
        ) persisted) as persisted_row,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint where conrelid = 'public.${table}'::regclass) as constraints,
       (select array_agg(tgname order by tgname)
        from pg_catalog.pg_trigger where tgrelid = 'public.${table}'::regclass and not tgisinternal) as triggers`,
  );
}

type AuditTimestampTarget =
  | "prompt.released_at"
  | "prompt.created_at"
  | "prompt.updated_at"
  | "run.created_at"
  | "run.updated_at"
  | "node.created_at"
  | "node.updated_at"
  | "edge.created_at"
  | "forecast.created_at"
  | "forecast.updated_at"
  | "outcome.created_at";

type InvalidAuditTimestamp = "positive infinity" | "negative infinity" | "finite future";

const auditTimestampTargets: AuditTimestampTarget[] = [
  "prompt.released_at",
  "prompt.created_at",
  "prompt.updated_at",
  "run.created_at",
  "run.updated_at",
  "node.created_at",
  "node.updated_at",
  "edge.created_at",
  "forecast.created_at",
  "forecast.updated_at",
  "outcome.created_at",
];

const directInvalidAuditCases = [
  ...auditTimestampTargets.map((target) => ({ target, invalidTimestamp: "positive infinity" as const })),
  ...(["prompt.released_at", "run.created_at", "forecast.created_at"] as const).flatMap((target) => [
    { target, invalidTimestamp: "negative infinity" as const },
    { target, invalidTimestamp: "finite future" as const },
  ]),
].map((testCase, index) => ({ ...testCase, suffix: String(index + 1).padStart(2, "0") }));

const replayInvalidAuditCases = [
  ...auditTimestampTargets.map((target) => ({ target, invalidTimestamp: "positive infinity" as const })),
  ...(["prompt.released_at", "run.created_at", "forecast.created_at"] as const).map((target) => ({
    target,
    invalidTimestamp: "finite future" as const,
  })),
].map((testCase, index) => ({ ...testCase, suffix: String(index + 30).padStart(2, "0") }));

const invalidAuditTimestampSql: Record<InvalidAuditTimestamp, string> = {
  "positive infinity": "'infinity'::timestamptz",
  "negative infinity": "'-infinity'::timestamptz",
  "finite future": "pg_catalog.statement_timestamp() + interval '1 year'",
};

function auditTimestampParts(target: AuditTimestampTarget) {
  const [kind, column] = target.split(".") as [
    "prompt" | "run" | "node" | "edge" | "forecast" | "outcome",
    "released_at" | "created_at" | "updated_at",
  ];
  return { kind, column };
}

async function insertAuditTimestampFixture(
  targetDb: PGlite,
  target: AuditTimestampTarget,
  timestampSql: string,
  suffix: string,
) {
  const { kind, column } = auditTimestampParts(target);
  const sequence = suffix.padStart(2, "0").slice(-2);
  const runId = `81000000-0000-4000-8000-0000000000${sequence}`;
  const nodeId = `84000000-0000-4000-8000-0000000000${sequence}`;
  const fromNodeId = `82000000-0000-4000-8000-0000000000${sequence}`;
  const toNodeId = `82100000-0000-4000-8000-0000000000${sequence}`;
  const edgeId = `85000000-0000-4000-8000-0000000000${sequence}`;
  const forecastId = `83000000-0000-4000-8000-0000000000${sequence}`;
  const outcomeId = `86000000-0000-4000-8000-0000000000${sequence}`;
  const createdAtSql = column === "created_at" ? timestampSql : "'2000-01-01T00:00:00Z'::timestamptz";
  const updatedAtSql = column === "updated_at"
    ? timestampSql
    : `case when pg_catalog.isfinite((${timestampSql})::timestamptz)
            then (${timestampSql})::timestamptz
            else pg_catalog.statement_timestamp() end`;
  if (kind === "prompt") {
    const columns = column === "released_at" ? column : "created_at, updated_at";
    const values = column === "released_at" ? timestampSql : `${createdAtSql}, ${updatedAtSql}`;
    await targetDb.exec(`
      insert into public.hermes_prompt_versions (
        prompt_id, version, role, schema_version, prompt_body, ${columns}
      ) values (
        'audit-${suffix}', '1.0.0', 'Audit test', 'audit-v1', 'Audit prompt body.', ${values}
      );
    `);
    return;
  }
  if (kind === "run") {
    await targetDb.exec(`
      insert into public.hermes_agent_runs (
        id, workflow_id, workflow_version, agent_name, status,
        started_at, created_at, updated_at
      ) values ('${runId}', 'audit-${suffix}', '1.0.0', 'vitest', 'running',
        '2000-01-01T00:00:00Z', ${createdAtSql}, ${updatedAtSql});
    `);
    return;
  }

  await targetDb.exec(`
    insert into public.hermes_agent_runs (
      id, workflow_id, workflow_version, agent_name, status
    ) values ('${runId}', 'audit-${suffix}', '1.0.0', 'vitest', 'running');
  `);
  if (kind === "node") {
    await targetDb.exec(`
      insert into public.hermes_underwriting_nodes (
        id, stable_key, node_type, title, as_of, agent_run_id, created_at, updated_at
      ) values (
        '${nodeId}',
        'audit-${suffix}:node', 'company', 'Audit node', '2008-01-01T00:00:00Z',
        '${runId}', ${createdAtSql}, ${updatedAtSql}
      );
    `);
    return;
  }
  if (kind === "edge") {
    await targetDb.exec(`
      insert into public.hermes_underwriting_nodes (
        id, stable_key, node_type, title, as_of, agent_run_id
      ) values
        ('${fromNodeId}', 'audit-${suffix}:from', 'company', 'From', '2008-01-01T00:00:00Z', '${runId}'),
        ('${toNodeId}', 'audit-${suffix}:to', 'forecast', 'To', '2008-01-01T00:00:00Z', '${runId}');
      insert into public.hermes_underwriting_edges (
        id, from_node_id, to_node_id, relationship, agent_run_id, created_at
      ) values (
        '${edgeId}',
        '${fromNodeId}',
        '${toNodeId}',
        'has_forecast', '${runId}', ${timestampSql}
      );
    `);
    return;
  }

  await targetDb.exec(`
    insert into public.hermes_forecasts (
      id, stable_key, ticker, scenario, forecast_type, horizon_date,
      predicted_value, agent_run_id, model_version${kind === "forecast" ? ", created_at, updated_at" : ""}
    ) values (
      '${forecastId}', 'audit-${suffix}:forecast', 'A${suffix}', 'Base',
      'annualized_return', '2099-01-01', 0.14, '${runId}', '2008-01-01T00:00:00Z'
      ${kind === "forecast" ? `, ${createdAtSql}, ${updatedAtSql}` : ""}
    );
  `);
  if (kind === "outcome") {
    await targetDb.exec(`
      insert into public.hermes_forecast_outcomes (
        id, forecast_id, observed_at, actual_value, evidence_url, created_at
      ) values (
        '${outcomeId}',
        '${forecastId}', '2008-01-02T00:00:00Z',
        0.12, 'https://example.com/audit', ${timestampSql}
      );
    `);
  }
}

async function removeAuditTimestampProtections(targetDb: PGlite, target: AuditTimestampTarget) {
  const { kind, column } = auditTimestampParts(target);
  const tables = {
    prompt: "hermes_prompt_versions",
    run: "hermes_agent_runs",
    node: "hermes_underwriting_nodes",
    edge: "hermes_underwriting_edges",
    forecast: "hermes_forecasts",
    outcome: "hermes_forecast_outcomes",
  } as const;
  const chronologyConstraint = ["prompt", "run", "node", "forecast"].includes(kind)
    ? `alter table public.${tables[kind]} drop constraint if exists ${tables[kind]}_audit_chronology_check;`
    : "";
  const triggerSql = {
    prompt: `drop trigger if exists hermes_prompt_versions_validate_timestamps on public.hermes_prompt_versions;
             drop trigger if exists hermes_prompt_versions_a_validate_timestamps on public.hermes_prompt_versions;
             drop trigger if exists hermes_prompt_versions_protect on public.hermes_prompt_versions;
             alter table public.hermes_prompt_versions alter column released_at set default now();`,
    run: "drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;",
    node: "drop trigger if exists hermes_underwriting_nodes_validate_insert on public.hermes_underwriting_nodes;",
    edge: "drop trigger if exists hermes_underwriting_edges_validate_insert on public.hermes_underwriting_edges;",
    forecast: "drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;",
    outcome: "drop trigger if exists hermes_forecast_outcomes_validate_insert on public.hermes_forecast_outcomes;",
  } as const;
  await targetDb.exec(`
    ${triggerSql[kind]}
    ${chronologyConstraint}
    alter table public.${tables[kind]}
      drop constraint if exists ${tables[kind]}_${column}_finite_check;
  `);
}

async function createAuditTimestampUpgradeDb(
  target: AuditTimestampTarget,
  invalidTimestamp: InvalidAuditTimestamp,
  suffix: string,
) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await removeAuditTimestampProtections(legacyDb, target);
  await insertAuditTimestampFixture(legacyDb, target, invalidAuditTimestampSql[invalidTimestamp], suffix);
  return legacyDb;
}

function auditTimestampIdentity(target: AuditTimestampTarget, suffix: string) {
  const { kind } = auditTimestampParts(target);
  const sequence = suffix.padStart(2, "0").slice(-2);
  if (kind === "prompt") return `audit-${suffix}@1.0.0`;
  if (kind === "run") return `81000000-0000-4000-8000-0000000000${sequence}`;
  if (kind === "node") return `84000000-0000-4000-8000-0000000000${sequence}`;
  if (kind === "edge") return `85000000-0000-4000-8000-0000000000${sequence}`;
  if (kind === "forecast") return `83000000-0000-4000-8000-0000000000${sequence}`;
  return `86000000-0000-4000-8000-0000000000${sequence}`;
}

async function auditTimestampState(targetDb: PGlite, target: AuditTimestampTarget, suffix: string) {
  const { kind, column } = auditTimestampParts(target);
  const table = {
    prompt: "hermes_prompt_versions",
    run: "hermes_agent_runs",
    node: "hermes_underwriting_nodes",
    edge: "hermes_underwriting_edges",
    forecast: "hermes_forecasts",
    outcome: "hermes_forecast_outcomes",
  }[kind];
  const predicate = kind === "prompt"
    ? `prompt_id = 'audit-${suffix}' and version = '1.0.0'`
    : `id = '${auditTimestampIdentity(target, suffix)}'`;
  return targetDb.query<{
    persisted_timestamp: string | null;
    constraints: string[] | null;
    triggers: string[] | null;
  }>(
    `select
       (select ${column}::text from public.${table} where ${predicate}) as persisted_timestamp,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint where conrelid = 'public.${table}'::regclass) as constraints,
       (select array_agg(tgname order by tgname)
        from pg_catalog.pg_trigger
        where tgrelid = 'public.${table}'::regclass and not tgisinternal) as triggers`,
  );
}

const requiredLoopTimestampTargets = [
  "prompt.released_at",
  "prompt.created_at",
  "prompt.updated_at",
  "run.started_at",
  "run.created_at",
  "run.updated_at",
  "node.as_of",
  "node.created_at",
  "node.updated_at",
  "edge.created_at",
  "forecast.model_version",
  "forecast.as_of",
  "forecast.created_at",
  "forecast.updated_at",
  "outcome.observed_at",
  "outcome.created_at",
] as const;

type RequiredLoopTimestampTarget = (typeof requiredLoopTimestampTargets)[number];

const requiredTimestampTables = {
  prompt: "hermes_prompt_versions",
  run: "hermes_agent_runs",
  node: "hermes_underwriting_nodes",
  edge: "hermes_underwriting_edges",
  forecast: "hermes_forecasts",
  outcome: "hermes_forecast_outcomes",
} as const;

function requiredTimestampParts(target: RequiredLoopTimestampTarget) {
  const [kind, column] = target.split(".") as [keyof typeof requiredTimestampTables, string];
  return { kind, column, table: requiredTimestampTables[kind] };
}

function requiredTimestampIdentity(target: RequiredLoopTimestampTarget) {
  const { kind } = requiredTimestampParts(target);
  if (kind === "prompt") return "audit-90@1.0.0";
  if (kind === "run" && target !== "run.started_at") return "81000000-0000-4000-8000-000000000090";
  if (kind === "node" && target !== "node.as_of") return "84000000-0000-4000-8000-000000000090";
  if (kind === "edge") return "85000000-0000-4000-8000-000000000090";
  if (kind === "forecast" && target !== "forecast.model_version" && target !== "forecast.as_of") {
    return "83000000-0000-4000-8000-000000000090";
  }
  if (kind === "outcome" && target !== "outcome.observed_at") {
    return "86000000-0000-4000-8000-000000000090";
  }
  if (target === "run.started_at") return "89000000-0000-4000-8000-000000000001";
  if (target === "node.as_of") return "89100000-0000-4000-8000-000000000001";
  if (target === "forecast.model_version") return "89200000-0000-4000-8000-000000000001";
  if (target === "forecast.as_of") return "89200000-0000-4000-8000-000000000002";
  return "89300000-0000-4000-8000-000000000001";
}

function requiredTimestampPredicate(target: RequiredLoopTimestampTarget) {
  const { kind } = requiredTimestampParts(target);
  return kind === "prompt"
    ? "prompt_id = 'audit-90' and version = '1.0.0'"
    : `id = '${requiredTimestampIdentity(target)}'`;
}

async function createRequiredTimestampNullUpgradeDb(target: RequiredLoopTimestampTarget) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);

  if (auditTimestampTargets.includes(target as AuditTimestampTarget)) {
    const auditTarget = target as AuditTimestampTarget;
    const { table, column } = requiredTimestampParts(target);
    await removeAuditTimestampProtections(legacyDb, auditTarget);
    await legacyDb.exec(`alter table public.${table} alter column ${column} drop not null;`);
    await insertAuditTimestampFixture(legacyDb, auditTarget, "null", "90");
    return legacyDb;
  }

  if (target === "run.started_at") {
    await legacyDb.exec(`
      drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;
      alter table public.hermes_agent_runs
        drop constraint if exists hermes_agent_runs_started_at_valid_check;
      alter table public.hermes_agent_runs alter column started_at drop not null;
      insert into public.hermes_agent_runs (
        id, workflow_id, workflow_version, agent_name, status, started_at
      ) values (
        '89000000-0000-4000-8000-000000000001',
        'legacy-null-started-at', '1.0.0', 'vitest', 'running', null
      );
    `);
    return legacyDb;
  }

  if (target === "node.as_of") {
    await legacyDb.exec(`
      drop trigger if exists hermes_underwriting_nodes_validate_insert
        on public.hermes_underwriting_nodes;
      alter table public.hermes_underwriting_nodes
        drop constraint if exists hermes_underwriting_nodes_as_of_valid_check;
      alter table public.hermes_underwriting_nodes alter column as_of drop not null;
      insert into public.hermes_underwriting_nodes (
        id, stable_key, node_type, title, as_of
      ) values (
        '89100000-0000-4000-8000-000000000001',
        'legacy-null-node-as-of', 'company', 'Legacy null node', null
      );
    `);
    return legacyDb;
  }

  if (target === "forecast.model_version") {
    await legacyDb.exec(`
      drop view if exists public.hermes_forecast_evaluations;
      drop trigger if exists hermes_forecasts_protect_immutability
        on public.hermes_forecasts;
      alter table public.hermes_forecasts
        drop constraint if exists hermes_forecasts_model_version_finite_check;
      alter table public.hermes_forecasts
        drop constraint if exists hermes_forecasts_model_version_as_of_check;
      alter table public.hermes_forecasts
        drop constraint if exists hermes_forecasts_logical_identity_key;
      alter table public.hermes_forecasts
        alter column model_version type text using model_version::text;
      alter table public.hermes_forecasts alter column model_version drop not null;
      insert into public.hermes_forecasts (
        id, stable_key, ticker, scenario, forecast_type, horizon_date,
        predicted_value, model_version, as_of
      ) values (
        '89200000-0000-4000-8000-000000000001',
        'legacy-null-model-version', 'NULLMODEL', 'Base', 'annualized_return',
        '2099-01-01', 0.14, null, '2000-01-01T00:00:00Z'
      );
    `);
    return legacyDb;
  }

  if (target === "forecast.as_of") {
    await legacyDb.exec(`
      drop trigger if exists hermes_forecasts_protect_immutability
        on public.hermes_forecasts;
      alter table public.hermes_forecasts
        drop constraint if exists hermes_forecasts_as_of_valid_check;
      alter table public.hermes_forecasts
        drop constraint if exists hermes_forecasts_forward_horizon_check;
      alter table public.hermes_forecasts alter column as_of drop not null;
      insert into public.hermes_forecasts (
        id, stable_key, ticker, scenario, forecast_type, horizon_date,
        predicted_value, model_version, as_of
      ) values (
        '89200000-0000-4000-8000-000000000002',
        'legacy-null-forecast-as-of', 'NULLASOF', 'Base', 'annualized_return',
        '2099-01-01', 0.14, '2000-01-01T00:00:00Z', null
      );
    `);
    return legacyDb;
  }

  await legacyDb.exec(`
    drop trigger if exists hermes_forecast_outcomes_validate_insert
      on public.hermes_forecast_outcomes;
    alter table public.hermes_forecast_outcomes
      drop constraint if exists hermes_forecast_outcomes_observed_at_valid_check;
    alter table public.hermes_forecast_outcomes alter column observed_at drop not null;
    insert into public.hermes_forecasts (
      id, stable_key, ticker, scenario, forecast_type, horizon_date,
      predicted_value, model_version, as_of
    ) values (
      '89400000-0000-4000-8000-000000000001',
      'legacy-null-observed-at-parent', 'NULLOBS', 'Base', 'annualized_return',
      '2099-01-01', 0.14, '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z'
    );
    insert into public.hermes_forecast_outcomes (
      id, forecast_id, observed_at, actual_value, evidence_url
    ) values (
      '89300000-0000-4000-8000-000000000001',
      '89400000-0000-4000-8000-000000000001', null, 0.12,
      'https://example.com/legacy-null-observed-at'
    );
  `);
  return legacyDb;
}

async function requiredTimestampState(targetDb: PGlite, target: RequiredLoopTimestampTarget) {
  const { table, column } = requiredTimestampParts(target);
  const predicate = requiredTimestampPredicate(target);
  return targetDb.query<{
    persisted_timestamp: string | null;
    data_type: string;
    is_nullable: string;
    constraints: string[] | null;
    triggers: string[] | null;
  }>(
    `select
       (select ${column}::text from public.${table} where ${predicate}) as persisted_timestamp,
       (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = '${table}' and column_name = '${column}') as data_type,
       (select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = '${table}' and column_name = '${column}') as is_nullable,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint where conrelid = 'public.${table}'::regclass) as constraints,
       (select array_agg(tgname order by tgname)
        from pg_catalog.pg_trigger
        where tgrelid = 'public.${table}'::regclass and not tgisinternal) as triggers`,
  );
}

type LegacyCompletionCase = {
  label: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  completedAtSql: string;
};

const invalidLegacyCompletionCases: LegacyCompletionCase[] = [
  { label: "positive infinity", status: "succeeded", completedAtSql: "'infinity'::timestamptz" },
  { label: "negative infinity", status: "succeeded", completedAtSql: "'-infinity'::timestamptz" },
  { label: "finite future", status: "succeeded", completedAtSql: "pg_catalog.statement_timestamp() + interval '1 year'" },
  { label: "before started_at", status: "succeeded", completedAtSql: "pg_catalog.statement_timestamp() - interval '3 days'" },
  { label: "succeeded without completion", status: "succeeded", completedAtSql: "null" },
  { label: "failed without completion", status: "failed", completedAtSql: "null" },
  { label: "cancelled without completion", status: "cancelled", completedAtSql: "null" },
  { label: "queued with completion", status: "queued", completedAtSql: "pg_catalog.statement_timestamp() - interval '1 day'" },
  { label: "running with completion", status: "running", completedAtSql: "pg_catalog.statement_timestamp() - interval '1 day'" },
];

async function createAgentRunCompletionUpgradeDb(completionCase: LegacyCompletionCase) {
  const legacyDb = new PGlite({ extensions: { pgcrypto } });
  await legacyDb.exec(`
    create schema extensions;
    create extension pgcrypto schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.hermes_agent_tasks (id uuid primary key);
    create function public.hermes_set_updated_at()
    returns trigger language plpgsql set search_path = '' as $$
    begin new.updated_at := pg_catalog.now(); return new; end;
    $$;
    create publication supabase_realtime;
  `);
  await legacyDb.exec(migration);
  await legacyDb.exec(`
    drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;
    alter table public.hermes_agent_runs
      drop constraint if exists hermes_agent_runs_completion_valid_check;
    insert into public.hermes_agent_runs (
      id, workflow_id, workflow_version, agent_name, status, started_at, completed_at
    ) values (
      '73000000-0000-4000-8000-000000000001',
      'legacy-completion-${completionCase.status}', '1.0.0', 'vitest', '${completionCase.status}',
      pg_catalog.statement_timestamp() - interval '2 days', ${completionCase.completedAtSql}
    );
  `);
  return legacyDb;
}

async function agentRunCompletionSchemaState(db: PGlite) {
  return db.query<{
    persisted_run: Record<string, unknown>;
    run_constraints: string[];
    prompt_protection_function: string;
    run_protection_function: string;
    forecast_protection_function: string;
    prompt_protection_triggers: number;
    run_protection_triggers: number;
    forecast_protection_triggers: number;
  }>(
    `select
       (select row_to_json(run_state) from (
          select id, workflow_id, status, started_at::text, completed_at::text
          from public.hermes_agent_runs
          where id = '73000000-0000-4000-8000-000000000001'
        ) run_state) as persisted_run,
       (select array_agg(conname order by conname)
        from pg_catalog.pg_constraint
        where conrelid = 'public.hermes_agent_runs'::regclass) as run_constraints,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_prompt_version()'::regprocedure
       ) as prompt_protection_function,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_agent_run()'::regprocedure
       ) as run_protection_function,
       pg_catalog.pg_get_functiondef(
         'public.hermes_protect_forecast_immutability()'::regprocedure
       ) as forecast_protection_function,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_prompt_versions'::regclass
          and tgname = 'hermes_prompt_versions_protect' and not tgisinternal) as prompt_protection_triggers,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_agent_runs'::regclass
          and tgname = 'hermes_agent_runs_protect' and not tgisinternal) as run_protection_triggers,
       (select count(*)::int from pg_catalog.pg_trigger
        where tgrelid = 'public.hermes_forecasts'::regclass
          and tgname = 'hermes_forecasts_protect_immutability' and not tgisinternal) as forecast_protection_triggers`,
  );
}

const promptContracts = [
  {
    promptId: "daily-10-plus-10",
    version: "2.0.0",
    role: "Hermes PM orchestrator",
    schemaVersion: "best-ideas-snapshot-v2",
    legacyBody: "Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.",
    currentBody: "Refresh current prices and source evidence, reconcile every active 10 + 10 company with its model, compare each conclusion with QQQ, preserve falsifiers, and publish one canonical ranked Top 10 plus Watchlist 10 snapshot. Do not authorize or place trades.",
    status: "active",
    description: "Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.",
    metadata: { source: "north-star-seed" },
  },
  {
    promptId: "company-underwrite",
    version: "1.0.0",
    role: "Company analyst",
    schemaVersion: "company-model-v1",
    legacyBody: "Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.",
    currentBody: "Produce a source-backed five-year company underwriting with explicit Bear, Base, and Bull revenue growth, margin, exit-multiple, target-price, and annualized-return assumptions. State probability, risks, monitoring tests, data limitations, and the QQQ opportunity-cost hurdle. Do not rewrite a forecast after it is registered.",
    status: "active",
    description: "Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.",
    metadata: { source: "north-star-seed" },
  },
  {
    promptId: "risk-falsifier-review",
    version: "1.0.0",
    role: "Risk and falsifier analyst",
    schemaVersion: "falsifier-review-v1",
    legacyBody: "Identify evidence that would invalidate the active thesis or make QQQ the better default.",
    currentBody: "Review the active thesis and identify specific source-verifiable evidence that could invalidate each material assumption, impair the downside case, or make QQQ the better default. Keep falsifiers distinct from blended conviction scores.",
    status: "active",
    description: "Identify evidence that would invalidate the active thesis or make QQQ the better default.",
    metadata: { source: "north-star-seed" },
  },
  {
    promptId: "forecast-outcome-grade",
    version: "0.1.0",
    role: "Outcome evaluator",
    schemaVersion: "forecast-outcome-v1",
    legacyBody: "Close due forecasts against observed results and QQQ, preserving source evidence.",
    currentBody: "After a forecast horizon has been reached, record the realized value, realized QQQ comparator when applicable, binary outcome when applicable, and a required evidence URL. Preserve the original forecast and close it atomically. Never grade a forecast early.",
    status: "draft",
    description: "Close due forecasts against observed results and QQQ, preserving source evidence.",
    metadata: { source: "north-star-seed" },
  },
] as const;

const companyPromptContract = promptContracts[1];

const immutablePromptFieldTampering = [
  ["role", { role: "Unexpected analyst" }],
  ["schema_version", { schemaVersion: "unexpected-schema-v9" }],
  ["status", { status: "retired" }],
  ["description", { description: "Unexpected description." }],
  ["metadata", { metadata: { source: "unexpected-seed" } }],
] as const;

const promptReplayTamperingCases = (["current", "legacy"] as const).flatMap((bodyState) =>
  immutablePromptFieldTampering.map(([field, mutation]) => ({ bodyState, field, mutation })),
);

async function insertPromptContract(
  db: PGlite,
  contract: (typeof promptContracts)[number],
  promptBody: string,
  metadata: unknown = contract.metadata,
) {
  await db.query(
    `insert into public.hermes_prompt_versions (
       prompt_id, version, role, schema_version, prompt_body, content_sha256,
       status, description, metadata
     ) values ($1, $2, $3, $4, $5,
       encode(extensions.digest($5, 'sha256'), 'hex'), $6, $7, $8::jsonb)`,
    [
      contract.promptId,
      contract.version,
      contract.role,
      contract.schemaVersion,
      promptBody,
      contract.status,
      contract.description,
      JSON.stringify(metadata),
    ],
  );
}

describe("underwriting migration database integrity", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`
      create schema extensions;
      create extension pgcrypto schema extensions;
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.hermes_agent_tasks (id uuid primary key);
      create function public.hermes_set_updated_at()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        new.updated_at := pg_catalog.now();
        return new;
      end;
      $$;
      create publication supabase_realtime;
    `);
    await db.exec(migration);
    await db.exec(migration);

    for (const [status, id] of Object.entries(runIds)) {
      await db.query(
        `insert into public.hermes_agent_runs (
           id, workflow_id, workflow_version, agent_name, status
         ) values ($1, 'db-integrity-test', '1.0.0', 'vitest', $2)`,
        [id, status === "queued" ? "queued" : "running"],
      );
    }
    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      await db.query(
        "update public.hermes_agent_runs set status = $1, completed_at = now() where id = $2",
        [status, runIds[status]],
      );
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it("keeps the migration replay-idempotent", async () => {
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_trigger where tgname = 'hermes_forecasts_protect_immutability' and not tgisinternal",
    );
    expect(result.rows).toEqual([{ count: 1 }]);

    const constraint = await db.query<{ count: number }>(
      `select count(*)::int as count
       from pg_constraint
       where conrelid = 'public.hermes_forecasts'::regclass
         and conname = 'hermes_forecasts_model_version_finite_check'`,
    );
    expect(constraint.rows).toEqual([{ count: 1 }]);

    const nodeValidityConstraint = await db.query<{ count: number; validated: boolean }>(
      `select count(*)::int as count, bool_and(convalidated) as validated
       from pg_constraint
       where conrelid = 'public.hermes_underwriting_nodes'::regclass
         and conname = 'hermes_underwriting_nodes_valid_until_valid_check'`,
    );
    expect(nodeValidityConstraint.rows).toEqual([{ count: 1, validated: true }]);

    const chronologyConstraints = await db.query<{ conname: string; convalidated: boolean }>(
      `select conname, convalidated
       from pg_catalog.pg_constraint
       where conrelid = 'public.hermes_forecasts'::regclass
         and conname = 'hermes_forecasts_model_version_as_of_check'
       order by conname`,
    );
    expect(chronologyConstraints.rows).toEqual([
      { conname: "hermes_forecasts_model_version_as_of_check", convalidated: true },
    ]);
    const falseRunConstraint = await db.query<{ count: number }>(
      `select count(*)::int as count from pg_catalog.pg_constraint
       where conrelid = 'public.hermes_agent_runs'::regclass
         and conname = 'hermes_agent_runs_registration_chronology_check'`,
    );
    expect(falseRunConstraint.rows).toEqual([{ count: 0 }]);
  });

  it("replays over the legacy queued-then-started succeeded chronology fixture without rewriting it", async () => {
    const legacyDb = await createLegacyQueuedRunChronologyReplayDb();
    try {
      await expect(legacyDb.exec(migration)).resolves.toBeDefined();
      const state = await legacyDb.query<{
        id: string;
        external_key: string;
        status: string;
        started_at_preserved: boolean;
        completed_at_preserved: boolean;
        created_at_preserved: boolean;
        updated_at_preserved: boolean;
        metadata: Record<string, unknown>;
      }>(
        `select id, external_key, status,
                started_at = '2026-09-08T00:17:00Z'::timestamptz as started_at_preserved,
                completed_at = '2026-09-08T00:17:05Z'::timestamptz as completed_at_preserved,
                created_at = '2026-09-07T22:47:00Z'::timestamptz as created_at_preserved,
                updated_at = '2026-09-08T00:17:05Z'::timestamptz as updated_at_preserved,
                metadata
         from public.hermes_agent_runs
         where id = '1e48faa4-20e5-4a0d-b155-c3e13762b36d'`,
      );
      expect(state.rows).toEqual([{
        id: "1e48faa4-20e5-4a0d-b155-c3e13762b36d",
        external_key: "company-model-registry-import:2026-09-07T20:55:00.000Z",
        status: "succeeded",
        started_at_preserved: true,
        completed_at_preserved: true,
        created_at_preserved: true,
        updated_at_preserved: true,
        metadata: { seed: true },
      }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("still fails replay closed for model_version after forecast as_of before schema/function changes", async () => {
    const legacyDb = await createForecastPublicationChronologyUpgradeDb();
    try {
      const before = await forecastPublicationChronologyState(legacyDb);
      let replayError: unknown;
      try {
        await legacyDb.exec(migration);
      } catch (error) {
        replayError = error;
      }
      expect(replayError).toMatchObject({ code: "23514" });
      const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
      expect(message).toContain("89800000-0000-4000-8000-000000000001");
      expect(message).toContain("model_version");
      const after = await forecastPublicationChronologyState(legacyDb);
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it.each(auditOrderingTargets)(
    "fails repeated replay atomically for legacy $0 created_at after updated_at with identity",
    async (target) => {
      const legacyDb = await createAuditOrderingUpgradeDb(target);
      try {
        const before = await auditOrderingState(legacyDb, target);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          let replayError: unknown;
          try {
            await legacyDb.exec(migration);
          } catch (error) {
            replayError = error;
          }
          expect(replayError).toMatchObject({ code: "23514" });
          const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
          expect(message).toContain(auditOrderingIdentity[target]);
          expect(message).toContain("created_at");
          expect(message).toContain("updated_at");
          expect((await auditOrderingState(legacyDb, target)).rows).toEqual(before.rows);
        }
      } finally {
        await legacyDb.close();
      }
    },
  );

  it.each([
    ["prompt", "legacy-direct-audit-order@1.0.0", `insert into public.hermes_prompt_versions (
      prompt_id, version, role, schema_version, prompt_body, created_at, updated_at
    ) values (
      'legacy-direct-audit-order', '1.0.0', 'Direct', '1.0.0', 'Direct invalid audit order.',
      '2001-01-02T00:00:00Z', '2001-01-01T00:00:00Z'
    )`],
    ["run", "89720000-0000-4000-8000-000000000001", `insert into public.hermes_agent_runs (
      id, workflow_id, workflow_version, agent_name, status, started_at, created_at, updated_at
    ) values (
      '89720000-0000-4000-8000-000000000001', 'direct-audit-order', '1.0.0', 'vitest', 'running',
      '2000-12-31T00:00:00Z', '2001-01-02T00:00:00Z', '2001-01-01T00:00:00Z'
    )`],
    ["node", "89720000-0000-4000-8000-000000000002", `insert into public.hermes_underwriting_nodes (
      id, stable_key, node_type, title, as_of, agent_run_id, created_at, updated_at
    ) values (
      '89720000-0000-4000-8000-000000000002', 'direct-audit-order:node', 'company', 'Direct invalid audit order',
      '2000-12-31T00:00:00Z', '${runIds.running}', '2001-01-02T00:00:00Z', '2001-01-01T00:00:00Z'
    )`],
    ["forecast", "89720000-0000-4000-8000-000000000003", `insert into public.hermes_forecasts (
      id, stable_key, ticker, scenario, forecast_type, horizon_date,
      predicted_value, model_version, created_at, updated_at
    ) values (
      '89720000-0000-4000-8000-000000000003', 'direct-audit-order:forecast', 'DIRAUD', 'Base',
      'annualized_return', '2099-01-01', 0.14, '2000-12-31T00:00:00Z',
      '2001-01-02T00:00:00Z', '2001-01-01T00:00:00Z'
    )`],
  ] as const)("rejects direct %s created_at after updated_at with identity", async (_target, identity, sql) => {
    await db.exec("begin");
    try {
      await expect(db.exec(sql)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining(identity),
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it("accepts created_at equal to updated_at for every applicable table", async () => {
    await db.exec("begin");
    try {
      await db.exec(`
        insert into public.hermes_prompt_versions (
          prompt_id, version, role, schema_version, prompt_body, created_at, updated_at
        ) values (
          'audit-order-equality', '1.0.0', 'Equality', '1.0.0', 'Valid equality.',
          '2001-02-01T00:00:00Z', '2001-02-01T00:00:00Z'
        );
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status,
          started_at, created_at, updated_at
        ) values (
          '89720000-0000-4000-8000-000000000004', 'audit-order-equality', '1.0.0', 'vitest', 'running',
          '2001-02-01T00:00:00Z', '2001-02-01T00:00:00Z', '2001-02-01T00:00:00Z'
        );
        insert into public.hermes_underwriting_nodes (
          id, stable_key, node_type, title, as_of, agent_run_id, created_at, updated_at
        ) values (
          '89720000-0000-4000-8000-000000000005', 'audit-order-equality:node', 'company', 'Equality',
          '2001-02-01T00:00:00Z', '89720000-0000-4000-8000-000000000004',
          '2001-02-01T00:00:00Z', '2001-02-01T00:00:00Z'
        );
        insert into public.hermes_forecasts (
          id, stable_key, ticker, scenario, forecast_type, horizon_date,
          predicted_value, agent_run_id, model_version, created_at, updated_at
        ) values (
          '89720000-0000-4000-8000-000000000006', 'audit-order-equality:forecast', 'EQUALAUD', 'Base',
          'annualized_return', '2099-01-01', 0.14, '89720000-0000-4000-8000-000000000004',
          '2001-02-01T00:00:00Z', '2001-02-01T00:00:00Z', '2001-02-01T00:00:00Z'
        );
      `);
      const accepted = await db.query<{ count: number }>(
        `select (
          (select count(*) from public.hermes_prompt_versions where prompt_id = 'audit-order-equality')
          + (select count(*) from public.hermes_agent_runs where id = '89720000-0000-4000-8000-000000000004')
          + (select count(*) from public.hermes_underwriting_nodes where id = '89720000-0000-4000-8000-000000000005')
          + (select count(*) from public.hermes_forecasts where id = '89720000-0000-4000-8000-000000000006')
        )::int as count`,
      );
      expect(accepted.rows).toEqual([{ count: 4 }]);
    } finally {
      await db.exec("rollback");
    }
  });

  it("rejects audit-order bypass attempts before generic updated_at triggers run", async () => {
    await db.exec("begin");
    try {
      await db.exec(`
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status
        ) values ('89720000-0000-4000-8000-000000000007', 'audit-order-update', '1.0.0', 'vitest', 'running');
        insert into public.hermes_underwriting_nodes (
          id, stable_key, node_type, title, as_of, agent_run_id
        ) values (
          '89720000-0000-4000-8000-000000000008', 'audit-order-update:node', 'company', 'Update order',
          '2001-03-01T00:00:00Z', '89720000-0000-4000-8000-000000000007'
        );
        insert into public.hermes_forecasts (
          id, stable_key, ticker, scenario, forecast_type, horizon_date,
          predicted_value, agent_run_id, model_version
        ) values (
          '89720000-0000-4000-8000-000000000009', 'audit-order-update:forecast', 'UPDAUD', 'Base',
          'annualized_return', '2099-01-01', 0.14, '89720000-0000-4000-8000-000000000007',
          '2001-03-01T00:00:00Z'
        );
      `);
      for (const [label, sql, code] of [
        ["run", `update public.hermes_agent_runs set updated_at = created_at - interval '1 second'
          where id = '89720000-0000-4000-8000-000000000007'`, "23514"],
        ["node", `update public.hermes_underwriting_nodes set updated_at = created_at - interval '1 second'
          where id = '89720000-0000-4000-8000-000000000008'`, "55000"],
        ["forecast", `update public.hermes_forecasts set status = 'graded', updated_at = created_at - interval '1 second'
          where id = '89720000-0000-4000-8000-000000000009'`, "23514"],
      ] as const) {
        await db.exec(`savepoint audit_order_${label}`);
        await expect(db.exec(sql)).rejects.toMatchObject({ code });
        await db.exec(`rollback to savepoint audit_order_${label}`);
      }
    } finally {
      await db.exec("rollback");
    }
  });

  it("accepts direct run registration when either independent timestamp legitimately comes first", async () => {
    await db.exec("begin; set local role service_role");
    try {
      await db.exec(`
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status,
          started_at, created_at, updated_at
        ) values
          (
            '89900000-0000-4000-8000-000000000001',
            'queued-then-started', '1.0.0', 'vitest', 'running',
            '2006-01-02T00:00:00Z', '2006-01-01T23:59:00Z', '2006-01-03T00:00:00Z'
          ),
          (
            '89900000-0000-4000-8000-000000000004',
            'caller-started-before-insert', '1.0.0', 'vitest', 'running',
            '2006-02-01T00:00:00Z', '2006-02-01T00:00:01Z', '2006-02-01T00:00:01Z'
          );
      `);
      const accepted = await db.query<{
        id: string;
        created_before_started: boolean;
        started_before_created: boolean;
      }>(
        `select id, created_at < started_at as created_before_started,
                started_at < created_at as started_before_created
         from public.hermes_agent_runs
         where id in (
           '89900000-0000-4000-8000-000000000001',
           '89900000-0000-4000-8000-000000000004'
         ) order by id`,
      );
      expect(accepted.rows).toEqual([
        {
          id: "89900000-0000-4000-8000-000000000001",
          created_before_started: true,
          started_before_created: false,
        },
        {
          id: "89900000-0000-4000-8000-000000000004",
          created_before_started: false,
          started_before_created: true,
        },
      ]);
    } finally {
      await db.exec("rollback");
    }
  });

  it("accepts atomic default equality and offset-equivalent run registration equality", async () => {
    await db.exec("begin");
    try {
      await db.exec(`
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status
        ) values (
          '89900000-0000-4000-8000-000000000002',
          'default-registration-equality', '1.0.0', 'vitest', 'running'
        );
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status,
          started_at, created_at, updated_at
        ) values (
          '89900000-0000-4000-8000-000000000003',
          'offset-registration-equality', '1.0.0', 'vitest', 'running',
          '2006-02-01T00:00:00Z', '2006-01-31T19:00:00-05:00',
          '2006-02-01T00:00:00Z'
        );
      `);
      const accepted = await db.query<{ id: string; equal: boolean }>(
        `select id, started_at = created_at as equal
         from public.hermes_agent_runs
         where id in (
           '89900000-0000-4000-8000-000000000002',
           '89900000-0000-4000-8000-000000000003'
         ) order by id`,
      );
      expect(accepted.rows).toEqual([
        { id: "89900000-0000-4000-8000-000000000002", equal: true },
        { id: "89900000-0000-4000-8000-000000000003", equal: true },
      ]);
    } finally {
      await db.exec("rollback");
    }
  });

  it("enforces terminal run append-closure for every distinct service-role update while allowing an exact no-op", async () => {
    const terminalIds = [runIds.succeeded, runIds.failed, runIds.cancelled];
    const mutations = [
      "output_ref = '{\"changed\":true}'::jsonb",
      "metrics = '{\"changed\":true}'::jsonb",
      "metadata = '{\"changed\":true}'::jsonb",
      "error = 'changed'",
      "prompt_id = 'company-underwrite', prompt_version = '1.0.0'",
      "completed_at = completed_at + interval '1 second'",
      "created_at = created_at - interval '1 second'",
      "updated_at = updated_at - interval '1 second'",
    ];

    for (const id of terminalIds) {
      for (const mutation of mutations) {
        await db.exec("begin; set local role service_role");
        try {
          await expect(
            db.query(`update public.hermes_agent_runs set ${mutation} where id = $1`, [id]),
          ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("immutable") });
        } finally {
          await db.exec("rollback");
        }
      }

      const before = await db.query<{ updated_at: string }>(
        "select updated_at::text from public.hermes_agent_runs where id = $1",
        [id],
      );
      await db.exec("begin; set local role service_role");
      let committed = false;
      try {
        await expect(
          db.query("update public.hermes_agent_runs set status = status where id = $1", [id]),
        ).resolves.toBeDefined();
        await db.exec("commit");
        committed = true;
      } finally {
        if (!committed) await db.exec("rollback");
      }
      const after = await db.query<{ updated_at: string }>(
        "select updated_at::text from public.hermes_agent_runs where id = $1",
        [id],
      );
      expect(after.rows).toEqual(before.rows);
    }
  });

  it("rejects owner direct forecast DELETE with the immutable-record invariant before dereferencing NEW", async () => {
    const id = "10000000-0000-4000-8000-000000000030";
    await db.query(
      `insert into public.hermes_forecasts (
         id, stable_key, ticker, scenario, forecast_type, horizon_date,
         predicted_value, agent_run_id, model_version
       ) values (
         $1, 'delete-invariant:forecast', 'MU', 'Base', 'annualized_return',
         '2099-01-01', 0.14, $2, '2000-01-01T00:00:00Z'
       )`,
      [id, runIds.running],
    );

    await db.exec("begin");
    try {
      await expect(
        db.query("delete from public.hermes_forecasts where id = $1", [id]),
      ).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("Forecast records are immutable"),
      });
    } finally {
      await db.exec("rollback");
    }

    const privilege = await db.query<{ can_delete: boolean }>(
      "select has_table_privilege('service_role', 'public.hermes_forecasts', 'DELETE') as can_delete",
    );
    expect(privilege.rows).toEqual([{ can_delete: false }]);
    await db.exec("begin; set local role service_role");
    try {
      await expect(
        db.query("delete from public.hermes_forecasts where id = $1", [id]),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("rollback");
    }
  });

  it("allows the service role to perform the running-to-terminal lifecycle transition", async () => {
    const id = "10000000-0000-4000-8000-000000000031";
    await db.query(
      "insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status) values ($1, 'terminal-transition', '1.0.0', 'vitest', 'running')",
      [id],
    );
    await db.exec("begin; set local role service_role");
    let committed = false;
    try {
      await db.query(
        "update public.hermes_agent_runs set status = 'succeeded', completed_at = pg_catalog.statement_timestamp() where id = $1",
        [id],
      );
      await db.exec("commit");
      committed = true;
    } finally {
      if (!committed) await db.exec("rollback");
    }
    const saved = await db.query<{ status: string; completed: boolean }>(
      "select status, completed_at is not null as completed from public.hermes_agent_runs where id = $1",
      [id],
    );
    expect(saved.rows).toEqual([{ status: "succeeded", completed: true }]);
  });

  it.each(directInvalidAuditCases)(
    "rejects direct $invalidTimestamp for provenance/audit timestamp $target",
    async ({ target, invalidTimestamp, suffix }) => {
      const { kind } = auditTimestampParts(target);
      await db.exec("begin");
      try {
        if (kind === "prompt" || kind === "run" || kind === "forecast") {
          await db.exec("set local role service_role");
        }
        await expect(
          insertAuditTimestampFixture(db, target, invalidAuditTimestampSql[invalidTimestamp], suffix),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await db.exec("rollback");
      }
    },
  );

  it("rejects a caller-supplied historical prompt release time instead of overriding it", async () => {
    await db.exec("begin; set local role service_role");
    try {
      await expect(
        insertAuditTimestampFixture(db, "prompt.released_at", "'2001-01-01T00:00:00Z'::timestamptz", "20"),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("server-owned"),
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it.each(auditTimestampTargets.filter((target) => target !== "prompt.released_at"))(
    "accepts a direct finite historical provenance/audit timestamp for $target",
    async (target) => {
      const { kind } = auditTimestampParts(target);
      await db.exec("begin");
      try {
        if (kind === "run" || kind === "forecast") {
          await db.exec("set local role service_role");
        }
        await expect(
          insertAuditTimestampFixture(
            db,
            target,
            "'2001-01-01T00:00:00Z'::timestamptz",
            String(auditTimestampTargets.indexOf(target) + 75).padStart(2, "0"),
          ),
        ).resolves.toBeUndefined();
      } finally {
        await db.exec("rollback");
      }
    },
  );

  it.each(["positive infinity", "finite future"] as const)(
    "rejects direct agent-run updated_at %s on a permitted update",
    async (invalidTimestamp) => {
      await db.exec("begin; set local role service_role");
      try {
        await db.exec(`
          insert into public.hermes_agent_runs (
            id, workflow_id, workflow_version, agent_name, status
          ) values (
            '87000000-0000-4000-8000-000000000001',
            'audit-run-update', '1.0.0', 'vitest', 'running'
          );
        `);
        await expect(
          db.exec(`
            update public.hermes_agent_runs
            set updated_at = ${invalidAuditTimestampSql[invalidTimestamp]}
            where id = '87000000-0000-4000-8000-000000000001';
          `),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await db.exec("rollback");
      }
    },
  );

  it.each(["positive infinity", "finite future"] as const)(
    "rejects direct forecast updated_at %s on the permitted closure update",
    async (invalidTimestamp) => {
      await db.exec("begin");
      try {
        await db.exec(`
          insert into public.hermes_forecasts (
            id, stable_key, ticker, scenario, forecast_type, horizon_date,
            predicted_value, model_version
          ) values (
            '88000000-0000-4000-8000-000000000001',
            'audit-forecast-update', 'AUD', 'Base', 'annualized_return',
            '2099-01-01', 0.14, '2008-01-01T00:00:00Z'
          );
        `);
        await expect(
          db.exec(`
            update public.hermes_forecasts
            set status = 'graded', updated_at = ${invalidAuditTimestampSql[invalidTimestamp]}
            where id = '88000000-0000-4000-8000-000000000001';
          `),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await db.exec("rollback");
      }
    },
  );

  it.each(replayInvalidAuditCases)(
    "fails migration replay closed for legacy $invalidTimestamp in $target with identity and no mutation",
    async ({ target, invalidTimestamp, suffix }) => {
      const legacyDb = await createAuditTimestampUpgradeDb(target, invalidTimestamp, suffix);
      try {
        const before = await auditTimestampState(legacyDb, target, suffix);
        let replayError: unknown;
        try {
          await legacyDb.exec(migration);
        } catch (error) {
          replayError = error;
        }
        expect(replayError).toMatchObject({ code: "23514" });
        const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
        expect(message).toContain(auditTimestampParts(target).column);
        expect(message).toContain(auditTimestampIdentity(target, suffix));
        const after = await auditTimestampState(legacyDb, target, suffix);
        expect(after.rows).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it("preserves valid historical audit timestamps through two migration replays", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      for (const [index, target] of auditTimestampTargets.entries()) {
        const suffix = String(index + 60).padStart(2, "0");
        await removeAuditTimestampProtections(legacyDb, target);
        await insertAuditTimestampFixture(
          legacyDb,
          target,
          "'2001-01-01T00:00:00Z'::timestamptz",
          suffix,
        );
      }
      const before = await Promise.all(
        auditTimestampTargets.map((target, index) =>
          auditTimestampState(legacyDb, target, String(index + 60).padStart(2, "0"))
        ),
      );

      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const after = await Promise.all(
        auditTimestampTargets.map((target, index) =>
          auditTimestampState(legacyDb, target, String(index + 60).padStart(2, "0"))
        ),
      );
      expect(after.map((result) => result.rows[0]?.persisted_timestamp)).toEqual(
        before.map((result) => result.rows[0]?.persisted_timestamp),
      );
    } finally {
      await legacyDb.close();
    }
  });

  it.each(requiredLoopTimestampTargets)(
    "rejects identity-bearing legacy NULL in required loop timestamp $0 before schema changes",
    async (target) => {
      const legacyDb = await createRequiredTimestampNullUpgradeDb(target);
      try {
        const before = await requiredTimestampState(legacyDb, target);
        expect(before.rows[0]).toMatchObject({ persisted_timestamp: null, is_nullable: "YES" });

        let replayError: unknown;
        try {
          await legacyDb.exec(migration);
        } catch (error) {
          replayError = error;
        }

        expect(replayError).toMatchObject({ code: "23514" });
        const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
        expect(message).toContain(requiredTimestampParts(target).column);
        expect(message).toContain(requiredTimestampIdentity(target));
        const after = await requiredTimestampState(legacyDb, target);
        expect(after.rows).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it.each([
    {
      target: "run.started_at",
      sql: `insert into public.hermes_agent_runs (
              id, workflow_id, workflow_version, agent_name, status, started_at
            ) values (
              '89500000-0000-4000-8000-000000000001',
              'direct-null-started-at', '1.0.0', 'vitest', 'running', null
            )`,
    },
    {
      target: "forecast.model_version",
      sql: `insert into public.hermes_forecasts (
              id, stable_key, ticker, scenario, forecast_type, horizon_date,
              predicted_value, model_version
            ) values (
              '89500000-0000-4000-8000-000000000002',
              'direct-null-model-version', 'DIRECTNULL', 'Base', 'annualized_return',
              '2099-01-01', 0.14, null
            )`,
    },
    {
      target: "run.created_at",
      sql: `insert into public.hermes_agent_runs (
              id, workflow_id, workflow_version, agent_name, status, created_at
            ) values (
              '89500000-0000-4000-8000-000000000003',
              'direct-null-run-created-at', '1.0.0', 'vitest', 'running', null
            )`,
    },
    {
      target: "node.created_at",
      sql: `insert into public.hermes_underwriting_nodes (
              id, stable_key, node_type, title, as_of, created_at
            ) values (
              '89500000-0000-4000-8000-000000000004',
              'direct-null-node-created-at', 'company', 'Direct null audit',
              '2000-01-01T00:00:00Z', null
            )`,
    },
  ])("does not permit direct NULL to bypass restored NOT NULL for $target", async ({ sql }) => {
    await expect(db.exec(sql)).rejects.toMatchObject({
      code: expect.stringMatching(/^(22007|23502|23514)$/),
    });
  });

  it("restores NOT NULL on every required loop timestamp while preserving optional timestamps", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      await legacyDb.exec(`
        drop trigger if exists hermes_prompt_versions_validate_timestamps on public.hermes_prompt_versions;
        drop trigger if exists hermes_prompt_versions_a_validate_timestamps on public.hermes_prompt_versions;
        drop trigger if exists hermes_prompt_versions_protect on public.hermes_prompt_versions;
        drop trigger if exists hermes_prompt_versions_hash_body on public.hermes_prompt_versions;
        drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;
        drop trigger if exists hermes_underwriting_nodes_validate_insert on public.hermes_underwriting_nodes;
        drop trigger if exists hermes_underwriting_edges_validate_insert on public.hermes_underwriting_edges;
        drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;
        drop trigger if exists hermes_forecast_outcomes_validate_insert on public.hermes_forecast_outcomes;

        insert into public.hermes_prompt_versions (
          prompt_id, version, role, schema_version, prompt_body, content_sha256,
          released_at, created_at, updated_at
        ) values (
          'valid-nullability-history', '1.0.0', 'vitest', '1.0.0', 'Preserve valid history.',
          encode(extensions.digest('Preserve valid history.', 'sha256'), 'hex'),
          '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z', '2000-01-03T00:00:00Z'
        );
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status,
          started_at, completed_at, created_at, updated_at
        ) values (
          '89600000-0000-4000-8000-000000000001',
          'valid-nullability-history', '1.0.0', 'vitest', 'running',
          '2000-02-01T00:00:00Z', null,
          '2000-02-02T00:00:00Z', '2000-02-03T00:00:00Z'
        );
        insert into public.hermes_underwriting_nodes (
          id, stable_key, node_type, title, as_of, valid_until,
          agent_run_id, created_at, updated_at
        ) values
          (
            '89600000-0000-4000-8000-000000000002',
            'valid-nullability-history:from', 'company', 'From',
            '2000-03-01T00:00:00Z', null,
            '89600000-0000-4000-8000-000000000001',
            '2000-03-02T00:00:00Z', '2000-03-03T00:00:00Z'
          ),
          (
            '89600000-0000-4000-8000-000000000003',
            'valid-nullability-history:to', 'forecast', 'To',
            '2000-03-01T00:00:00Z', '2000-03-01T00:00:00Z',
            '89600000-0000-4000-8000-000000000001',
            '2000-03-02T00:00:00Z', '2000-03-03T00:00:00Z'
          );
        insert into public.hermes_underwriting_edges (
          id, from_node_id, to_node_id, relationship, agent_run_id, created_at
        ) values (
          '89600000-0000-4000-8000-000000000004',
          '89600000-0000-4000-8000-000000000002',
          '89600000-0000-4000-8000-000000000003',
          'has_forecast', '89600000-0000-4000-8000-000000000001',
          '2000-03-04T00:00:00Z'
        );
        insert into public.hermes_forecasts (
          id, stable_key, ticker, scenario, forecast_type, horizon_date,
          predicted_value, agent_run_id, model_version, as_of, created_at, updated_at
        ) values (
          '89600000-0000-4000-8000-000000000005',
          'valid-nullability-history:forecast', 'VALIDNULL', 'Base',
          'annualized_return', '2001-01-01', 0.14,
          '89600000-0000-4000-8000-000000000001',
          '2000-04-01T00:00:00Z', '2000-04-02T00:00:00Z',
          '2000-04-03T00:00:00Z', '2000-04-04T00:00:00Z'
        );
        insert into public.hermes_forecast_outcomes (
          id, forecast_id, observed_at, actual_value, evidence_url, created_at
        ) values (
          '89600000-0000-4000-8000-000000000006',
          '89600000-0000-4000-8000-000000000005',
          '2002-01-01T00:00:00Z', 0.12,
          'https://example.com/valid-nullability-history',
          '2002-01-02T00:00:00Z'
        );

        drop view if exists public.hermes_forecast_evaluations;
        alter table public.hermes_forecasts
          drop constraint if exists hermes_forecasts_model_version_finite_check;
        alter table public.hermes_forecasts
          drop constraint if exists hermes_forecasts_model_version_as_of_check;
        alter table public.hermes_forecasts
          drop constraint if exists hermes_forecasts_logical_identity_key;
        alter table public.hermes_forecasts
          alter column model_version type text using model_version::text;
      `);
      await legacyDb.exec(
        requiredLoopTimestampTargets
          .map((target) => {
            const { table, column } = requiredTimestampParts(target);
            return `alter table public.${table} alter column ${column} drop not null;`;
          })
          .join("\n"),
      );

      const persistedHistory = () => legacyDb.query(
        `select jsonb_build_object(
           'prompt', (select row_to_json(p) from (
             select released_at::text, created_at::text, updated_at::text
             from public.hermes_prompt_versions where prompt_id = 'valid-nullability-history'
           ) p),
           'run', (select row_to_json(r) from (
             select started_at::text, completed_at::text, created_at::text, updated_at::text
             from public.hermes_agent_runs where id = '89600000-0000-4000-8000-000000000001'
           ) r),
           'node', (select row_to_json(n) from (
             select as_of::text, valid_until::text, created_at::text, updated_at::text
             from public.hermes_underwriting_nodes where id = '89600000-0000-4000-8000-000000000002'
           ) n),
           'edge', (select row_to_json(e) from (
             select created_at::text from public.hermes_underwriting_edges
             where id = '89600000-0000-4000-8000-000000000004'
           ) e),
           'forecast', (select row_to_json(f) from (
             select model_version::text, as_of::text, horizon_date::text,
                    created_at::text, updated_at::text
             from public.hermes_forecasts where id = '89600000-0000-4000-8000-000000000005'
           ) f),
           'outcome', (select row_to_json(o) from (
             select observed_at::text, created_at::text
             from public.hermes_forecast_outcomes where id = '89600000-0000-4000-8000-000000000006'
           ) o)
         ) as history`,
      );
      const before = await persistedHistory();

      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const after = await persistedHistory();
      expect(after.rows).toEqual(before.rows);
      const requiredColumns = await legacyDb.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `select table_name, column_name, data_type, is_nullable
         from information_schema.columns
         where table_schema = 'public'
           and (table_name, column_name) in (${requiredLoopTimestampTargets
             .map((target) => {
               const { table, column } = requiredTimestampParts(target);
               return `('${table}', '${column}')`;
             })
             .join(", ")})
         order by table_name, column_name`,
      );
      expect(requiredColumns.rows).toHaveLength(requiredLoopTimestampTargets.length);
      expect(requiredColumns.rows.every((column) => column.is_nullable === "NO")).toBe(true);
      expect(requiredColumns.rows).toContainEqual({
        table_name: "hermes_forecasts",
        column_name: "model_version",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      });

      const nullableContracts = await legacyDb.query<{ table_name: string; column_name: string; is_nullable: string }>(
        `select table_name, column_name, is_nullable
         from information_schema.columns
         where table_schema = 'public'
           and (table_name, column_name) in (
             ('hermes_agent_runs', 'completed_at'),
             ('hermes_underwriting_nodes', 'valid_until'),
             ('hermes_forecasts', 'horizon_date')
           )
         order by table_name, column_name`,
      );
      expect(nullableContracts.rows).toEqual([
        { table_name: "hermes_agent_runs", column_name: "completed_at", is_nullable: "YES" },
        { table_name: "hermes_forecasts", column_name: "horizon_date", is_nullable: "NO" },
        { table_name: "hermes_underwriting_nodes", column_name: "valid_until", is_nullable: "YES" },
      ]);
    } finally {
      await legacyDb.close();
    }
  });

  it("denies direct confidential reads to Supabase user roles while preserving server service-role reads", async () => {
    const tables = [
      "hermes_prompt_versions",
      "hermes_agent_runs",
      "hermes_underwriting_nodes",
      "hermes_underwriting_edges",
      "hermes_forecasts",
      "hermes_forecast_outcomes",
      "hermes_forecast_evaluations",
    ];
    for (const table of tables) {
      const privileges = await db.query<{ anon_select: boolean; authenticated_select: boolean; service_select: boolean }>(
        `select
           has_table_privilege('anon', 'public.${table}', 'SELECT') as anon_select,
           has_table_privilege('authenticated', 'public.${table}', 'SELECT') as authenticated_select,
           has_table_privilege('service_role', 'public.${table}', 'SELECT') as service_select`,
      );
      expect(privileges.rows).toEqual([{ anon_select: false, authenticated_select: false, service_select: true }]);
    }

    await db.exec("begin; set local role anon");
    try {
      await expect(db.query("select * from public.hermes_agent_runs limit 1")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("rollback");
    }
    await db.exec("begin; set local role service_role");
    try {
      await expect(db.query("select * from public.hermes_agent_runs limit 1")).resolves.toBeDefined();
    } finally {
      await db.exec("rollback");
    }
  });

  it("enforces complete-or-null prompt provenance at the database boundary", async () => {
    await db.query(
      `insert into public.hermes_prompt_versions (
         prompt_id, version, role, schema_version, prompt_body
       ) values ('db-prompt', '1.0.0', 'test', '1.0.0', 'Immutable test prompt.')`,
    );

    await expect(
      db.query(
        `insert into public.hermes_agent_runs (
           workflow_id, workflow_version, prompt_id, agent_name, status
         ) values ('partial-prompt-id', '1.0.0', 'db-prompt', 'vitest', 'running')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        `insert into public.hermes_agent_runs (
           workflow_id, workflow_version, prompt_version, agent_name, status
         ) values ('partial-prompt-version', '1.0.0', '1.0.0', 'vitest', 'running')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        `update public.hermes_agent_runs
         set prompt_id = 'db-prompt'
         where id = $1`,
        [runIds.running],
      ),
    ).rejects.toBeDefined();
    await expect(
      db.query(
        `insert into public.hermes_agent_runs (
           id, workflow_id, workflow_version, prompt_id, prompt_version, agent_name, status
         ) values ($1, 'full-prompt-pair', '1.0.0', 'db-prompt', '1.0.0', 'vitest', 'running')`,
        ["10000000-0000-4000-8000-000000000016"],
      ),
    ).resolves.toBeDefined();
  });

  it("fails migration replay closed when legacy prompt provenance is partial", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      await legacyDb.exec("alter table public.hermes_agent_runs drop constraint hermes_agent_runs_prompt_provenance_pair_check");
      await legacyDb.query(
        `insert into public.hermes_agent_runs (
           workflow_id, workflow_version, prompt_id, agent_name, status
         ) values ('legacy-partial-prompt', '1.0.0', 'missing-version', 'vitest', 'running')`,
      );

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("partial prompt provenance"),
      });
      const preserved = await legacyDb.query<{ prompt_id: string; prompt_version: string | null }>(
        "select prompt_id, prompt_version from public.hermes_agent_runs where workflow_id = 'legacy-partial-prompt'",
      );
      expect(preserved.rows).toEqual([{ prompt_id: "missing-version", prompt_version: null }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("repairs only explicitly known legacy seed prompt contracts and preserves unexpected valid content", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256
         ) values (
           'company-underwrite', '1.0.0', 'test', '1.0.0', $1,
           encode(extensions.digest($1, 'sha256'), 'hex')
         )`,
        ["Unexpected but internally valid prompt contract."],
      );

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("unexpected prompt contract"),
      });
      const preserved = await legacyDb.query<{ prompt_body: string }>(
        "select prompt_body from public.hermes_prompt_versions where prompt_id = 'company-underwrite' and version = '1.0.0'",
      );
      expect(preserved.rows).toEqual([{ prompt_body: "Unexpected but internally valid prompt contract." }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("treats all four exact current immutable tuples as replay no-ops", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      for (const contract of promptContracts) {
        await insertPromptContract(legacyDb, contract, contract.currentBody);
      }
      const before = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions order by prompt_id, version`,
      );

      await legacyDb.exec(migration);
      await legacyDb.exec(migration);
      const after = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions order by prompt_id, version`,
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("repairs all four exact legacy tuples and makes the repaired tuples replay-idempotent", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      for (const contract of promptContracts) {
        await insertPromptContract(legacyDb, contract, contract.legacyBody);
      }

      await legacyDb.exec(migration);
      const repaired = await legacyDb.query<{
        prompt_id: string;
        version: string;
        role: string;
        schema_version: string;
        prompt_body: string;
        content_sha256: string;
        status: string;
        description: string;
        metadata: unknown;
      }>(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata
         from public.hermes_prompt_versions order by prompt_id, version`,
      );
      expect(repaired.rows).toEqual(
        [...promptContracts]
          .sort((left, right) => `${left.promptId}@${left.version}`.localeCompare(`${right.promptId}@${right.version}`))
          .map((contract) => ({
            prompt_id: contract.promptId,
            version: contract.version,
            role: contract.role,
            schema_version: contract.schemaVersion,
            prompt_body: contract.currentBody,
            content_sha256: createHash("sha256").update(contract.currentBody).digest("hex"),
            status: contract.status,
            description: contract.description,
            metadata: contract.metadata,
          })),
      );
      const beforeReplay = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions order by prompt_id, version`,
      );

      await legacyDb.exec(migration);
      const afterReplay = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions order by prompt_id, version`,
      );
      expect(afterReplay.rows).toEqual(beforeReplay.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("repairs all four exact content-unavailable legacy tuples and makes them replay-idempotent", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      for (const contract of promptContracts) {
        await insertPromptContract(
          legacyDb,
          contract,
          contract.legacyBody,
          { source: "north-star-seed", contentStored: false },
        );
      }

      await legacyDb.exec(migration);
      const repaired = await legacyDb.query<{
        prompt_id: string;
        version: string;
        role: string;
        schema_version: string;
        prompt_body: string;
        content_sha256: string;
        status: string;
        description: string;
        metadata: unknown;
      }>(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata
         from public.hermes_prompt_versions order by prompt_id, version`,
      );
      expect(repaired.rows).toEqual(
        [...promptContracts]
          .sort((left, right) => `${left.promptId}@${left.version}`.localeCompare(`${right.promptId}@${right.version}`))
          .map((contract) => ({
            prompt_id: contract.promptId,
            version: contract.version,
            role: contract.role,
            schema_version: contract.schemaVersion,
            prompt_body: contract.currentBody,
            content_sha256: createHash("sha256").update(contract.currentBody).digest("hex"),
            status: contract.status,
            description: contract.description,
            metadata: contract.metadata,
          })),
      );
      const beforeReplay = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions order by prompt_id, version`,
      );

      await legacyDb.exec(migration);
      const afterReplay = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions order by prompt_id, version`,
      );
      expect(afterReplay.rows).toEqual(beforeReplay.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it.each(promptContracts)(
    "fails closed and atomically preserves a near-miss content-unavailable tuple for $promptId@$version",
    async (contract) => {
      const legacyDb = await createPromptReplayDb();
      try {
        const nearMissMetadata = {
          source: "north-star-seed",
          contentStored: false,
          unexpected: true,
        };
        await insertPromptContract(legacyDb, contract, contract.legacyBody, nearMissMetadata);
        const before = await legacyDb.query(
          `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                  status, description, metadata, released_at, created_at, updated_at
           from public.hermes_prompt_versions where prompt_id = $1 and version = $2`,
          [contract.promptId, contract.version],
        );

        await expect(legacyDb.exec(migration)).rejects.toMatchObject({
          code: "55000",
          message: expect.stringContaining(`${contract.promptId}@${contract.version}`),
        });
        const after = await legacyDb.query(
          `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                  status, description, metadata, released_at, created_at, updated_at
           from public.hermes_prompt_versions where prompt_id = $1 and version = $2`,
          [contract.promptId, contract.version],
        );
        expect(after.rows).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it.each(promptReplayTamperingCases)(
    "fails replay closed and preserves unexpected $field on a $bodyState body/hash contract",
    async ({ bodyState, field, mutation }) => {
      const legacyDb = await createPromptReplayDb();
      const contract = { ...companyPromptContract, ...mutation };
      const promptBody = bodyState === "current" ? contract.currentBody : contract.legacyBody;
      try {
        await legacyDb.query(
          `insert into public.hermes_prompt_versions (
             prompt_id, version, role, schema_version, prompt_body, content_sha256,
             status, description, metadata
           ) values ($1, $2, $3, $4, $5,
             encode(extensions.digest($5, 'sha256'), 'hex'), $6, $7, $8::jsonb)`,
          [
            contract.promptId,
            contract.version,
            contract.role,
            contract.schemaVersion,
            promptBody,
            contract.status,
            contract.description,
            JSON.stringify(contract.metadata),
          ],
        );
        const before = await legacyDb.query(
          `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                  status, description, metadata
           from public.hermes_prompt_versions
           where prompt_id = $1 and version = $2`,
          [contract.promptId, contract.version],
        );

        await expect(legacyDb.exec(migration), `${bodyState} ${field}`).rejects.toMatchObject({
          code: "55000",
          message: expect.stringContaining(`${contract.promptId}@${contract.version}`),
        });
        const after = await legacyDb.query(
          `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                  status, description, metadata
           from public.hermes_prompt_versions
           where prompt_id = $1 and version = $2`,
          [contract.promptId, contract.version],
        );
        expect(after.rows, `${bodyState} ${field}`).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it("fails before mutating a pre-body legacy row whose complete immutable tuple is unexpected", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256,
           status, description, metadata
         ) values ($1, $2, 'Unexpected analyst', $3, null, null, $4, $5, $6::jsonb)`,
        [
          companyPromptContract.promptId,
          companyPromptContract.version,
          companyPromptContract.schemaVersion,
          companyPromptContract.status,
          companyPromptContract.description,
          JSON.stringify(companyPromptContract.metadata),
        ],
      );
      const before = await legacyDb.query(
        "select * from public.hermes_prompt_versions where prompt_id = 'company-underwrite'",
      );

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("company-underwrite@1.0.0"),
      });
      const after = await legacyDb.query(
        "select * from public.hermes_prompt_versions where prompt_id = 'company-underwrite'",
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("repairs an exact pre-body legacy tuple to the complete current tuple", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256,
           status, description, metadata
         ) values ($1, $2, $3, $4, null, null, $5, $6, $7::jsonb)`,
        [
          companyPromptContract.promptId,
          companyPromptContract.version,
          companyPromptContract.role,
          companyPromptContract.schemaVersion,
          companyPromptContract.status,
          companyPromptContract.description,
          JSON.stringify(companyPromptContract.metadata),
        ],
      );

      await legacyDb.exec(migration);
      const repaired = await legacyDb.query(
        `select role, schema_version, prompt_body, status, description, metadata,
                content_sha256 = encode(extensions.digest(prompt_body, 'sha256'), 'hex') as hash_matches
         from public.hermes_prompt_versions where prompt_id = 'company-underwrite'`,
      );
      expect(repaired.rows).toEqual([{
        role: companyPromptContract.role,
        schema_version: companyPromptContract.schemaVersion,
        prompt_body: companyPromptContract.currentBody,
        status: companyPromptContract.status,
        description: companyPromptContract.description,
        metadata: companyPromptContract.metadata,
        hash_matches: true,
      }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("repairs an explicitly known legacy prompt body and checksum together", async () => {
    const legacyDb = await createPromptReplayDb();
    const legacyBody = "Identify evidence that would invalidate the active thesis or make QQQ the better default.";
    const expectedBody = "Review the active thesis and identify specific source-verifiable evidence that could invalidate each material assumption, impair the downside case, or make QQQ the better default. Keep falsifiers distinct from blended conviction scores.";
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256,
           status, description, metadata
         ) values (
           'risk-falsifier-review', '1.0.0', 'Risk and falsifier analyst', 'falsifier-review-v1', $1,
           encode(extensions.digest($1, 'sha256'), 'hex'), 'active', $1,
           '{"source":"north-star-seed"}'::jsonb
         )`,
        [legacyBody],
      );

      await legacyDb.exec(migration);
      const repaired = await legacyDb.query<{
        role: string;
        schema_version: string;
        prompt_body: string;
        hash_matches: boolean;
        status: string;
        description: string;
        metadata: unknown;
        updated_at: Date;
      }>(
        `select role, schema_version, prompt_body,
                content_sha256 = encode(extensions.digest(prompt_body, 'sha256'), 'hex') as hash_matches,
                status, description, metadata, updated_at
         from public.hermes_prompt_versions
         where prompt_id = 'risk-falsifier-review' and version = '1.0.0'`,
      );
      expect(repaired.rows).toEqual([{
        role: "Risk and falsifier analyst",
        schema_version: "falsifier-review-v1",
        prompt_body: expectedBody,
        hash_matches: true,
        status: "active",
        description: legacyBody,
        metadata: { source: "north-star-seed" },
        updated_at: expect.any(Date),
      }]);

      await legacyDb.exec(migration);
      const replayed = await legacyDb.query(
        `select role, schema_version, prompt_body,
                content_sha256 = encode(extensions.digest(prompt_body, 'sha256'), 'hex') as hash_matches,
                status, description, metadata, updated_at
         from public.hermes_prompt_versions
         where prompt_id = 'risk-falsifier-review' and version = '1.0.0'`,
      );
      expect(replayed.rows).toEqual(repaired.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("leaves the current expected prompt contract unchanged across replay", async () => {
    const legacyDb = await createPromptReplayDb();
    const expectedBody = "After a forecast horizon has been reached, record the realized value, realized QQQ comparator when applicable, binary outcome when applicable, and a required evidence URL. Preserve the original forecast and close it atomically. Never grade a forecast early.";
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256,
           status, description, metadata
         ) values (
           'forecast-outcome-grade', '0.1.0', 'Outcome evaluator', 'forecast-outcome-v1', $1,
           encode(extensions.digest($1, 'sha256'), 'hex'), 'draft',
           'Close due forecasts against observed results and QQQ, preserving source evidence.',
           '{ "source" : "north-star-seed" }'::jsonb
         )`,
        [expectedBody],
      );
      const before = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions where prompt_id = 'forecast-outcome-grade'`,
      );

      await legacyDb.exec(migration);
      await legacyDb.exec(migration);
      const after = await legacyDb.query(
        `select prompt_id, version, role, schema_version, prompt_body, content_sha256,
                status, description, metadata, released_at, created_at, updated_at
         from public.hermes_prompt_versions where prompt_id = 'forecast-outcome-grade'`,
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("backfills a missing checksum for a non-seed legacy prompt and enforces the body-consistent invariant", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256
         ) values ('non-seed-contract', '7.1.0', 'test', '1.0.0', 'Preserve this body.', null)`,
      );

      await legacyDb.exec(migration);
      const row = await legacyDb.query<{ prompt_body: string; hash_matches: boolean; hash_nullable: string }>(
        `select prompt_body,
                content_sha256 = encode(extensions.digest(prompt_body, 'sha256'), 'hex') as hash_matches,
                (select is_nullable from information_schema.columns
                 where table_schema = 'public' and table_name = 'hermes_prompt_versions' and column_name = 'content_sha256') as hash_nullable
         from public.hermes_prompt_versions where prompt_id = 'non-seed-contract'`,
      );
      expect(row.rows).toEqual([{ prompt_body: "Preserve this body.", hash_matches: true, hash_nullable: "NO" }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails replay closed on any legacy prompt checksum mismatch and preserves the row", async () => {
    const legacyDb = await createPromptReplayDb();
    try {
      await legacyDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body, content_sha256
         ) values ('mismatched-contract', '1.0.0', 'test', '1.0.0', 'Do not rewrite me.', repeat('0', 64))`,
      );

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("checksum does not match prompt_body"),
      });
      const preserved = await legacyDb.query<{ prompt_body: string; content_sha256: string }>(
        "select prompt_body, content_sha256 from public.hermes_prompt_versions where prompt_id = 'mismatched-contract'",
      );
      expect(preserved.rows).toEqual([{ prompt_body: "Do not rewrite me.", content_sha256: "0".repeat(64) }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("allows active or unattributed forecasts but rejects missing and terminal run provenance", async () => {
    await expect(insertForecast(db, "forecast-running", runIds.running, "2026-09-07T00:00:00.000Z")).resolves.toBeDefined();
    await expect(insertForecast(db, "forecast-queued", runIds.queued, "2026-09-07T01:00:00.000Z")).resolves.toBeDefined();
    await expect(insertForecast(db, "forecast-unattributed", null, "2026-09-07T02:00:00.000Z")).resolves.toBeDefined();

    await expect(insertForecast(db, "forecast-missing", "10000000-0000-4000-8000-000000000099", "2026-09-07T03:00:00.000Z")).rejects.toMatchObject({ code: "P0002" });
    for (const [index, status] of ["succeeded", "failed", "cancelled"].entries()) {
      await expect(insertForecast(db, `forecast-${status}`, runIds[status as "succeeded" | "failed" | "cancelled"], `2026-09-07T0${index + 4}:00:00.000Z`)).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("cannot register forecasts"),
      });
    }
  });

  it("rejects non-timestamp forecast model versions at the database boundary", async () => {
    await expect(insertForecast(db, "forecast-v1", runIds.running, "v1")).rejects.toMatchObject({
      code: expect.stringMatching(/^(22007|22008)$/),
    });
  });

  it("rejects impossible forecast model-version timestamps at the database boundary", async () => {
    await expect(
      insertForecast(db, "forecast-impossible-date", runIds.running, "2026-99-99T99:99:99Z"),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(22007|22008)$/) });
  });

  it("rejects future forecast model publication instants on direct insert", async () => {
    await db.exec("begin; set local role service_role");
    try {
      await expect(
        insertForecast(db, "forecast-future-model", runIds.running, "9999-01-01T00:00:00.000Z"),
      ).rejects.toMatchObject({
        code: "22007",
        message: expect.stringMatching(/forecast-future-model.*model_version.*as_of/),
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it("accepts model_version equal to as_of by an offset-equivalent instant at the CHECK boundary", async () => {
    await db.exec("begin");
    try {
      await db.exec("alter table public.hermes_forecasts disable trigger hermes_forecasts_protect_immutability");
      await expect(
        db.exec(`
          insert into public.hermes_forecasts (
            id, stable_key, ticker, scenario, forecast_type, horizon_date,
            predicted_value, model_version, as_of
          ) values (
            '89900000-0000-4000-8000-000000000004',
            'offset-model-as-of-equality', 'OFFSET', 'Base', 'annualized_return',
            '2099-01-01', 0.14,
            '2006-03-01T00:00:00Z', '2006-02-28T19:00:00-05:00'
          )
        `),
      ).resolves.toBeDefined();
    } finally {
      await db.exec("rollback");
    }
  });

  it.each(["infinity", "-infinity"])(
    "rejects non-finite forecast model version %s on direct insert",
    async (modelVersion) => {
      await expect(
        insertForecast(
          db,
          `forecast-${modelVersion === "infinity" ? "positive" : "negative"}-infinity`,
          runIds.running,
          modelVersion,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("hermes_forecasts_model_version_finite_check"),
      });
    },
  );

  it.each([
    ["infinity", runIds.rpcInfinity],
    ["-infinity", runIds.rpcNegativeInfinity],
  ])("rejects non-finite forecast model version %s through the graph RPC", async (modelVersion, runId) => {
    const suffix = modelVersion === "infinity" ? "positive" : "negative";
    const ticker = modelVersion === "infinity" ? "RPCPOS" : "RPCNEG";
    const nodes = [
      {
        stable_key: `rpc-${suffix}-infinity:company`,
        node_type: "company",
        ticker,
        title: ticker,
        as_of: "2026-09-07T00:00:00.000Z",
      },
    ];
    const forecasts = [
      {
        stable_key: `rpc-${suffix}-infinity:forecast`,
        ticker,
        scenario: "Base",
        forecast_type: "annualized_return",
        horizon_date: "2099-01-01",
        predicted_value: 0.14,
        model_version: modelVersion,
      },
    ];

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
        [runId, JSON.stringify(nodes), JSON.stringify(forecasts)],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("hermes_forecasts_model_version_finite_check"),
    });

    const persisted = await db.query<{ nodes: number; forecasts: number }>(
      `select
         (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = $1) as nodes,
         (select count(*)::int from public.hermes_forecasts where agent_run_id = $1) as forecasts`,
      [runId],
    );
    expect(persisted.rows).toEqual([{ nodes: 0, forecasts: 0 }]);
  });

  it.each([
    ["predicted_value", "NaN"],
    ["predicted_value", "Infinity"],
    ["predicted_value", "-Infinity"],
    ["benchmark_value", "NaN"],
    ["benchmark_value", "Infinity"],
    ["benchmark_value", "-Infinity"],
  ])("rejects non-finite forecast %s=%s on direct service-role insert", async (column, value) => {
    await db.exec("begin; set local role service_role");
    try {
      await expect(
        db.query(
          `insert into public.hermes_forecasts (
             stable_key, ticker, scenario, forecast_type, horizon_date,
             predicted_value, benchmark_value, agent_run_id, model_version
           ) values ($1, 'FINITE', 'Base', 'annualized_return', '2099-01-01',
             ${column === "predicted_value" ? "$2" : "0.14"},
             ${column === "benchmark_value" ? "$2" : "0.1"}, $3, $4)`,
          [`non-finite-${column}-${value}`, value, runIds.running, `2006-01-0${value === "NaN" ? "1" : value === "Infinity" ? "2" : "3"}T00:00:00Z`],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db.exec("rollback");
    }
  });

  it.each([
    ["predicted_value", "NaN"],
    ["benchmark_value", "Infinity"],
  ])("rejects non-finite graph RPC forecast %s before any writes", async (column, value) => {
    const nodes = [{ stable_key: `numeric-rpc:${column}`, node_type: "company", ticker: "NUM", title: "NUM", as_of: "2006-02-01T00:00:00Z" }];
    const forecast = {
      stable_key: `numeric-rpc:${column}:forecast`,
      ticker: "NUM",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: column === "predicted_value" ? value : 0.14,
      benchmark_value: column === "benchmark_value" ? value : 0.1,
      model_version: "2006-02-01T00:00:00Z",
    };

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
        [runIds.atomicFailure, JSON.stringify(nodes), JSON.stringify([forecast])],
      ),
    ).rejects.toMatchObject({ code: "22023", message: expect.stringContaining("finite numeric") });
    const persisted = await db.query<{ nodes: number; forecasts: number }>(
      `select
         (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = $1) as nodes,
         (select count(*)::int from public.hermes_forecasts where agent_run_id = $1) as forecasts`,
      [runIds.atomicFailure],
    );
    expect(persisted.rows).toEqual([{ nodes: 0, forecasts: 0 }]);
  });

  it("treats equivalent model-version timestamps as one logical forecast", async () => {
    await expect(
      insertForecast(db, "forecast-canonical-instant", runIds.running, "2026-09-01T00:00:00Z"),
    ).resolves.toBeDefined();
    await expect(
      insertForecast(db, "forecast-equivalent-offset", runIds.running, "2026-08-31T19:00:00-05:00"),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("fails replay with forecast identity before casting a non-castable legacy text model version", async () => {
    const id = "76000000-0000-4000-8000-000000000001";
    const stableKey = "legacy-model-version-v1";
    const legacyDb = await createLegacyForecastReplayDb({
      id,
      stableKey,
      modelVersion: "v1",
      horizonDate: "2099-01-01",
      textModelVersion: true,
    });
    try {
      const before = await legacyForecastReplayState(legacyDb, stableKey);
      let replayError: unknown;
      try {
        await legacyDb.exec(migration);
      } catch (error) {
        replayError = error;
      }

      expect(replayError).toMatchObject({ code: "23514" });
      const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
      expect(message).toContain("non-castable model_version");
      expect(message).toContain(id);
      expect(message).toContain(stableKey);
      expect(message).toContain("v1");
      const after = await legacyForecastReplayState(legacyDb, stableKey);
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it.each([
    ["equal", "2020-01-02"],
    ["backward", "2020-01-01"],
    ["null", null],
  ] as const)(
    "fails replay with forecast identity for a legacy $0 horizon and rolls back schema changes",
    async (label, horizonDate) => {
      const suffix = label === "equal" ? "2" : label === "backward" ? "3" : "4";
      const id = `76000000-0000-4000-8000-00000000000${suffix}`;
      const stableKey = `legacy-${label}-horizon`;
      const legacyDb = await createLegacyForecastReplayDb({
        id,
        stableKey,
        modelVersion: "2020-01-01T00:00:00Z",
        horizonDate,
      });
      try {
        const before = await legacyForecastReplayState(legacyDb, stableKey);
        let replayError: unknown;
        try {
          await legacyDb.exec(migration);
        } catch (error) {
          replayError = error;
        }

        expect(replayError).toMatchObject({ code: "23514" });
        const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
        expect(message).toContain("forward forecast horizon");
        expect(message).toContain("horizon_date");
        expect(message).toContain(id);
        expect(message).toContain(stableKey);
        const after = await legacyForecastReplayState(legacyDb, stableKey);
        expect(after.rows).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it("idempotently upgrades existing valid text model versions to timestamp instants", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin
          new.updated_at := pg_catalog.now();
          return new;
        end;
        $$;
        create publication supabase_realtime;
        create table public.hermes_forecasts (
          id uuid primary key default gen_random_uuid(),
          stable_key text not null,
          ticker text not null,
          scenario text not null,
          forecast_type text not null,
          horizon_date date not null,
          probability numeric,
          predicted_value numeric not null,
          unit text not null default 'ratio',
          benchmark_symbol text not null default 'QQQ',
          benchmark_value numeric,
          agent_run_id uuid,
          model_version text not null,
          as_of timestamptz not null default now(),
          status text not null default 'open',
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint hermes_forecasts_logical_identity_key
            unique (ticker, scenario, forecast_type, unit, model_version)
        );
        insert into public.hermes_forecasts (
          stable_key, ticker, scenario, forecast_type, horizon_date,
          predicted_value, model_version
        ) values
          (
            'legacy-valid-model-version', 'MU', 'Base', 'annualized_return',
            '2099-01-01', 0.14, (pg_catalog.statement_timestamp() - interval '1 day')::text
          ),
          (
            'legacy-valid-postgres-model-version', 'LEGACYTS', 'Base', 'annualized_return',
            '2099-01-01', 0.14, 'March 1, 2009 00:00:00 UTC'
          );
      `);

      await legacyDb.exec(migration);
      const afterConversion = await legacyDb.query(
        `select stable_key,
                to_char(model_version at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as canonical_model_version,
                model_version <= pg_catalog.statement_timestamp() as historical
         from public.hermes_forecasts order by stable_key`,
      );

      await legacyDb.exec(migration);
      const afterSecondReplay = await legacyDb.query(
        `select stable_key,
                to_char(model_version at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as canonical_model_version,
                model_version <= pg_catalog.statement_timestamp() as historical
         from public.hermes_forecasts order by stable_key`,
      );

      const column = await legacyDb.query<{ data_type: string }>(
        `select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'hermes_forecasts' and column_name = 'model_version'`,
      );

      expect(column.rows).toEqual([{ data_type: "timestamp with time zone" }]);
      expect(afterConversion.rows).toEqual([
        {
          stable_key: "legacy-valid-model-version",
          canonical_model_version: expect.any(String),
          historical: true,
        },
        {
          stable_key: "legacy-valid-postgres-model-version",
          canonical_model_version: "2009-03-01T00:00:00.000000Z",
          historical: true,
        },
      ]);
      expect(afterSecondReplay.rows).toEqual(afterConversion.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails closed before canonicalization when offset-equivalent forecasts have different complete prompt provenance", async () => {
    const legacyDb = await createLegacyEquivalentInstantDb({ promptPairs: "different" });
    try {
      const before = await legacyDb.query(
        `select id, stable_key, prompt_id, prompt_version, model_version::text
         from public.hermes_forecasts order by id`,
      );
      const schemaBefore = await legacyDb.query(
        `select
           (select data_type from information_schema.columns
            where table_schema = 'public' and table_name = 'hermes_forecasts'
              and column_name = 'model_version') as model_version_type,
           (select array_agg(conname order by conname)
            from pg_catalog.pg_constraint
            where conrelid = 'public.hermes_forecasts'::regclass) as forecast_constraints`,
      );
      let replayError: unknown;
      try {
        await legacyDb.exec(migration);
      } catch (error) {
        replayError = error;
      }

      expect(replayError).toMatchObject({ code: "55000" });
      const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
      expect(message).toContain("prompt provenance");
      expect(message).toContain("20000000-0000-4000-8000-000000000001");
      expect(message).toContain("20000000-0000-4000-8000-000000000002");
      const after = await legacyDb.query(
        `select id, stable_key, prompt_id, prompt_version, model_version::text
         from public.hermes_forecasts order by id`,
      );
      const schemaAfter = await legacyDb.query(
        `select
           (select data_type from information_schema.columns
            where table_schema = 'public' and table_name = 'hermes_forecasts'
              and column_name = 'model_version') as model_version_type,
           (select array_agg(conname order by conname)
            from pg_catalog.pg_constraint
            where conrelid = 'public.hermes_forecasts'::regclass) as forecast_constraints`,
      );
      const outcomes = await legacyDb.query<{ count: number }>(
        "select count(*)::int as count from public.hermes_forecast_outcomes",
      );
      expect(after.rows).toEqual(before.rows);
      expect(schemaAfter.rows).toEqual(schemaBefore.rows);
      expect(outcomes.rows).toEqual([{ count: 3 }]);
    } finally {
      await legacyDb.close();
    }
  });

  it.each([
    ["forecast updated_at", { forecastAuditDifference: true }, [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ]],
    ["outcome created_at", { outcomeAuditDifference: true }, [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
    ]],
  ] as const)("fails both migration attempts atomically when offset-collision %s differs", async (_label, options, identities) => {
    const legacyDb = await createLegacyEquivalentInstantDb(options);
    try {
      const snapshot = () => legacyDb.query(
        `select
           (select jsonb_agg(row_to_json(f) order by f.id) from public.hermes_forecasts f) as forecasts,
           (select jsonb_agg(row_to_json(o) order by o.id) from public.hermes_forecast_outcomes o) as outcomes,
           (select data_type from information_schema.columns
            where table_schema = 'public' and table_name = 'hermes_forecasts'
              and column_name = 'model_version') as model_version_type,
           (select array_agg(conname order by conname)
            from pg_catalog.pg_constraint
            where conrelid in ('public.hermes_forecasts'::regclass, 'public.hermes_forecast_outcomes'::regclass)) as constraints`,
      );
      const before = await snapshot();

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let replayError: unknown;
        try {
          await legacyDb.exec(migration);
        } catch (error) {
          replayError = error;
        }
        expect(replayError).toMatchObject({ code: "55000" });
        const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
        for (const identity of identities) expect(message).toContain(identity);
        expect((await snapshot()).rows).toEqual(before.rows);
      }
    } finally {
      await legacyDb.close();
    }
  });

  it("merges offset-equivalent legacy forecasts with the same complete prompt pair and remaps outcomes replay-safely", async () => {
    const legacyDb = await createLegacyEquivalentInstantDb({ promptPairs: "same" });
    try {
      await legacyDb.exec(migration);
      const afterFirstReplay = await legacyDb.query<{
        id: string;
        prompt_id: string;
        prompt_version: string;
        outcomes: number;
      }>(
        `select f.id, f.prompt_id, f.prompt_version,
                count(o.id)::int as outcomes
         from public.hermes_forecasts f
         left join public.hermes_forecast_outcomes o on o.forecast_id = f.id
         group by f.id, f.prompt_id, f.prompt_version`,
      );
      await legacyDb.exec(migration);
      const afterSecondReplay = await legacyDb.query<{
        id: string;
        prompt_id: string;
        prompt_version: string;
        outcomes: number;
      }>(
        `select f.id, f.prompt_id, f.prompt_version,
                count(o.id)::int as outcomes
         from public.hermes_forecasts f
         left join public.hermes_forecast_outcomes o on o.forecast_id = f.id
         group by f.id, f.prompt_id, f.prompt_version`,
      );

      expect(afterFirstReplay.rows).toEqual([{
        id: "20000000-0000-4000-8000-000000000001",
        prompt_id: "legacy-prompt-one",
        prompt_version: "1.0.0",
        outcomes: 2,
      }]);
      expect(afterSecondReplay.rows).toEqual(afterFirstReplay.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("deduplicates no-prompt offset-equivalent legacy forecasts without losing identical outcomes across replay", async () => {
    const legacyDb = await createLegacyEquivalentInstantDb();
    try {
      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const forecasts = await legacyDb.query<{ id: string; canonical: string; prompt_id: string | null; prompt_version: string | null }>(
        `select id, prompt_id, prompt_version,
                to_char(model_version at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as canonical
         from public.hermes_forecasts`,
      );
      const outcomes = await legacyDb.query<{ forecast_id: string; count: number }>(
        `select forecast_id, count(*)::int as count
         from public.hermes_forecast_outcomes
         group by forecast_id`,
      );
      expect(forecasts.rows).toEqual([
        {
          id: "20000000-0000-4000-8000-000000000001",
          canonical: "2026-09-07T00:00:00Z",
          prompt_id: null,
          prompt_version: null,
        },
      ]);
      expect(outcomes.rows).toEqual([
        { forecast_id: "20000000-0000-4000-8000-000000000001", count: 2 },
      ]);

      await expect(
        legacyDb.query(
          `insert into public.hermes_forecasts (
             id, stable_key, ticker, scenario, forecast_type, horizon_date,
             probability, predicted_value, unit, benchmark_symbol, benchmark_value,
             agent_run_id, model_version, as_of, status, metadata, created_at, updated_at
           ) values (
             '20000000-0000-4000-8000-000000000003', 'legacy-equivalent', 'MU', 'Base',
             'annualized_return', '2099-01-01', 0.6, 0.14, 'ratio', 'QQQ', 0.1,
             null, '2026-09-06T19:00:00-05:00', '2026-09-07T01:00:00Z', 'open',
             '{"source":"legacy"}'::jsonb, '2026-09-07T01:00:00Z', '2026-09-07T02:00:00Z'
           )`,
        ),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await legacyDb.close();
    }
  });

  it("fails closed when offset-equivalent legacy forecasts conflict", async () => {
    const legacyDb = await createLegacyEquivalentInstantDb({ conflictingForecast: true });
    try {
      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("conflicting immutable forecast content or provenance"),
      });

      const preserved = await legacyDb.query<{ count: number }>(
        "select count(*)::int as count from public.hermes_forecasts",
      );
      expect(preserved.rows).toEqual([{ count: 2 }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails closed when offset-equivalent legacy forecast outcomes conflict", async () => {
    const legacyDb = await createLegacyEquivalentInstantDb({ conflictingOutcome: true });
    try {
      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("conflicting outcomes"),
      });

      const preserved = await legacyDb.query<{ forecasts: number; outcomes: number }>(
        `select
           (select count(*)::int from public.hermes_forecasts) as forecasts,
           (select count(*)::int from public.hermes_forecast_outcomes) as outcomes`,
      );
      expect(preserved.rows).toEqual([{ forecasts: 2, outcomes: 3 }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails closed without rewriting an existing non-finite model version", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin
          new.updated_at := pg_catalog.now();
          return new;
        end;
        $$;
        create publication supabase_realtime;
        create table public.hermes_forecasts (
          id uuid primary key default gen_random_uuid(),
          stable_key text not null,
          ticker text not null,
          scenario text not null,
          forecast_type text not null,
          horizon_date date not null,
          probability numeric,
          predicted_value numeric not null,
          unit text not null default 'ratio',
          benchmark_symbol text not null default 'QQQ',
          benchmark_value numeric,
          agent_run_id uuid,
          model_version timestamptz not null,
          as_of timestamptz not null default now(),
          status text not null default 'open',
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint hermes_forecasts_logical_identity_key
            unique (ticker, scenario, forecast_type, unit, model_version)
        );
        insert into public.hermes_forecasts (
          stable_key, ticker, scenario, forecast_type, horizon_date,
          predicted_value, model_version
        ) values (
          'legacy-non-finite-model-version', 'MU', 'Base', 'annualized_return',
          '2099-01-01', 0.14, 'infinity'
        );
      `);

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("non-finite model_version"),
      });

      const preserved = await legacyDb.query<{ model_version: string }>(
        "select model_version::text from public.hermes_forecasts where stable_key = 'legacy-non-finite-model-version'",
      );
      expect(preserved.rows).toEqual([{ model_version: "infinity" }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails replay closed on an existing finite future model version without partial migration changes", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      await legacyDb.exec(`
        drop trigger hermes_forecasts_protect_immutability on public.hermes_forecasts;
        alter table public.hermes_forecasts
          drop constraint if exists hermes_forecasts_model_version_as_of_check;
      `);
      await legacyDb.query(
        `insert into public.hermes_forecasts (
           stable_key, ticker, scenario, forecast_type, horizon_date,
           predicted_value, model_version
         ) values (
           'legacy-finite-future-model-version', 'MU', 'Base', 'annualized_return',
           '9999-12-31', 0.14, pg_catalog.statement_timestamp() + interval '1 year'
         )`,
      );
      const before = await legacyDb.query(
        `select
           (select model_version > pg_catalog.statement_timestamp()
            from public.hermes_forecasts
            where stable_key = 'legacy-finite-future-model-version') as is_future,
           (select array_agg(conname order by conname)
            from pg_catalog.pg_constraint
            where conrelid = 'public.hermes_forecasts'::regclass) as constraints,
           pg_catalog.pg_get_functiondef(
             'public.hermes_protect_forecast_immutability()'::regprocedure
           ) as protection_function,
           (select count(*)::int
            from pg_catalog.pg_trigger
            where tgrelid = 'public.hermes_forecasts'::regclass
              and tgname = 'hermes_forecasts_protect_immutability'
              and not tgisinternal) as protection_triggers`,
      );
      expect(before.rows[0]).toMatchObject({ is_future: true, protection_triggers: 0 });

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("future model_version"),
      });

      const after = await legacyDb.query(
        `select
           (select model_version > pg_catalog.statement_timestamp()
            from public.hermes_forecasts
            where stable_key = 'legacy-finite-future-model-version') as is_future,
           (select array_agg(conname order by conname)
            from pg_catalog.pg_constraint
            where conrelid = 'public.hermes_forecasts'::regclass) as constraints,
           pg_catalog.pg_get_functiondef(
             'public.hermes_protect_forecast_immutability()'::regprocedure
           ) as protection_function,
           (select count(*)::int
            from pg_catalog.pg_trigger
            where tgrelid = 'public.hermes_forecasts'::regclass
              and tgname = 'hermes_forecasts_protect_immutability'
              and not tgisinternal) as protection_triggers`,
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails replay closed without rewriting an existing non-finite forecast numeric", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      await legacyDb.exec(`
        alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_predicted_value_finite_check;
        alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_benchmark_value_finite_check;
      `);
      await legacyDb.query(
        `insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status)
         values ($1, 'legacy-invalid-numeric', '1.0.0', 'vitest', 'running')`,
        ["60000000-0000-4000-8000-000000000001"],
      );
      await legacyDb.query(
        `insert into public.hermes_forecasts (
           stable_key, ticker, scenario, forecast_type, horizon_date,
           predicted_value, agent_run_id, model_version
         ) values ('legacy-invalid-numeric', 'BAD', 'Base', 'annualized_return',
           '2099-01-01', 'NaN', $1, '2009-01-01T00:00:00Z')`,
        ["60000000-0000-4000-8000-000000000001"],
      );

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("non-finite forecast numeric"),
      });
      const preserved = await legacyDb.query<{ predicted_value: string }>(
        "select predicted_value::text from public.hermes_forecasts where stable_key = 'legacy-invalid-numeric'",
      );
      expect(preserved.rows).toEqual([{ predicted_value: "NaN" }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("fails replay closed without rewriting an existing non-finite outcome numeric", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      await legacyDb.exec(`
        alter table public.hermes_forecast_outcomes drop constraint if exists hermes_forecast_outcomes_actual_value_finite_check;
        alter table public.hermes_forecast_outcomes drop constraint if exists hermes_forecast_outcomes_qqq_value_finite_check;
      `);
      await legacyDb.query(
        `insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status)
         values ($1, 'legacy-invalid-outcome', '1.0.0', 'vitest', 'running')`,
        ["60000000-0000-4000-8000-000000000002"],
      );
      const forecastId = await makeDueForecast(legacyDb, "legacy-invalid-outcome", "60000000-0000-4000-8000-000000000002", "2009-02-01T00:00:00Z");
      await legacyDb.query(
        `insert into public.hermes_forecast_outcomes (
           forecast_id, observed_at, actual_value, qqq_value, evidence_url
         ) values ($1, pg_catalog.statement_timestamp() - interval '1 minute',
           0.11, 'Infinity', 'https://example.com/outcome')`,
        [forecastId],
      );

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("non-finite outcome numeric"),
      });
      const preserved = await legacyDb.query<{ qqq_value: string }>(
        "select qqq_value::text from public.hermes_forecast_outcomes where forecast_id = $1",
        [forecastId],
      );
      expect(preserved.rows).toEqual([{ qqq_value: "Infinity" }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("denies service_role direct graph node inserts", async () => {
    const privileges = await db.query<{ can_insert: boolean }>(
      "select has_table_privilege('service_role', 'public.hermes_underwriting_nodes', 'INSERT') as can_insert",
    );
    expect(privileges.rows).toEqual([{ can_insert: false }]);

    await db.exec("begin; set local role service_role");
    try {
      await expect(
        db.query(
          `insert into public.hermes_underwriting_nodes (
             stable_key, node_type, title, as_of, agent_run_id
           ) values ('service-direct-future', 'company', 'Bypass', '9999-01-01T00:00:00Z', $1)`,
          [runIds.serviceNode],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("rollback");
    }

    const persisted = await db.query<{ count: number }>(
      "select count(*)::int as count from public.hermes_underwriting_nodes where stable_key = 'service-direct-future'",
    );
    expect(persisted.rows).toEqual([{ count: 0 }]);
  });

  it("denies service_role direct graph edge inserts", async () => {
    const privileges = await db.query<{ can_insert: boolean }>(
      "select has_table_privilege('service_role', 'public.hermes_underwriting_edges', 'INSERT') as can_insert",
    );
    expect(privileges.rows).toEqual([{ can_insert: false }]);

    const firstNodes = [
      { stable_key: "service-edge-one", node_type: "company", title: "One", as_of: "2001-01-01T00:00:00Z" },
    ];
    const secondNodes = [
      { stable_key: "service-edge-two", node_type: "company", title: "Two", as_of: "2001-01-01T00:00:00Z" },
    ];
    await db.exec("begin; set local role service_role");
    try {
      await db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.serviceEdgeOne, JSON.stringify(firstNodes)],
      );
      await db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.serviceEdgeTwo, JSON.stringify(secondNodes)],
      );
      const nodeIds = await db.query<{ id: string; agent_run_id: string }>(
        `select id, agent_run_id
         from public.hermes_underwriting_nodes
         where agent_run_id in ($1, $2)
         order by agent_run_id`,
        [runIds.serviceEdgeOne, runIds.serviceEdgeTwo],
      );
      await expect(
        db.query(
          `insert into public.hermes_underwriting_edges (
             from_node_id, to_node_id, relationship, agent_run_id
           ) values ($1, $2, 'supports', $3)`,
          [nodeIds.rows[0]?.id, nodeIds.rows[1]?.id, runIds.serviceEdgeOne],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("rollback");
    }
  });

  it("rejects future graph nodes at the table boundary for privileged callers", async () => {
    await db.exec("begin");
    try {
      await expect(
        db.query(
          `insert into public.hermes_underwriting_nodes (
             stable_key, node_type, title, as_of, agent_run_id
           ) values ('owner-direct-future', 'company', 'Bypass', '9999-01-01T00:00:00Z', $1)`,
          [runIds.serviceNode],
        ),
      ).rejects.toMatchObject({
        code: "22007",
        message: expect.stringContaining("non-finite or future as_of"),
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it.each(["-infinity", "infinity"])(
    "rejects non-finite graph node as_of=%s on direct insert",
    async (asOf) => {
      await db.exec("begin");
      try {
        await expect(
          db.query(
            `insert into public.hermes_underwriting_nodes (
               stable_key, node_type, title, as_of, agent_run_id
             ) values ($1, 'company', 'Invalid graph', $2, $3)`,
            [`direct-graph-${asOf}`, asOf, runIds.serviceNode],
          ),
        ).rejects.toMatchObject({
          code: "22007",
          message: expect.stringContaining("non-finite or future as_of"),
        });
      } finally {
        await db.exec("rollback");
      }
    },
  );

  it.each([
    ["earlier finite instant", "2009-04-30T23:59:59Z"],
    ["positive infinity", "infinity"],
    ["negative infinity", "-infinity"],
  ])("rejects graph node valid_until at the direct-table boundary: %s", async (_label, validUntil) => {
    await db.exec("begin");
    try {
      await expect(
        db.query(
          `insert into public.hermes_underwriting_nodes (
             stable_key, node_type, title, as_of, valid_until, agent_run_id
           ) values ($1, 'company', 'Invalid validity', '2009-05-01T00:00:00Z', $2, $3)`,
          [`direct-valid-until-${validUntil}`, validUntil, runIds.serviceNode],
        ),
      ).rejects.toMatchObject({
        code: "22007",
        message: expect.stringContaining("valid_until must be finite and greater than or equal to as_of"),
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it("accepts null, equal, offset-equivalent, and finite future valid_until at the direct-table boundary", async () => {
    await db.exec("begin");
    try {
      await db.query(
        `insert into public.hermes_underwriting_nodes (
           stable_key, node_type, title, as_of, valid_until, agent_run_id
         ) values
           ('direct-valid-until-null', 'company', 'Null', '2009-05-01T00:00:00Z', null, $1),
           ('direct-valid-until-equal', 'company', 'Equal', '2009-05-01T00:00:00Z', '2009-05-01T00:00:00Z', $1),
           ('direct-valid-until-offset', 'company', 'Offset', '2009-04-30T19:00:00-05:00', '2009-05-01T00:00:00+00:00', $1),
           ('direct-valid-until-future', 'company', 'Future', '2009-05-01T00:00:00Z', '2999-01-01T00:00:00Z', $1)`,
        [runIds.serviceNode],
      );
      const accepted = await db.query<{ count: number; equal_count: number; null_count: number; future_count: number }>(
        `select count(*)::int as count,
                count(*) filter (where valid_until = as_of)::int as equal_count,
                count(*) filter (where valid_until is null)::int as null_count,
                count(*) filter (where valid_until > pg_catalog.statement_timestamp())::int as future_count
         from public.hermes_underwriting_nodes
         where stable_key like 'direct-valid-until-%'`,
      );
      expect(accepted.rows).toEqual([{ count: 4, equal_count: 2, null_count: 1, future_count: 1 }]);
    } finally {
      await db.exec("rollback");
    }
  });

  it.each([
    ["-infinity", runIds.rpcNegativeInfinity],
    ["infinity", runIds.rpcInfinity],
  ])("rejects non-finite graph node as_of=%s through the graph RPC before writes", async (asOf, runId) => {
    const nodes = [{
      stable_key: `rpc-graph-${asOf}`,
      node_type: "company",
      ticker: "BADTIME",
      title: "Invalid graph",
      as_of: asOf,
    }];

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runId, JSON.stringify(nodes)],
      ),
    ).rejects.toMatchObject({
      code: "22007",
      message: expect.stringContaining("non-finite or future as_of"),
    });
    const persisted = await db.query<{ count: number }>(
      "select count(*)::int as count from public.hermes_underwriting_nodes where stable_key = $1",
      [`rpc-graph-${asOf}`],
    );
    expect(persisted.rows).toEqual([{ count: 0 }]);
  });

  it.each([
    ["earlier finite instant", "2009-04-30T23:59:59Z", runIds.validUntilRpcEarlier],
    ["positive infinity", "infinity", runIds.validUntilRpcInfinity],
    ["negative infinity", "-infinity", runIds.validUntilRpcNegativeInfinity],
  ])("rejects graph node valid_until through the graph RPC atomically: %s", async (_label, validUntil, runId) => {
    const nodes = [
      { stable_key: `rpc-valid-until-valid-${runId}`, node_type: "company", title: "Valid", as_of: "2009-05-01T00:00:00Z", valid_until: null },
      { stable_key: `rpc-valid-until-invalid-${runId}`, node_type: "company", title: "Invalid", as_of: "2009-05-01T00:00:00Z", valid_until: validUntil },
    ];

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runId, JSON.stringify(nodes)],
      ),
    ).rejects.toMatchObject({
      code: "22007",
      message: "Graph node valid_until must be finite and greater than or equal to as_of.",
    });
    const persisted = await db.query<{ count: number }>(
      "select count(*)::int as count from public.hermes_underwriting_nodes where agent_run_id = $1",
      [runId],
    );
    expect(persisted.rows).toEqual([{ count: 0 }]);
  });

  it("accepts null, equal, offset-equivalent, and finite future valid_until through the graph RPC", async () => {
    const nodes = [
      { stable_key: "rpc-valid-until-null", node_type: "company", title: "Null", as_of: "2009-05-01T00:00:00Z", valid_until: null },
      { stable_key: "rpc-valid-until-equal", node_type: "company", title: "Equal", as_of: "2009-05-01T00:00:00Z", valid_until: "2009-05-01T00:00:00Z" },
      { stable_key: "rpc-valid-until-offset", node_type: "company", title: "Offset", as_of: "2009-04-30T19:00:00-05:00", valid_until: "2009-05-01T00:00:00+00:00" },
      { stable_key: "rpc-valid-until-future", node_type: "company", title: "Future", as_of: "2009-05-01T00:00:00Z", valid_until: "2999-01-01T00:00:00Z" },
    ];
    const saved = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb) as result",
      [runIds.validUntilRpcPositive, JSON.stringify(nodes)],
    );
    expect(saved.rows[0]?.result).toEqual({ nodes: 4, edges: 0, forecasts_inserted: 0 });
    const accepted = await db.query<{ count: number; equal_count: number; null_count: number; future_count: number }>(
      `select count(*)::int as count,
              count(*) filter (where valid_until = as_of)::int as equal_count,
              count(*) filter (where valid_until is null)::int as null_count,
              count(*) filter (where valid_until > pg_catalog.statement_timestamp())::int as future_count
       from public.hermes_underwriting_nodes where agent_run_id = $1`,
      [runIds.validUntilRpcPositive],
    );
    expect(accepted.rows).toEqual([{ count: 4, equal_count: 2, null_count: 1, future_count: 1 }]);
  });

  it.each(["-infinity", "infinity"])(
    "fails replay closed and preserves an existing non-finite graph as_of=%s",
    async (asOf) => {
      const legacyDb = await createGraphTimestampUpgradeDb(asOf);
      try {
        await expect(legacyDb.exec(migration)).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining("non-finite or future as_of"),
        });
        const preserved = await legacyDb.query<{ as_of: string }>(
          "select as_of::text from public.hermes_underwriting_nodes where stable_key = 'legacy-graph-timestamp'",
        );
        expect(preserved.rows).toEqual([{ as_of: asOf }]);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it("upgrades valid graph history and remains idempotent on second replay", async () => {
    const legacyDb = await createGraphTimestampUpgradeDb("2009-04-01T00:00:00Z");
    try {
      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const result = await legacyDb.query<{ nodes: number; constraints: number; validated: boolean }>(
        `select
           (select count(*)::int from public.hermes_underwriting_nodes) as nodes,
           count(*)::int as constraints,
           bool_and(convalidated) as validated
         from pg_constraint
         where conrelid = 'public.hermes_underwriting_nodes'::regclass
           and conname = 'hermes_underwriting_nodes_as_of_valid_check'`,
      );
      expect(result.rows).toEqual([{ nodes: 1, constraints: 1, validated: true }]);
    } finally {
      await legacyDb.close();
    }
  });

  it.each([
    ["earlier finite instant", "'2009-04-30T23:59:59Z'::timestamptz"],
    ["positive infinity", "'infinity'::timestamptz"],
    ["negative infinity", "'-infinity'::timestamptz"],
  ])("fails graph valid_until migration replay closed without partial changes: %s", async (_label, validUntilSql) => {
    const legacyDb = await createGraphValidUntilUpgradeDb(validUntilSql);
    try {
      const before = await graphValidUntilSchemaState(legacyDb);

      await expect(legacyDb.exec(migration)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringMatching(/75000000-0000-4000-8000-000000000001[\s\S]*legacy-graph-valid-until[\s\S]*valid_until/),
      });

      const after = await graphValidUntilSchemaState(legacyDb);
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("upgrades valid finite-future graph valid_until history and remains idempotent", async () => {
    const legacyDb = await createGraphValidUntilUpgradeDb("'2999-01-01T00:00:00Z'::timestamptz");
    try {
      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const result = await legacyDb.query<{ nodes: number; constraints: number; validated: boolean; triggers: number; preserved: boolean }>(
        `select
           (select count(*)::int from public.hermes_underwriting_nodes
            where id = '75000000-0000-4000-8000-000000000001') as nodes,
           count(*)::int as constraints,
           bool_and(convalidated) as validated,
           (select count(*)::int from pg_catalog.pg_trigger
            where tgrelid = 'public.hermes_underwriting_nodes'::regclass
              and tgname = 'hermes_underwriting_nodes_validate_insert'
              and not tgisinternal) as triggers,
           (select valid_until = '2999-01-01T00:00:00Z'::timestamptz
            from public.hermes_underwriting_nodes
            where id = '75000000-0000-4000-8000-000000000001') as preserved
         from pg_catalog.pg_constraint
         where conrelid = 'public.hermes_underwriting_nodes'::regclass
           and conname = 'hermes_underwriting_nodes_valid_until_valid_check'`,
      );
      expect(result.rows).toEqual([{ nodes: 1, constraints: 1, validated: true, triggers: 1, preserved: true }]);
    } finally {
      await legacyDb.close();
    }
  });

  it.each([
    ["agent-run-started-at", "future", "71000000-0000-4000-8000-000000000001"],
    ["agent-run-started-at", "non-finite", "71000000-0000-4000-8000-000000000001"],
    ["forecast-as-of", "future", "72000000-0000-4000-8000-000000000001"],
    ["forecast-as-of", "non-finite", "72000000-0000-4000-8000-000000000001"],
  ] as const)(
    "fails replay closed for an existing %s %s registration timestamp without partial changes",
    async (target, invalidTimestamp, identity) => {
      const legacyDb = await createRegistrationTimestampUpgradeDb(target, invalidTimestamp);
      try {
        const before = await registrationTimestampSchemaState(legacyDb, target);

        await expect(legacyDb.exec(migration)).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining(identity),
        });

        const after = await registrationTimestampSchemaState(legacyDb, target);
        expect(after.rows).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it.each(invalidLegacyCompletionCases)(
    "fails replay closed for legacy completed_at chronology: $label ($status)",
    async (completionCase) => {
      const legacyDb = await createAgentRunCompletionUpgradeDb(completionCase);
      try {
        const before = await agentRunCompletionSchemaState(legacyDb);

        await expect(legacyDb.exec(migration)).rejects.toMatchObject({
          code: "23514",
          message: expect.stringMatching(/73000000-0000-4000-8000-000000000001[\s\S]*completed_at/),
        });

        const after = await agentRunCompletionSchemaState(legacyDb);
        expect(after.rows).toEqual(before.rows);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it("upgrades valid historical run completion chronology and remains idempotent", async () => {
    const legacyDb = await createAgentRunCompletionUpgradeDb({
      label: "valid historical completion",
      status: "succeeded",
      completedAtSql: "pg_catalog.statement_timestamp() - interval '1 day'",
    });
    try {
      const before = await agentRunCompletionSchemaState(legacyDb);

      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const after = await agentRunCompletionSchemaState(legacyDb);
      expect(after.rows[0]).toMatchObject({
        persisted_run: before.rows[0]?.persisted_run,
        run_protection_triggers: 1,
      });
      const constraint = await legacyDb.query<{ count: number; validated: boolean }>(
        `select count(*)::int as count, bool_and(convalidated) as validated
         from pg_catalog.pg_constraint
         where conrelid = 'public.hermes_agent_runs'::regclass
           and conname = 'hermes_agent_runs_completion_valid_check'`,
      );
      expect(constraint.rows).toEqual([{ count: 1, validated: true }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("upgrades historical run and forecast registration timestamps and remains idempotent", async () => {
    const legacyDb = new PGlite({ extensions: { pgcrypto } });
    try {
      await legacyDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await legacyDb.exec(migration);
      await legacyDb.exec(`
        drop trigger hermes_agent_runs_protect on public.hermes_agent_runs;
        drop trigger hermes_forecasts_protect_immutability on public.hermes_forecasts;
        insert into public.hermes_agent_runs (
          id, workflow_id, workflow_version, agent_name, status, started_at
        ) values (
          '71000000-0000-4000-8000-000000000002',
          'legacy-historical-started-at', '1.0.0', 'vitest', 'running',
          pg_catalog.statement_timestamp() - interval '1 year'
        );
        insert into public.hermes_forecasts (
          id, stable_key, ticker, scenario, forecast_type, horizon_date,
          predicted_value, model_version, as_of
        ) values (
          '72000000-0000-4000-8000-000000000002',
          'legacy-historical-forecast-as-of', 'MU', 'Base', 'annualized_return',
          '2099-01-01', 0.14, '2020-01-01T00:00:00Z',
          pg_catalog.statement_timestamp() - interval '1 year'
        );
      `);
      const before = await legacyDb.query<{ started_at: string; as_of: string }>(
        `select
           (select started_at from public.hermes_agent_runs
            where id = '71000000-0000-4000-8000-000000000002') as started_at,
           (select as_of from public.hermes_forecasts
            where id = '72000000-0000-4000-8000-000000000002') as as_of`,
      );

      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const after = await legacyDb.query(
        `select
           (select started_at from public.hermes_agent_runs
            where id = '71000000-0000-4000-8000-000000000002') as started_at,
           (select as_of from public.hermes_forecasts
            where id = '72000000-0000-4000-8000-000000000002') as as_of,
           (select count(*)::int from pg_catalog.pg_constraint
            where conrelid = 'public.hermes_agent_runs'::regclass
              and conname = 'hermes_agent_runs_started_at_valid_check'
              and convalidated) as run_constraints,
           (select count(*)::int from pg_catalog.pg_constraint
            where conrelid = 'public.hermes_forecasts'::regclass
              and conname = 'hermes_forecasts_as_of_valid_check'
              and convalidated) as forecast_constraints,
           (select count(*)::int from pg_catalog.pg_trigger
            where tgrelid = 'public.hermes_agent_runs'::regclass
              and tgname = 'hermes_agent_runs_protect' and not tgisinternal) as run_triggers,
           (select count(*)::int from pg_catalog.pg_trigger
            where tgrelid = 'public.hermes_forecasts'::regclass
              and tgname = 'hermes_forecasts_protect_immutability' and not tgisinternal) as forecast_triggers`,
      );
      expect(after.rows).toEqual([{
        ...before.rows[0]!,
        run_constraints: 1,
        forecast_constraints: 1,
        run_triggers: 1,
        forecast_triggers: 1,
      }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("rejects cross-run graph edges at the table boundary for privileged callers", async () => {
    const firstNodes = [
      { stable_key: "trigger-edge-one", node_type: "company", title: "One", as_of: "2002-01-01T00:00:00Z" },
    ];
    const secondNodes = [
      { stable_key: "trigger-edge-two", node_type: "company", title: "Two", as_of: "2002-01-01T00:00:00Z" },
    ];
    await db.exec("begin");
    try {
      await db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.triggerEdgeOne, JSON.stringify(firstNodes)],
      );
      await db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.triggerEdgeTwo, JSON.stringify(secondNodes)],
      );
      const nodeIds = await db.query<{ id: string; agent_run_id: string }>(
        `select id, agent_run_id
         from public.hermes_underwriting_nodes
         where agent_run_id in ($1, $2)
         order by agent_run_id`,
        [runIds.triggerEdgeOne, runIds.triggerEdgeTwo],
      );
      await expect(
        db.query(
          `insert into public.hermes_underwriting_edges (
             from_node_id, to_node_id, relationship, agent_run_id
           ) values ($1, $2, 'supports', $3)`,
          [nodeIds.rows[0]?.id, nodeIds.rows[1]?.id, runIds.triggerEdgeOne],
        ),
      ).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("same agent run"),
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it("allows service_role graph RPC writes and exact terminal replay", async () => {
    const nodes = [
      { stable_key: "service-rpc:company", node_type: "company", title: "Company", as_of: "2003-01-01T00:00:00Z" },
      { stable_key: "service-rpc:forecast", node_type: "forecast", title: "Forecast", as_of: "2003-01-01T00:00:00Z" },
    ];
    const edges = [
      { from_key: "service-rpc:company", to_key: "service-rpc:forecast", relationship: "has_forecast" },
    ];

    await db.exec("begin; set local role service_role");
    let committed = false;
    try {
      const saved = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb) as result",
        [runIds.serviceRpc, JSON.stringify(nodes), JSON.stringify(edges)],
      );
      expect(saved.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 0 });

      await db.query(
        "update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1",
        [runIds.serviceRpc],
      );
      const replay = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb) as result",
        [runIds.serviceRpc, JSON.stringify(nodes), JSON.stringify(edges)],
      );
      expect(replay.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 0 });
      await db.exec("commit");
      committed = true;
    } finally {
      if (!committed) await db.exec("rollback");
    }

    const persisted = await db.query<{ nodes: number; edges: number }>(
      `select
         (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = $1) as nodes,
         (select count(*)::int from public.hermes_underwriting_edges where agent_run_id = $1) as edges`,
      [runIds.serviceRpc],
    );
    expect(persisted.rows).toEqual([{ nodes: 2, edges: 1 }]);
  });

  it("seed completion rejects unattributed output for an arbitrary running exact-contract run atomically", async () => {
    const runId = "1f000000-0000-4000-8000-000000000010";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    try {
      const payload = seedCompletionPayload("seed-null-running", "NULLRUN");
      const before = await seedCompletionState(seedDb, runId);

      await expect(
        seedDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [runId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("company-underwrite@1.0.0"),
      });
      expect((await seedCompletionState(seedDb, runId)).rows).toEqual(before.rows);
    } finally {
      await seedDb.close();
    }
  });

  it.each(["running", "queued"] as const)(
    "seed completion accepts explicit company-underwrite@1.0.0 output for an exact-contract %s run",
    async (status) => {
      const runId = status === "running"
        ? "1f000000-0000-4000-8000-000000000011"
        : "1f000000-0000-4000-8000-000000000012";
      const seedDb = await createSeedCompletionRpcDb({ runId, status });
      try {
        const payload = attributedSeedCompletionPayload(`seed-explicit-${status}`, status === "running" ? "RUN" : "QUEUE");
        const saved = await seedDb.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb) as result",
          [runId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
        );
        expect(saved.rows[0]?.result).toEqual({ nodes: 1, edges: 0, forecasts_inserted: 1 });
        expect((await seedCompletionState(seedDb, runId)).rows[0]).toMatchObject({
          status: "succeeded",
          nodes: 1,
          edges: 0,
          forecasts: 1,
        });
      } finally {
        await seedDb.close();
      }
    },
  );

  it("seed completion permits all-null terminal replay only for the exact historical UUID and immutable production contract", async () => {
    const seedDb = await createSeedCompletionRpcDb({ runId: historicalNullProvenanceSeedRunId });
    try {
      const payload = seedCompletionPayload("historical-null-replay", "HIST");
      await seedDb.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, $4::jsonb)",
        [historicalNullProvenanceSeedRunId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts)],
      );
      await seedDb.query(
        `update public.hermes_agent_runs
         set status = 'succeeded', completed_at = pg_catalog.statement_timestamp(),
             output_ref = $2::jsonb, metrics = $3::jsonb
         where id = $1`,
        [historicalNullProvenanceSeedRunId, JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
      );
      const before = await seedCompletionState(seedDb, historicalNullProvenanceSeedRunId);

      const replay = await seedDb.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb) as result",
        [historicalNullProvenanceSeedRunId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
      );
      expect(replay.rows[0]?.result).toEqual({ nodes: 1, edges: 0, forecasts_inserted: 0 });
      expect((await seedCompletionState(seedDb, historicalNullProvenanceSeedRunId)).rows).toEqual(before.rows);
    } finally {
      await seedDb.close();
    }
  });

  it("seed completion rejects all-null terminal replay for a non-historical exact-contract UUID", async () => {
    const runId = "1f000000-0000-4000-8000-000000000017";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    try {
      const payload = seedCompletionPayload("non-historical-null-replay", "NONHIST");
      await seedDb.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, $4::jsonb)",
        [runId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts)],
      );
      await seedDb.query(
        `update public.hermes_agent_runs
         set status = 'succeeded', completed_at = pg_catalog.statement_timestamp(),
             output_ref = $2::jsonb, metrics = $3::jsonb
         where id = $1`,
        [runId, JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
      );
      const before = await seedCompletionState(seedDb, runId);

      await expect(
        seedDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [runId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("exact immutable historical seed run"),
      });
      expect((await seedCompletionState(seedDb, runId)).rows).toEqual(before.rows);
    } finally {
      await seedDb.close();
    }
  });

  it("seed completion rejects the historical UUID when the immutable run has old default provenance", async () => {
    const legacyDb = await createLegacyQueuedRunChronologyReplayDb();
    try {
      await legacyDb.exec(migration);
      const payload = seedCompletionPayload("historical-wrong-contract", "WRONG");
      const before = await seedCompletionState(legacyDb, historicalNullProvenanceSeedRunId);

      await expect(
        legacyDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [historicalNullProvenanceSeedRunId, JSON.stringify(payload.nodes), JSON.stringify(payload.edges), JSON.stringify(payload.forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
        ),
      ).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("exact current seed run contract"),
      });
      expect((await seedCompletionState(legacyDb, historicalNullProvenanceSeedRunId)).rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it.each([
    ["mixed null node", null, currentSeedPrompt],
    ["mixed null forecast", currentSeedPrompt, null],
    ["alternate complete pair", { prompt_id: "alternate-underwrite", prompt_version: "9.9.9" }, { prompt_id: "alternate-underwrite", prompt_version: "9.9.9" }],
  ] as const)("seed completion rejects %s attribution atomically", async (_label, nodePrompt, forecastPrompt) => {
    const runId = "1f000000-0000-4000-8000-000000000013";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    try {
      await seedDb.query(
        `insert into public.hermes_prompt_versions (
           prompt_id, version, role, schema_version, prompt_body
         ) values ('alternate-underwrite', '9.9.9', 'Alternate', 'alternate-v1', 'Alternate prompt fixture.')`,
      );
      const payload = seedCompletionPayload("seed-invalid-provenance", "BADPAIR");
      const nodes = payload.nodes.map((node) => ({ ...node, ...(nodePrompt ?? { prompt_id: null, prompt_version: null }) }));
      const forecasts = payload.forecasts.map((forecast) => ({ ...forecast, ...(forecastPrompt ?? { prompt_id: null, prompt_version: null }) }));
      const before = await seedCompletionState(seedDb, runId);

      await expect(
        seedDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [runId, JSON.stringify(nodes), JSON.stringify(payload.edges), JSON.stringify(forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("company-underwrite@1.0.0"),
      });
      expect((await seedCompletionState(seedDb, runId)).rows).toEqual(before.rows);
    } finally {
      await seedDb.close();
    }
  });

  it("seed completion rejects SQL NULL nodes before any mutation", async () => {
    const runId = "1f000000-0000-4000-8000-000000000018";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    try {
      const payload = attributedSeedCompletionPayload("seed-null-nodes", "NULLNODES");
      const before = await seedCompletionState(seedDb, runId);

      await expect(
        seedDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [runId, null, JSON.stringify(payload.edges), JSON.stringify(payload.forecasts), JSON.stringify(payload.outputRef), JSON.stringify(payload.metrics)],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await seedCompletionState(seedDb, runId)).rows).toEqual(before.rows);
    } finally {
      await seedDb.close();
    }
  });

  it("rejects active seed completion with SQL NULL forecasts before any mutation", async () => {
    const payload = seedCompletionPayload("seed-null-active", "NULLA");
    const before = await seedCompletionState(db, runIds.seedNullActive);

    await expect(
      db.query(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
        [
          runIds.seedNullActive,
          JSON.stringify(payload.nodes),
          JSON.stringify(payload.edges),
          null,
          JSON.stringify(payload.outputRef),
          JSON.stringify(payload.metrics),
        ],
      ),
    ).rejects.toMatchObject({
      code: "22023",
      message: `Underwriting seed run ${runIds.seedNullActive} requires p_forecasts to be a non-empty JSON array.`,
    });

    expect((await seedCompletionState(db, runIds.seedNullActive)).rows).toEqual(before.rows);
  });

  it("rejects SQL NULL forecasts on a succeeded seed replay without mutation", async () => {
    const runId = "1f000000-0000-4000-8000-000000000014";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    try {
      const payload = attributedSeedCompletionPayload("seed-null-terminal", "NULLT");
      await seedDb.query(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
        [
          runId,
          JSON.stringify(payload.nodes),
          JSON.stringify(payload.edges),
          JSON.stringify(payload.forecasts),
          JSON.stringify(payload.outputRef),
          JSON.stringify(payload.metrics),
        ],
      );
      const before = await seedCompletionState(seedDb, runId);

      await expect(
        seedDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [
            runId,
            JSON.stringify(payload.nodes),
            JSON.stringify(payload.edges),
            null,
            JSON.stringify(payload.outputRef),
            JSON.stringify(payload.metrics),
          ],
        ),
      ).rejects.toMatchObject({
        code: "22023",
        message: `Underwriting seed run ${runId} requires p_forecasts to be a non-empty JSON array.`,
      });

      expect((await seedCompletionState(seedDb, runId)).rows).toEqual(before.rows);
    } finally {
      await seedDb.close();
    }
  });

  it.each([
    ["JSON null", runIds.seedForecastJsonNull, "JSONNULL", null],
    ["JSON object", runIds.seedForecastObject, "OBJ", {}],
    ["JSON scalar", runIds.seedForecastScalar, "SCALAR", "not-an-array"],
  ] as const)("rejects a %s seed forecast payload before any mutation", async (_label, runId, ticker, forecastsInput) => {
    const payload = seedCompletionPayload(`seed-invalid-${ticker.toLowerCase()}`, ticker);
    const before = await seedCompletionState(db, runId);

    await expect(
      db.query(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
        [
          runId,
          JSON.stringify(payload.nodes),
          JSON.stringify(payload.edges),
          JSON.stringify(forecastsInput),
          JSON.stringify(payload.outputRef),
          JSON.stringify(payload.metrics),
        ],
      ),
    ).rejects.toMatchObject({
      code: "22023",
      message: `Underwriting seed run ${runId} requires p_forecasts to be a non-empty JSON array.`,
    });

    expect((await seedCompletionState(db, runId)).rows).toEqual(before.rows);
  });

  it("rejects an empty seed forecast array because the current seed contract requires forecasts", async () => {
    const payload = seedCompletionPayload("seed-empty-forecasts", "EMPTY");
    const before = await seedCompletionState(db, runIds.seedForecastEmpty);

    await expect(
      db.query(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
        [
          runIds.seedForecastEmpty,
          JSON.stringify(payload.nodes),
          JSON.stringify(payload.edges),
          JSON.stringify([]),
          JSON.stringify(payload.outputRef),
          JSON.stringify(payload.metrics),
        ],
      ),
    ).rejects.toMatchObject({
      code: "22023",
      message: `Underwriting seed run ${runIds.seedForecastEmpty} requires p_forecasts to be a non-empty JSON array.`,
    });

    expect((await seedCompletionState(db, runIds.seedForecastEmpty)).rows).toEqual(before.rows);
  });

  it("atomically persists an explicit non-empty seed forecast array and succeeds the run, with exact terminal replay", async () => {
    const runId = "1f000000-0000-4000-8000-000000000015";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    const nodes = [
      { stable_key: "atomic-seed:company", node_type: "company", ticker: "ATOM", title: "ATOM", as_of: "2008-01-01T00:00:00Z", ...currentSeedPrompt },
      { stable_key: "atomic-seed:forecast-node", node_type: "forecast", ticker: "ATOM", title: "Base", as_of: "2008-01-01T00:00:00Z", ...currentSeedPrompt },
    ];
    const edges = [{ from_key: "atomic-seed:company", to_key: "atomic-seed:forecast-node", relationship: "has_forecast" }];
    const forecasts = [{
      stable_key: "atomic-seed:forecast",
      ticker: "ATOM",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: 0.14,
      benchmark_value: 0.1,
      model_version: "2008-01-01T00:00:00Z",
      ...currentSeedPrompt,
    }];
    const outputRef = { tables: ["hermes_underwriting_nodes", "hermes_underwriting_edges", "hermes_forecasts"] };
    const metrics = { companies: 1, graphNodes: 2, graphEdges: 1, forecastsExpected: 1 };

    try {
      const saved = await seedDb.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb) as result",
        [runId, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(forecasts), JSON.stringify(outputRef), JSON.stringify(metrics)],
      );
      expect(saved.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 1 });
      const completed = await seedDb.query<{ status: string; output_ref: unknown; metrics: unknown; completed: boolean }>(
        `select status, output_ref, metrics, completed_at is not null as completed
         from public.hermes_agent_runs where id = $1`,
        [runId],
      );
      expect(completed.rows).toEqual([{ status: "succeeded", output_ref: outputRef, metrics, completed: true }]);

      const replay = await seedDb.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb) as result",
        [runId, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(forecasts), JSON.stringify(outputRef), JSON.stringify(metrics)],
      );
      expect(replay.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 0 });
      await expect(
        seedDb.query(
          "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
          [runId, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify([{ ...forecasts[0], predicted_value: 0.99 }]), JSON.stringify(outputRef), JSON.stringify(metrics)],
        ),
      ).rejects.toMatchObject({ code: "55000" });
    } finally {
      await seedDb.close();
    }
  });

  it("uses one canonical statement timestamp for actual RPC completion and updated_at", async () => {
    const runId = "1f000000-0000-4000-8000-000000000016";
    const seedDb = await createSeedCompletionRpcDb({ runId });
    const nodes = [{
      stable_key: "clock-seed:company",
      node_type: "company",
      ticker: "CLOCK",
      title: "CLOCK",
      as_of: "2008-01-01T00:00:00Z",
      ...currentSeedPrompt,
    }];
    const forecasts = [{
      stable_key: "clock-seed:forecast",
      ticker: "CLOCK",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: 0.14,
      model_version: "2008-01-01T00:00:00Z",
      ...currentSeedPrompt,
    }];

    await seedDb.exec("begin");
    let committed = false;
    try {
      await seedDb.query("select pg_catalog.now()");
      await new Promise((resolve) => setTimeout(resolve, 15));
      await seedDb.query(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, '[]'::jsonb, $3::jsonb, '{}'::jsonb, '{}'::jsonb)",
        [runId, JSON.stringify(nodes), JSON.stringify(forecasts)],
      );
      const timestamps = await seedDb.query<{ status: string; completion_matches_update: boolean; audit_ordered: boolean }>(
        `select status,
                completed_at = updated_at as completion_matches_update,
                created_at <= updated_at as audit_ordered
         from public.hermes_agent_runs where id = $1`,
        [runId],
      );
      expect(timestamps.rows).toEqual([{
        status: "succeeded",
        completion_matches_update: true,
        audit_ordered: true,
      }]);
      await seedDb.exec("commit");
      committed = true;
    } finally {
      if (!committed) await seedDb.exec("rollback");
      await seedDb.close();
    }
  });

  it("persists exact node and forecast prompt provenance and rejects partial pairs atomically", async () => {
    await db.query(
      `insert into public.hermes_prompt_versions (
         prompt_id, version, role, schema_version, prompt_body
       ) values
         ('prompt-provenance-test', '1.0.0', 'test', '1.0.0', 'Prompt provenance fixture.'),
         ('prompt-provenance-other', '2.0.0', 'test', '2.0.0', 'Other prompt provenance fixture.')`,
    );
    const prompt = { prompt_id: "prompt-provenance-test", prompt_version: "1.0.0" };
    const nodes = [{
      stable_key: "prompt-provenance:company",
      node_type: "company",
      ticker: "MU",
      title: "MU",
      as_of: "2008-01-15T00:00:00Z",
      ...prompt,
    }];
    const forecasts = [{
      stable_key: "prompt-provenance:forecast",
      ticker: "MU",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: 0.14,
      model_version: "2008-01-15T00:00:00Z",
      ...prompt,
    }];

    await db.query(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
      [runIds.promptProvenance, JSON.stringify(nodes), JSON.stringify(forecasts)],
    );
    const saved = await db.query<{ node_prompt_id: string; node_prompt_version: string; forecast_prompt_id: string; forecast_prompt_version: string }>(
      `select n.prompt_id as node_prompt_id, n.prompt_version as node_prompt_version,
              f.prompt_id as forecast_prompt_id, f.prompt_version as forecast_prompt_version
       from public.hermes_underwriting_nodes n
       cross join public.hermes_forecasts f
       where n.agent_run_id = $1 and f.agent_run_id = $1`,
      [runIds.promptProvenance],
    );
    expect(saved.rows).toEqual([{
      node_prompt_id: prompt.prompt_id,
      node_prompt_version: prompt.prompt_version,
      forecast_prompt_id: prompt.prompt_id,
      forecast_prompt_version: prompt.prompt_version,
    }]);

    const exactRunningReplay = await db.query<{ result: { forecasts_inserted: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb) as result",
      [runIds.promptProvenance, JSON.stringify(nodes), JSON.stringify(forecasts)],
    );
    expect(exactRunningReplay.rows[0]?.result).toMatchObject({ forecasts_inserted: 0 });
    const changedForecastPrompt = [{
      ...forecasts[0],
      prompt_id: "prompt-provenance-other",
      prompt_version: "2.0.0",
    }];
    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
        [runIds.promptProvenance, JSON.stringify(nodes), JSON.stringify(changedForecastPrompt)],
      ),
    ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("Forecast conflicts") });

    await db.query(
      "update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1",
      [runIds.promptProvenance],
    );
    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
        [runIds.promptProvenance, JSON.stringify(nodes), JSON.stringify(forecasts)],
      ),
    ).resolves.toBeDefined();
    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
        [runIds.promptProvenance, JSON.stringify(nodes), JSON.stringify(changedForecastPrompt)],
      ),
    ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("persisted forecasts") });

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.partialPromptProvenance, JSON.stringify([{ ...nodes[0], stable_key: "prompt-provenance:partial", prompt_version: null }])],
      ),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("prompt provenance") });
    const partial = await db.query<{ count: number }>(
      "select count(*)::int as count from public.hermes_underwriting_nodes where agent_run_id = $1",
      [runIds.partialPromptProvenance],
    );
    expect(partial.rows).toEqual([{ count: 0 }]);
  });

  it("rolls graph writes back and leaves the run non-terminal when atomic seed completion fails", async () => {
    const nodes = [{ stable_key: "atomic-failure:company", node_type: "company", ticker: "FAIL", title: "FAIL", as_of: "2008-02-01T00:00:00Z" }];
    const invalidEdges = [{ from_key: "atomic-failure:company", to_key: "atomic-failure:missing", relationship: "supports" }];
    await expect(
      db.query(
        "select public.hermes_complete_underwriting_seed($1, $2::jsonb, $3::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)",
        [runIds.atomicFailure, JSON.stringify(nodes), JSON.stringify(invalidEdges)],
      ),
    ).rejects.toBeDefined();

    const state = await db.query<{ status: string; nodes: number; edges: number; forecasts: number }>(
      `select runs.status,
              (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = runs.id) as nodes,
              (select count(*)::int from public.hermes_underwriting_edges where agent_run_id = runs.id) as edges,
              (select count(*)::int from public.hermes_forecasts where agent_run_id = runs.id) as forecasts
       from public.hermes_agent_runs runs where runs.id = $1`,
      [runIds.atomicFailure],
    );
    expect(state.rows).toEqual([{ status: "running", nodes: 0, edges: 0, forecasts: 0 }]);
  });

  it("rejects duplicate logical edges before writes and accepts exact terminal replay", async () => {
    const nodes = [
      { stable_key: "db:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2026-09-07T00:00:00.000Z" },
      { stable_key: "db:forecast", node_type: "forecast", ticker: "MU", title: "Base", as_of: "2026-09-07T00:00:00.000Z" },
    ];
    const edge = { from_key: "db:company", to_key: "db:forecast", relationship: "has_forecast" };

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb)",
        [runIds.graph, JSON.stringify(nodes), JSON.stringify([edge, { ...edge, note: "duplicate" }])],
      ),
    ).rejects.toMatchObject({
      code: "22023",
      message: expect.stringContaining("Graph edges must be logically unique within a batch"),
    });
    const afterRejected = await db.query<{ nodes: number; edges: number }>(
      `select
         (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = $1) as nodes,
         (select count(*)::int from public.hermes_underwriting_edges where agent_run_id = $1) as edges`,
      [runIds.graph],
    );
    expect(afterRejected.rows).toEqual([{ nodes: 0, edges: 0 }]);

    const saved = await db.query<{ result: { nodes: number; edges: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb) as result",
      [runIds.graph, JSON.stringify(nodes), JSON.stringify([edge])],
    );
    expect(saved.rows[0]?.result).toMatchObject({ nodes: 2, edges: 1 });

    await db.query(
      "update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1",
      [runIds.graph],
    );
    const replay = await db.query<{ result: { nodes: number; edges: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb) as result",
      [runIds.graph, JSON.stringify(nodes), JSON.stringify([edge])],
    );
    expect(replay.rows[0]?.result).toMatchObject({ nodes: 2, edges: 1 });
  });

  it("rejects offset-equivalent duplicate logical forecasts before any graph writes", async () => {
    const nodes = [
      { stable_key: "duplicate-forecast:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2001-01-01T00:00:00.000Z" },
      { stable_key: "duplicate-forecast:forecast", node_type: "forecast", ticker: "MU", title: "Base", as_of: "2001-01-01T00:00:00.000Z" },
    ];
    const edges = [
      { from_key: "duplicate-forecast:company", to_key: "duplicate-forecast:forecast", relationship: "has_forecast" },
    ];
    const forecasts = [
      {
        stable_key: "duplicate-forecast:base:first",
        ticker: "MU",
        scenario: "Base",
        forecast_type: "annualized_return",
        horizon_date: "2099-01-01",
        predicted_value: 0.14,
        unit: "ratio",
        model_version: "2001-01-01T00:00:00.000Z",
      },
      {
        stable_key: "duplicate-forecast:base:second",
        ticker: "MU",
        scenario: "Base",
        forecast_type: "annualized_return",
        horizon_date: "2099-01-01",
        predicted_value: 0.15,
        model_version: "2000-12-31T19:00:00-05:00",
      },
    ];

    let rejection: unknown;
    try {
      await db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, $4::jsonb)",
        [runIds.duplicateForecast, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(forecasts)],
      );
    } catch (error) {
      rejection = error;
    }
    const persisted = await db.query<{ nodes: number; edges: number; forecasts: number }>(
      `select
         (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = $1) as nodes,
         (select count(*)::int from public.hermes_underwriting_edges where agent_run_id = $1) as edges,
         (select count(*)::int from public.hermes_forecasts where agent_run_id = $1) as forecasts`,
      [runIds.duplicateForecast],
    );

    expect(rejection).toMatchObject({
      code: "22023",
      message: expect.stringContaining("Forecasts must be logically unique within a batch"),
    });
    expect(persisted.rows).toEqual([{ nodes: 0, edges: 0, forecasts: 0 }]);

    const validForecasts = [forecasts[0]];
    const saved = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, $4::jsonb) as result",
      [runIds.duplicateForecast, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(validForecasts)],
    );
    expect(saved.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 1 });

    await db.query(
      "update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1",
      [runIds.duplicateForecast],
    );
    const replay = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, $4::jsonb) as result",
      [runIds.duplicateForecast, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(validForecasts)],
    );
    expect(replay.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 0 });
  });

  it("rejects future graph node publication atomically, then accepts valid retry and terminal replay", async () => {
    const futureNodes = [
      { stable_key: "future-node:company", node_type: "company", ticker: "MU", title: "MU", as_of: "9999-01-01T00:00:00.000Z" },
    ];

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.futureNode, JSON.stringify(futureNodes)],
      ),
    ).rejects.toMatchObject({
      code: "22007",
      message: expect.stringContaining("future as_of"),
    });
    const afterRejected = await db.query<{ nodes: number }>(
      "select count(*)::int as nodes from public.hermes_underwriting_nodes where agent_run_id = $1",
      [runIds.futureNode],
    );
    expect(afterRejected.rows).toEqual([{ nodes: 0 }]);

    const validNodes = [{ ...futureNodes[0], as_of: "2000-01-01T00:00:00-05:00" }];
    const saved = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb) as result",
      [runIds.futureNode, JSON.stringify(validNodes)],
    );
    expect(saved.rows[0]?.result).toEqual({ nodes: 1, edges: 0, forecasts_inserted: 0 });
    await db.query("update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1", [runIds.futureNode]);
    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb)",
        [runIds.futureNode, JSON.stringify(validNodes)],
      ),
    ).resolves.toBeDefined();
  });

  it("rejects future graph forecast model publication atomically", async () => {
    const nodes = [
      { stable_key: "future-model:company", node_type: "company", ticker: "FUTURE", title: "Future", as_of: "2000-01-01T00:00:00.000Z" },
    ];
    const forecasts = [
      {
        stable_key: "future-model:forecast",
        ticker: "FUTURE",
        scenario: "Base",
        forecast_type: "annualized_return",
        horizon_date: "9999-12-31",
        predicted_value: 0.14,
        model_version: "9999-01-01T00:00:00.000Z",
      },
    ];

    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
        [runIds.futureModel, JSON.stringify(nodes), JSON.stringify(forecasts)],
      ),
    ).rejects.toMatchObject({
      code: "22007",
      message: expect.stringMatching(/future-model:forecast.*model_version.*as_of/),
    });
    const persisted = await db.query<{ nodes: number; forecasts: number }>(
      `select
         (select count(*)::int from public.hermes_underwriting_nodes where agent_run_id = $1) as nodes,
         (select count(*)::int from public.hermes_forecasts where agent_run_id = $1) as forecasts`,
      [runIds.futureModel],
    );
    expect(persisted.rows).toEqual([{ nodes: 0, forecasts: 0 }]);
  });

  it("keeps logical node ownership and edges isolated across conflicting runs", async () => {
    const nodes = [
      { stable_key: "ownership:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2000-02-01T00:00:00.000Z" },
      { stable_key: "ownership:forecast", node_type: "forecast", ticker: "MU", title: "Base", as_of: "2000-02-01T00:00:00.000Z" },
    ];
    const edges = [{ from_key: "ownership:company", to_key: "ownership:forecast", relationship: "has_forecast" }];

    const first = await db.query<{ result: { nodes: number; edges: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb) as result",
      [runIds.ownerOne, JSON.stringify(nodes), JSON.stringify(edges)],
    );
    expect(first.rows[0]?.result).toMatchObject({ nodes: 2, edges: 1 });
    await expect(
      db.query(
        "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb)",
        [runIds.ownerTwo, JSON.stringify(nodes), JSON.stringify(edges)],
      ),
    ).rejects.toMatchObject({ code: "55000" });

    const ownership = await db.query<{ run_id: string; nodes: number; edges: number }>(
      `select runs.id as run_id,
              count(distinct nodes.id)::int as nodes,
              count(distinct edges.id)::int as edges
       from public.hermes_agent_runs runs
       left join public.hermes_underwriting_nodes nodes on nodes.agent_run_id = runs.id
       left join public.hermes_underwriting_edges edges on edges.agent_run_id = runs.id
       where runs.id in ($1, $2)
       group by runs.id
       order by runs.id`,
      [runIds.ownerOne, runIds.ownerTwo],
    );
    expect(ownership.rows).toEqual([
      { run_id: runIds.ownerOne, nodes: 2, edges: 1 },
      { run_id: runIds.ownerTwo, nodes: 0, edges: 0 },
    ]);

    const sameRunReplay = await db.query<{ result: { nodes: number; edges: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, '[]'::jsonb) as result",
      [runIds.ownerOne, JSON.stringify(nodes), JSON.stringify(edges)],
    );
    expect(sameRunReplay.rows[0]?.result).toMatchObject({ nodes: 2, edges: 1 });
  });

  it("rolls back when a direct insert wins after forecast conflict preflight", async () => {
    const raceDb = new PGlite({ extensions: { pgcrypto } });
    const winnerRun = "40000000-0000-4000-8000-000000000001";
    const loserRun = "40000000-0000-4000-8000-000000000002";
    try {
      await raceDb.exec(`
        create schema extensions;
        create extension pgcrypto schema extensions;
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.hermes_agent_tasks (id uuid primary key);
        create function public.hermes_set_updated_at()
        returns trigger language plpgsql set search_path = '' as $$
        begin new.updated_at := pg_catalog.now(); return new; end;
        $$;
        create publication supabase_realtime;
      `);
      await raceDb.exec(migration);
      await raceDb.query(
        `insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status)
         values ($1, 'forecast-race-winner', '1.0.0', 'winner', 'running'),
                ($2, 'forecast-race-loser', '1.0.0', 'loser', 'running')`,
        [winnerRun, loserRun],
      );
      await raceDb.exec(`
        create function public.inject_forecast_race_winner()
        returns trigger language plpgsql set search_path = '' as $$
        begin
          if new.agent_run_id = '${loserRun}'::uuid then
            insert into public.hermes_forecasts (
              stable_key, ticker, scenario, forecast_type, horizon_date,
              predicted_value, unit, agent_run_id, model_version
            ) values (
              'forecast-race:winner', 'RACE', 'Base', 'annualized_return', '2099-01-01',
              0.99, 'ratio', '${winnerRun}'::uuid, '2004-01-01T00:00:00.000Z'
            );
          end if;
          return new;
        end;
        $$;
        create trigger aaa_inject_forecast_race_winner
        before insert on public.hermes_forecasts
        for each row execute function public.inject_forecast_race_winner();
      `);

      const nodes = [{ stable_key: "forecast-race:company", node_type: "company", ticker: "RACE", title: "Race", as_of: "2004-01-01T00:00:00.000Z" }];
      const forecasts = [{
        stable_key: "forecast-race:loser",
        ticker: "RACE",
        scenario: "Base",
        forecast_type: "annualized_return",
        horizon_date: "2099-01-01",
        predicted_value: 0.14,
        unit: "ratio",
        model_version: "2004-01-01T00:00:00.000Z",
      }];

      await expect(
        raceDb.query(
          "select public.hermes_replace_underwriting_graph($1, $2::jsonb, '[]'::jsonb, $3::jsonb)",
          [loserRun, JSON.stringify(nodes), JSON.stringify(forecasts)],
        ),
      ).rejects.toMatchObject({
        code: "55000",
        message: expect.stringContaining("Every submitted forecast must exactly match immutable content"),
      });

      const persisted = await raceDb.query<{ nodes: number; forecasts: number }>(
        `select
           (select count(*)::int from public.hermes_underwriting_nodes) as nodes,
           (select count(*)::int from public.hermes_forecasts) as forecasts`,
      );
      expect(persisted.rows).toEqual([{ nodes: 0, forecasts: 0 }]);
    } finally {
      await raceDb.close();
    }
  });

  it("enforces finite server-bounded run timestamps and completion chronology", async () => {
    const validRun = "50000000-0000-4000-8000-000000000001";
    await expect(
      db.query(
        `insert into public.hermes_agent_runs (
           workflow_id, workflow_version, agent_name, status, started_at
         ) values ('future-start', '1.0.0', 'vitest', 'running', '9999-01-01T00:00:00Z')`,
      ),
    ).rejects.toMatchObject({ code: "22007" });
    for (const startedAt of ["infinity", "-infinity"]) {
      await expect(
        db.query(
          `insert into public.hermes_agent_runs (
             workflow_id, workflow_version, agent_name, status, started_at
           ) values ('non-finite-start', '1.0.0', 'vitest', 'running', $1)`,
          [startedAt],
        ),
      ).rejects.toMatchObject({ code: "22007" });
    }

    await db.query(
      `insert into public.hermes_agent_runs (
         id, workflow_id, workflow_version, agent_name, status, started_at
       ) values ($1, 'completion-window', '1.0.0', 'vitest', 'running', '2005-01-02T00:00:00Z')`,
      [validRun],
    );
    for (const completedAt of ["2005-01-01T00:00:00Z", "9999-01-01T00:00:00Z", "infinity", "-infinity"]) {
      await expect(
        db.query(
          "update public.hermes_agent_runs set status = 'succeeded', completed_at = $1 where id = $2",
          [completedAt, validRun],
        ),
      ).rejects.toMatchObject({ code: "22007" });
    }
  });

  it.each([
    ["actual_value", "NaN"],
    ["actual_value", "Infinity"],
    ["actual_value", "-Infinity"],
    ["qqq_value", "NaN"],
    ["qqq_value", "Infinity"],
    ["qqq_value", "-Infinity"],
  ])("rejects non-finite outcome %s=%s on direct table insert", async (column, value) => {
    const suffix = `${column}-${value}`.replaceAll("-", "neg");
    const forecastId = await makeDueForecast(db, `direct-outcome-${suffix}`, runIds.futureOutcome, `2007-${column === "actual_value" ? "01" : "02"}-0${value === "NaN" ? "1" : value === "Infinity" ? "2" : "3"}T00:00:00Z`);
    await db.exec("begin");
    try {
      await expect(
        db.query(
          `insert into public.hermes_forecast_outcomes (
             forecast_id, observed_at, actual_value, qqq_value, evidence_url
           ) values ($1, pg_catalog.statement_timestamp() - interval '1 minute',
             ${column === "actual_value" ? "$2" : "0.11"},
             ${column === "qqq_value" ? "$2" : "0.1"}, 'https://example.com/outcome')`,
          [forecastId, value],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db.exec("rollback");
    }
  });

  it.each([
    ["actual_value", "NaN"],
    ["actual_value", "Infinity"],
    ["actual_value", "-Infinity"],
    ["qqq_value", "NaN"],
    ["qqq_value", "Infinity"],
    ["qqq_value", "-Infinity"],
  ])("rejects non-finite grading RPC %s=%s without closing the forecast", async (column, value) => {
    const suffix = `${column}-${value}`.replaceAll("-", "neg");
    const forecastId = await makeDueForecast(db, `rpc-outcome-${suffix}`, runIds.unsafeOutcome, `2007-${column === "actual_value" ? "03" : "04"}-0${value === "NaN" ? "1" : value === "Infinity" ? "2" : "3"}T00:00:00Z`);
    await expect(
      db.query(
        `select public.hermes_grade_forecast_outcome(
           $1, pg_catalog.statement_timestamp() - interval '1 minute',
           ${column === "actual_value" ? "$2" : "0.11"},
           ${column === "qqq_value" ? "$2" : "0.1"}, null,
           'https://example.com/outcome', null, '{}'::jsonb
         )`,
        [forecastId, value],
      ),
    ).rejects.toMatchObject({ code: "22023", message: expect.stringContaining("finite numeric") });
    const state = await db.query<{ status: string; outcomes: number }>(
      `select f.status,
              (select count(*)::int from public.hermes_forecast_outcomes o where o.forecast_id = f.id) as outcomes
       from public.hermes_forecasts f where f.id = $1`,
      [forecastId],
    );
    expect(state.rows).toEqual([{ status: "open", outcomes: 0 }]);
  });

  it.each(["-infinity", "infinity", "9999-01-01T00:00:00Z"])(
    "rejects invalid outcome observed_at=%s on direct table insert",
    async (observedAt) => {
      const suffix = observedAt.replaceAll(/[^a-z0-9]/gi, "-");
      const forecastId = await makeDueForecast(
        db,
        `direct-observed-at-${suffix}`,
        runIds.futureOutcome,
        `2007-05-0${observedAt === "-infinity" ? "1" : observedAt === "infinity" ? "2" : "3"}T00:00:00Z`,
      );
      await db.exec("begin");
      try {
        await expect(
          db.query(
            `insert into public.hermes_forecast_outcomes (
               forecast_id, observed_at, actual_value, qqq_value, evidence_url
             ) values ($1, $2, 0.11, 0.1, 'https://example.com/outcome')`,
            [forecastId, observedAt],
          ),
        ).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining("hermes_forecast_outcomes_observed_at_valid_check"),
        });
      } finally {
        await db.exec("rollback");
      }
    },
  );

  it.each(["-infinity", "infinity", "9999-01-01T00:00:00Z"])(
    "rejects invalid outcome observed_at=%s through the grading RPC without closing the forecast",
    async (observedAt) => {
      const suffix = observedAt.replaceAll(/[^a-z0-9]/gi, "-");
      const forecastId = await makeDueForecast(
        db,
        `rpc-observed-at-${suffix}`,
        runIds.unsafeOutcome,
        `2007-06-0${observedAt === "-infinity" ? "1" : observedAt === "infinity" ? "2" : "3"}T00:00:00Z`,
      );

      await expect(
        db.query(
          `select public.hermes_grade_forecast_outcome(
             $1, $2, 0.11, 0.13, null,
             'https://example.com/outcome', null, '{}'::jsonb
           )`,
          [forecastId, observedAt],
        ),
      ).rejects.toMatchObject({
        code: "22007",
        message: expect.stringContaining("finite and not in the future"),
      });
      const state = await db.query<{ status: string; outcomes: number }>(
        `select f.status,
                (select count(*)::int from public.hermes_forecast_outcomes o where o.forecast_id = f.id) as outcomes
         from public.hermes_forecasts f where f.id = $1`,
        [forecastId],
      );
      expect(state.rows).toEqual([{ status: "open", outcomes: 0 }]);
    },
  );

  it.each(["-infinity", "infinity", "9999-01-01T00:00:00Z"])(
    "fails replay closed and preserves an existing invalid outcome observed_at=%s",
    async (observedAt) => {
      const legacyDb = await createOutcomeTimestampUpgradeDb(observedAt);
      try {
        await expect(legacyDb.exec(migration)).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining("non-finite or future observed_at"),
        });
        const preserved = await legacyDb.query<{ count: number }>(
          "select count(*)::int as count from public.hermes_forecast_outcomes where not pg_catalog.isfinite(observed_at) or observed_at > pg_catalog.statement_timestamp()",
        );
        expect(preserved.rows).toEqual([{ count: 1 }]);
      } finally {
        await legacyDb.close();
      }
    },
  );

  it("upgrades valid outcome history and remains idempotent on second replay", async () => {
    const observedAt = new Date(Date.now() - 60_000).toISOString();
    const legacyDb = await createOutcomeTimestampUpgradeDb(observedAt);
    try {
      await legacyDb.exec(migration);
      await legacyDb.exec(migration);

      const result = await legacyDb.query<{ outcomes: number; constraints: number; validated: boolean }>(
        `select
           (select count(*)::int from public.hermes_forecast_outcomes) as outcomes,
           count(*)::int as constraints,
           bool_and(convalidated) as validated
         from pg_constraint
         where conrelid = 'public.hermes_forecast_outcomes'::regclass
           and conname = 'hermes_forecast_outcomes_observed_at_valid_check'`,
      );
      expect(result.rows).toEqual([{ outcomes: 1, constraints: 1, validated: true }]);
    } finally {
      await legacyDb.close();
    }
  });

  it("rejects future observations atomically and leaves the forecast open", async () => {
    const forecastId = await makeDueForecast(db, "future-observation", runIds.futureOutcome, "2000-03-01T00:00:00.000Z");

    await expect(
      db.query(
        `select public.hermes_grade_forecast_outcome(
           $1, '9999-01-01T00:00:00.000Z', 0.11, 0.13, null,
           'https://example.com/outcome', null, '{}'::jsonb
         )`,
        [forecastId],
      ),
    ).rejects.toMatchObject({
      code: "22007",
      message: expect.stringContaining("future observed_at"),
    });
    const state = await db.query<{ status: string; outcomes: number }>(
      `select f.status,
              (select count(*)::int from public.hermes_forecast_outcomes o where o.forecast_id = f.id) as outcomes
       from public.hermes_forecasts f where f.id = $1`,
      [forecastId],
    );
    expect(state.rows).toEqual([{ status: "open", outcomes: 0 }]);
  });

  it.each(reservedEvidenceUrls)("fails evidence-validator replay atomically for reserved legacy row %s", async (evidenceUrl) => {
    const legacyDb = await createEvidenceUrlUpgradeDb(evidenceUrl);
    try {
      const before = await evidenceUrlUpgradeState(legacyDb);
      let replayError: unknown;
      try {
        await legacyDb.exec(migration);
      } catch (error) {
        replayError = error;
      }

      expect(replayError).toMatchObject({ code: "23514" });
      const message = String((replayError as { message?: unknown } | undefined)?.message ?? "");
      expect(message).toContain("76000000-0000-4000-8000-000000000001");
      expect(message).toContain(evidenceUrl);
      const after = await evidenceUrlUpgradeState(legacyDb);
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyDb.close();
    }
  });

  it("upgrades valid public-FQDN evidence history with a validated replay-safe CHECK", async () => {
    const legacyDb = await createEvidenceUrlUpgradeDb("https://www.sec.gov/Archives/legacy");
    try {
      await legacyDb.exec(migration);
      const afterFirstReplay = await evidenceUrlUpgradeState(legacyDb);
      expect(afterFirstReplay.rows[0]).toMatchObject({
        outcome: expect.objectContaining({ evidence_url: "https://www.sec.gov/Archives/legacy" }),
        constraint_definition: expect.stringContaining("hermes_is_valid_evidence_url(evidence_url)"),
        constraint_validated: true,
      });
      expect(afterFirstReplay.rows[0]?.validator).toContain("^https://");
      expect(afterFirstReplay.rows[0]?.validator).not.toContain("select true");

      await legacyDb.exec(migration);
      const afterSecondReplay = await evidenceUrlUpgradeState(legacyDb);
      expect(afterSecondReplay.rows).toEqual(afterFirstReplay.rows);

      await legacyDb.exec("begin; drop trigger hermes_forecast_outcomes_validate_insert on public.hermes_forecast_outcomes");
      try {
        await expect(
          legacyDb.query(
            `update public.hermes_forecast_outcomes
             set evidence_url = 'https://127.0.0.1/bypass'
             where id = '76000000-0000-4000-8000-000000000001'`,
          ),
        ).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining("hermes_forecast_outcomes_evidence_url_fqdn_check"),
        });
      } finally {
        await legacyDb.exec("rollback");
      }
    } finally {
      await legacyDb.close();
    }
  });

  it("keeps the SQL evidence validator aligned with the shared deterministic host matrix", async () => {
    for (const evidenceUrl of acceptedEvidenceUrls) {
      const result = await db.query<{ valid: boolean }>(
        "select public.hermes_is_valid_evidence_url($1) as valid",
        [evidenceUrl],
      );
      expect(result.rows, evidenceUrl).toEqual([{ valid: true }]);
    }
    for (const evidenceUrl of rejectedEvidenceUrls) {
      const result = await db.query<{ valid: boolean }>(
        "select public.hermes_is_valid_evidence_url($1) as valid",
        [evidenceUrl],
      );
      expect(result.rows, evidenceUrl).toEqual([{ valid: false }]);
    }
  });

  it.each(rejectedEvidenceUrls.map((evidenceUrl, index) => ({
    evidenceUrl,
    modelVersion: `2000-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  })))("rejects unsafe evidence URL $evidenceUrl on direct insert without persisting an outcome", async ({ evidenceUrl, modelVersion }) => {
    const suffix = Buffer.from(evidenceUrl).toString("hex").slice(0, 48);
    const forecastId = await makeDueForecast(db, `direct-unsafe-url-${suffix}`, runIds.futureOutcome, modelVersion);
    await db.exec("begin");
    try {
      await expect(
        db.query(
          `insert into public.hermes_forecast_outcomes (
             forecast_id, observed_at, actual_value, evidence_url
           ) values ($1, pg_catalog.statement_timestamp() - interval '1 minute', 0.11, $2)`,
          [forecastId, evidenceUrl],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("fully qualified host"),
      });
    } finally {
      await db.exec("rollback");
    }
    const persisted = await db.query<{ count: number }>(
      "select count(*)::int as count from public.hermes_forecast_outcomes where forecast_id = $1",
      [forecastId],
    );
    expect(persisted.rows).toEqual([{ count: 0 }]);
  });

  it("rejects unsafe evidence URLs in the grading RPC without closing the forecast", async () => {
    const forecastId = await makeDueForecast(db, "unsafe-outcome-url", runIds.unsafeOutcome, "2000-04-01T00:00:00.000Z");

    for (const evidenceUrl of rejectedEvidenceUrls) {
      await expect(
        db.query(
          `select public.hermes_grade_forecast_outcome(
             $1, pg_catalog.statement_timestamp() - interval '1 minute', 0.11, 0.13, null,
             $2, null, '{}'::jsonb
           )`,
          [forecastId, evidenceUrl],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("valid credential-free HTTPS URL"),
      });
    }
    const state = await db.query<{ status: string; outcomes: number }>(
      `select f.status,
              (select count(*)::int from public.hermes_forecast_outcomes o where o.forecast_id = f.id) as outcomes
       from public.hermes_forecasts f where f.id = $1`,
      [forecastId],
    );
    expect(state.rows).toEqual([{ status: "open", outcomes: 0 }]);

    await expect(
      db.query(
        `select public.hermes_grade_forecast_outcome(
           $1, pg_catalog.statement_timestamp() - interval '1 minute', 0.11, 0.13, null,
           'https://www.sec.gov/Archives/example', null, '{}'::jsonb
         )`,
        [forecastId],
      ),
    ).resolves.toBeDefined();
  });

  it("stores a validated outcome evidence URL in the same trimmed form as the API", async () => {
    const forecastId = await makeDueForecast(db, "trimmed-outcome-url", runIds.trimmedOutcome, "2000-05-01T00:00:00.000Z");
    await db.query(
      `select public.hermes_grade_forecast_outcome(
         $1, pg_catalog.statement_timestamp() - interval '1 minute', 0.11, 0.13, null,
         '  https://www.sec.gov/Archives/example  ', null, '{}'::jsonb
       )`,
      [forecastId],
    );

    const outcome = await db.query<{ evidence_url: string }>(
      "select evidence_url from public.hermes_forecast_outcomes where forecast_id = $1",
      [forecastId],
    );
    expect(outcome.rows).toEqual([{ evidence_url: "https://www.sec.gov/Archives/example" }]);
  });

  it("replays a graph-only endpoint request after forecasts were registered separately", async () => {
    const nodes = [
      { stable_key: "split:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2026-09-07T00:00:00.000Z" },
      { stable_key: "split:forecast", node_type: "forecast", ticker: "MU", title: "Base", as_of: "2026-09-07T00:00:00.000Z" },
    ];
    const edges = [{ from_key: "split:company", to_key: "split:forecast", relationship: "has_forecast" }];

    await db.query(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, null::jsonb)",
      [runIds.splitWorkflow, JSON.stringify(nodes), JSON.stringify(edges)],
    );
    await db.query(
      `insert into public.hermes_forecasts (
         stable_key, ticker, scenario, forecast_type, horizon_date,
         predicted_value, agent_run_id, model_version
       ) values ('split:forecast:base', 'MU', 'Base', 'annualized_return', '2099-01-01', 0.14, $1, '2026-09-08T00:00:00.000Z')`,
      [runIds.splitWorkflow],
    );
    await db.query(
      "update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1",
      [runIds.splitWorkflow],
    );

    const replay = await db.query<{ result: { nodes: number; edges: number; forecasts_inserted: number } }>(
      "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, null::jsonb) as result",
      [runIds.splitWorkflow, JSON.stringify(nodes), JSON.stringify(edges)],
    );
    expect(replay.rows[0]?.result).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 0 });
  });
});

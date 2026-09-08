-- ============================================================================
-- Hermes underwriting graph + forecast evaluation
-- Target: INVESTING-BRAIN-AG (cwiaqczpifnxxcucqwvr)
--
-- Reconstructs live DDL that was applied 2026-09-08 01:19 UTC as
-- 20260907000400_underwriting_graph_evaluation.sql before this file existed
-- in the repo. Dumped from information_schema / pg_get_* on 2026-09-08.
-- Idempotent. Does not include hermes_sleeves* (those remain live-only).
-- ============================================================================

create or replace function public.hermes_hash_prompt_body()
returns trigger
language plpgsql
set search_path to pg_catalog, extensions
as $$
begin
  new.content_sha256 := encode(digest(new.prompt_body, 'sha256'), 'hex');
  return new;
end;
$$;

create or replace function public.hermes_protect_prompt_version()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'Prompt versions are immutable; publish a new version instead.' using errcode = '55000';
end;
$$;

create or replace function public.hermes_protect_agent_run()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('queued', 'running') then
      raise exception 'Agent runs must be created queued or running.' using errcode = '23514';
    end if;
    if new.completed_at is not null then
      raise exception 'New agent runs cannot have completed_at.' using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Agent run provenance is immutable.' using errcode = '55000';
  end if;
  if row(new.id, new.workflow_id, new.workflow_version, new.external_key,
         new.prompt_id, new.prompt_version, new.agent_name, new.ticker, new.task_id,
         new.tools_used, new.source_count, new.input_ref, new.started_at, new.created_at)
     is distinct from
     row(old.id, old.workflow_id, old.workflow_version, old.external_key,
         old.prompt_id, old.prompt_version, old.agent_name, old.ticker, old.task_id,
         old.tools_used, old.source_count, old.input_ref, old.started_at, old.created_at) then
    raise exception 'Agent run provenance is immutable.' using errcode = '55000';
  end if;
  if old.status in ('succeeded', 'failed', 'cancelled') then
    raise exception 'Completed agent runs are immutable.' using errcode = '55000';
  end if;
  if new.status <> old.status and not (
    (old.status = 'queued' and new.status in ('running', 'cancelled')) or
    (old.status = 'running' and new.status in ('succeeded', 'failed', 'cancelled'))
  ) then
    raise exception 'Invalid agent run lifecycle transition: % to %.', old.status, new.status using errcode = '23514';
  end if;
  if new.status in ('succeeded', 'failed', 'cancelled') and new.completed_at is null then
    raise exception 'Terminal agent runs require completed_at.' using errcode = '23514';
  end if;
  if new.status in ('queued', 'running') and new.completed_at is not null then
    raise exception 'Incomplete agent runs cannot have completed_at.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.hermes_protect_underwriting_history()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'Underwriting graph history is immutable; publish a new as_of version.' using errcode = '55000';
end;
$$;

create or replace function public.hermes_protect_forecast_immutability()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'Forecasts must be created open.' using errcode = '23514';
    end if;
    new.as_of := pg_catalog.statement_timestamp();
    if new.horizon_date <= new.as_of::date then
      raise exception 'Forecast horizon must be after registration date.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Forecast records are immutable.' using errcode = '55000';
  end if;

  if old.status <> 'open' or new.status <> 'graded' or
     row(new.id, new.stable_key, new.ticker, new.scenario, new.forecast_type,
         new.horizon_date, new.probability, new.predicted_value, new.unit,
         new.benchmark_symbol, new.benchmark_value, new.agent_run_id,
         new.model_version, new.as_of, new.metadata, new.created_at)
       is distinct from
     row(old.id, old.stable_key, old.ticker, old.scenario, old.forecast_type,
         old.horizon_date, old.probability, old.predicted_value, old.unit,
         old.benchmark_symbol, old.benchmark_value, old.agent_run_id,
         old.model_version, old.as_of, old.metadata, old.created_at) then
    raise exception 'Forecast records are immutable except for atomic open-to-graded closure.' using errcode = '55000';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Prompt versions (immutable; FK target for agent runs)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_prompt_versions (
  prompt_id text not null,
  version text not null,
  role text not null,
  schema_version text not null,
  content_sha256 text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'retired')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prompt_body text not null,
  primary key (prompt_id, version),
  check (content_sha256 is null or content_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

drop trigger if exists hermes_prompt_versions_hash_body on public.hermes_prompt_versions;
create trigger hermes_prompt_versions_hash_body
before insert or update of prompt_body on public.hermes_prompt_versions
for each row execute function public.hermes_hash_prompt_body();

drop trigger if exists hermes_prompt_versions_protect on public.hermes_prompt_versions;
create trigger hermes_prompt_versions_protect
before delete or update on public.hermes_prompt_versions
for each row execute function public.hermes_protect_prompt_version();

drop trigger if exists hermes_prompt_versions_set_updated_at on public.hermes_prompt_versions;
create trigger hermes_prompt_versions_set_updated_at
before update on public.hermes_prompt_versions
for each row execute function public.hermes_set_updated_at();

-- ----------------------------------------------------------------------------
-- Agent runs
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_agent_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null,
  workflow_version text not null,
  external_key text unique,
  prompt_id text,
  prompt_version text,
  agent_name text not null,
  status text not null default 'running'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  ticker text,
  task_id uuid references public.hermes_agent_tasks(id) on delete set null,
  tools_used text[] not null default '{}',
  source_count integer not null default 0 check (source_count >= 0),
  input_ref jsonb not null default '{}'::jsonb,
  output_ref jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (prompt_id, prompt_version) references public.hermes_prompt_versions(prompt_id, version) on update cascade
);

create index if not exists idx_hermes_agent_runs_workflow
  on public.hermes_agent_runs (workflow_id, started_at desc);
create index if not exists idx_hermes_agent_runs_ticker
  on public.hermes_agent_runs (ticker, started_at desc);
create index if not exists idx_hermes_agent_runs_status
  on public.hermes_agent_runs (status, started_at desc);

drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;
create trigger hermes_agent_runs_protect
before insert or delete or update on public.hermes_agent_runs
for each row execute function public.hermes_protect_agent_run();

drop trigger if exists hermes_agent_runs_set_updated_at on public.hermes_agent_runs;
create trigger hermes_agent_runs_set_updated_at
before update on public.hermes_agent_runs
for each row execute function public.hermes_set_updated_at();

-- ----------------------------------------------------------------------------
-- Underwriting graph
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_underwriting_nodes (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  node_type text not null
    check (node_type in ('company', 'assumption', 'forecast', 'falsifier', 'monitor', 'source', 'evidence', 'outcome', 'agent_run', 'decision', 'theme')),
  ticker text,
  title text not null,
  body text,
  status text not null default 'active'
    check (status in ('active', 'open', 'graded', 'superseded')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  as_of timestamptz not null,
  valid_until timestamptz,
  supersedes_id uuid references public.hermes_underwriting_nodes(id) on delete set null,
  agent_run_id uuid references public.hermes_agent_runs(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stable_key, as_of)
);

create index if not exists idx_hermes_underwriting_nodes_kind
  on public.hermes_underwriting_nodes (node_type, status, as_of desc);
create index if not exists idx_hermes_underwriting_nodes_ticker
  on public.hermes_underwriting_nodes (ticker, as_of desc);

drop trigger if exists hermes_underwriting_nodes_protect on public.hermes_underwriting_nodes;
create trigger hermes_underwriting_nodes_protect
before delete or update on public.hermes_underwriting_nodes
for each row execute function public.hermes_protect_underwriting_history();

drop trigger if exists hermes_underwriting_nodes_set_updated_at on public.hermes_underwriting_nodes;
create trigger hermes_underwriting_nodes_set_updated_at
before update on public.hermes_underwriting_nodes
for each row execute function public.hermes_set_updated_at();

create table if not exists public.hermes_underwriting_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.hermes_underwriting_nodes(id) on delete cascade,
  to_node_id uuid not null references public.hermes_underwriting_nodes(id) on delete cascade,
  relationship text not null
    check (relationship in (
      'has_forecast', 'depends_on', 'could_invalidate', 'tests', 'informed_by', 'supports',
      'refutes', 'revises', 'confirms', 'disconfirms', 'produced_by', 'competes_with'
    )),
  strength numeric check (strength is null or (strength >= -1 and strength <= 1)),
  note text,
  agent_run_id uuid references public.hermes_agent_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id, relationship)
);

create index if not exists idx_hermes_underwriting_edges_from
  on public.hermes_underwriting_edges (from_node_id, relationship);
create index if not exists idx_hermes_underwriting_edges_to
  on public.hermes_underwriting_edges (to_node_id, relationship);

drop trigger if exists hermes_underwriting_edges_protect on public.hermes_underwriting_edges;
create trigger hermes_underwriting_edges_protect
before delete or update on public.hermes_underwriting_edges
for each row execute function public.hermes_protect_underwriting_history();

-- ----------------------------------------------------------------------------
-- Forecasts + outcomes
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_forecasts (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  ticker text not null,
  scenario text not null
    check (scenario in ('Bear', 'Base', 'Bull', 'Probability-weighted')),
  forecast_type text not null
    check (forecast_type in ('annualized_return', 'target_price', 'revenue_cagr', 'margin', 'binary')),
  horizon_date date not null,
  probability numeric check (probability is null or (probability >= 0 and probability <= 1)),
  predicted_value numeric not null,
  unit text not null default 'ratio',
  benchmark_symbol text not null default 'QQQ',
  benchmark_value numeric,
  agent_run_id uuid references public.hermes_agent_runs(id) on delete set null,
  model_version text not null,
  as_of timestamptz not null default now(),
  status text not null default 'open'
    check (status in ('open', 'graded', 'superseded', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticker, scenario, forecast_type, unit, model_version),
  check (horizon_date > (as_of)::date)
);

create index if not exists idx_hermes_forecasts_due
  on public.hermes_forecasts (status, horizon_date);
create index if not exists idx_hermes_forecasts_ticker
  on public.hermes_forecasts (ticker, as_of desc);

drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;
create trigger hermes_forecasts_protect_immutability
before insert or delete or update on public.hermes_forecasts
for each row execute function public.hermes_protect_forecast_immutability();

drop trigger if exists hermes_forecasts_set_updated_at on public.hermes_forecasts;
create trigger hermes_forecasts_set_updated_at
before update on public.hermes_forecasts
for each row execute function public.hermes_set_updated_at();

create table if not exists public.hermes_forecast_outcomes (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.hermes_forecasts(id) on delete cascade,
  observed_at timestamptz not null,
  actual_value numeric not null,
  qqq_value numeric,
  outcome_occurred boolean,
  evidence_url text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (forecast_id, observed_at)
);

create index if not exists idx_hermes_forecast_outcomes_forecast
  on public.hermes_forecast_outcomes (forecast_id, observed_at desc);

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER writers (service_role only)
-- ----------------------------------------------------------------------------
create or replace function public.hermes_grade_forecast_outcome(
  p_forecast_id uuid,
  p_observed_at timestamptz,
  p_actual_value numeric,
  p_qqq_value numeric,
  p_outcome_occurred boolean,
  p_evidence_url text,
  p_notes text,
  p_metadata jsonb
)
returns public.hermes_forecast_outcomes
language plpgsql
security definer
set search_path to ''
as $$
declare
  target public.hermes_forecasts%rowtype;
  saved public.hermes_forecast_outcomes%rowtype;
begin
  if nullif(pg_catalog.btrim(p_evidence_url), '') is null then
    raise exception 'Outcome evidence URL is required.' using errcode = '23514';
  end if;

  select * into target
  from public.hermes_forecasts
  where id = p_forecast_id
  for update;

  if not found then
    raise exception 'Forecast % was not found.', p_forecast_id using errcode = 'P0002';
  end if;
  if target.status <> 'open' then
    raise exception 'Forecast % is not open.', p_forecast_id using errcode = '55000';
  end if;
  if current_date < target.horizon_date or p_observed_at::date < target.horizon_date then
    raise exception 'Forecast % cannot be graded before horizon %.', p_forecast_id, target.horizon_date using errcode = '22007';
  end if;

  insert into public.hermes_forecast_outcomes (
    forecast_id, observed_at, actual_value, qqq_value, outcome_occurred,
    evidence_url, notes, metadata
  ) values (
    p_forecast_id, p_observed_at, p_actual_value, p_qqq_value, p_outcome_occurred,
    p_evidence_url, p_notes, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into saved;

  update public.hermes_forecasts set status = 'graded' where id = p_forecast_id;
  return saved;
end;
$$;

create or replace function public.hermes_replace_underwriting_graph(
  p_agent_run_id uuid,
  p_nodes jsonb,
  p_edges jsonb,
  p_forecasts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  saved_node_count integer := 0;
  saved_edge_count integer := 0;
  saved_forecast_count integer := 0;
begin
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_array_length(p_nodes) = 0 then
    raise exception 'Graph replacement requires at least one node.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_edges) <> 'array' then
    raise exception 'Graph replacement edges must be an array.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_forecasts) <> 'array' then
    raise exception 'Graph replacement forecasts must be an array.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_nodes) as n(
      stable_key text, node_type text, ticker text, title text, body text,
      status text, confidence numeric, as_of timestamptz, valid_until timestamptz,
      payload jsonb
    )
    join public.hermes_underwriting_nodes existing
      on existing.stable_key = n.stable_key and existing.as_of = n.as_of
    where row(existing.node_type, existing.ticker, existing.title, existing.body,
              existing.status, existing.confidence, existing.valid_until,
              existing.agent_run_id, existing.payload)
      is distinct from
          row(n.node_type, n.ticker, n.title, n.body, coalesce(n.status, 'active'),
              n.confidence, n.valid_until, p_agent_run_id, coalesce(n.payload, '{}'::jsonb))
  ) then
    raise exception 'Underwriting node version conflicts with immutable history; use a new as_of.' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.hermes_underwriting_nodes existing
    where existing.agent_run_id = p_agent_run_id
      and not exists (
        select 1 from jsonb_to_recordset(p_nodes) as n(stable_key text, as_of timestamptz)
        where n.stable_key = existing.stable_key and n.as_of = existing.as_of
      )
  ) then
    raise exception 'Underwriting graph replay omitted immutable historical nodes.' using errcode = '55000';
  end if;

  insert into public.hermes_underwriting_nodes (
    stable_key, node_type, ticker, title, body, status, confidence,
    as_of, valid_until, agent_run_id, payload
  )
  select
    n.stable_key, n.node_type, n.ticker, n.title, n.body,
    coalesce(n.status, 'active'), n.confidence, n.as_of, n.valid_until,
    p_agent_run_id, coalesce(n.payload, '{}'::jsonb)
  from jsonb_to_recordset(p_nodes) as n(
    stable_key text, node_type text, ticker text, title text, body text,
    status text, confidence numeric, as_of timestamptz, valid_until timestamptz,
    payload jsonb
  )
  on conflict (stable_key, as_of) do nothing;
  saved_node_count := jsonb_array_length(p_nodes);

  if exists (
    select 1
    from jsonb_to_recordset(p_edges) as edge(
      from_key text, to_key text, relationship text, strength numeric, note text, metadata jsonb
    )
    join jsonb_to_recordset(p_nodes) as from_input(stable_key text, as_of timestamptz) on from_input.stable_key = edge.from_key
    join public.hermes_underwriting_nodes from_node on from_node.stable_key = from_input.stable_key and from_node.as_of = from_input.as_of
    join jsonb_to_recordset(p_nodes) as to_input(stable_key text, as_of timestamptz) on to_input.stable_key = edge.to_key
    join public.hermes_underwriting_nodes to_node on to_node.stable_key = to_input.stable_key and to_node.as_of = to_input.as_of
    join public.hermes_underwriting_edges existing
      on existing.from_node_id = from_node.id and existing.to_node_id = to_node.id and existing.relationship = edge.relationship
    where row(existing.strength, existing.note, existing.agent_run_id, existing.metadata)
      is distinct from row(edge.strength, edge.note, p_agent_run_id, coalesce(edge.metadata, '{}'::jsonb))
  ) then
    raise exception 'Underwriting edge conflicts with immutable history; use a new as_of.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.hermes_underwriting_edges existing
    join public.hermes_underwriting_nodes from_node on from_node.id = existing.from_node_id
    join public.hermes_underwriting_nodes to_node on to_node.id = existing.to_node_id
    where existing.agent_run_id = p_agent_run_id
      and not exists (
        select 1 from jsonb_to_recordset(p_edges) as edge(from_key text, to_key text, relationship text, strength numeric, note text, metadata jsonb)
        where edge.from_key = from_node.stable_key and edge.to_key = to_node.stable_key
          and edge.relationship = existing.relationship
          and row(edge.strength, edge.note, coalesce(edge.metadata, '{}'::jsonb))
            is not distinct from row(existing.strength, existing.note, existing.metadata)
      )
  ) then
    raise exception 'Underwriting graph replay omitted or changed immutable historical edges.' using errcode = '55000';
  end if;

  insert into public.hermes_underwriting_edges (
    from_node_id, to_node_id, relationship, strength, note, agent_run_id, metadata
  )
  select
    from_node.id, to_node.id, edge.relationship, edge.strength, edge.note,
    p_agent_run_id, coalesce(edge.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_edges) as edge(
    from_key text, to_key text, relationship text, strength numeric, note text, metadata jsonb
  )
  join jsonb_to_recordset(p_nodes) as from_input(stable_key text, as_of timestamptz)
    on from_input.stable_key = edge.from_key
  join public.hermes_underwriting_nodes from_node
    on from_node.stable_key = from_input.stable_key and from_node.as_of = from_input.as_of
  join jsonb_to_recordset(p_nodes) as to_input(stable_key text, as_of timestamptz)
    on to_input.stable_key = edge.to_key
  join public.hermes_underwriting_nodes to_node
    on to_node.stable_key = to_input.stable_key and to_node.as_of = to_input.as_of
  on conflict (from_node_id, to_node_id, relationship) do nothing;

  select count(*) into saved_edge_count
  from jsonb_to_recordset(p_edges) as edge(from_key text, to_key text, relationship text)
  join jsonb_to_recordset(p_nodes) as from_input(stable_key text, as_of timestamptz) on from_input.stable_key = edge.from_key
  join public.hermes_underwriting_nodes from_node on from_node.stable_key = from_input.stable_key and from_node.as_of = from_input.as_of
  join jsonb_to_recordset(p_nodes) as to_input(stable_key text, as_of timestamptz) on to_input.stable_key = edge.to_key
  join public.hermes_underwriting_nodes to_node on to_node.stable_key = to_input.stable_key and to_node.as_of = to_input.as_of
  join public.hermes_underwriting_edges saved on saved.from_node_id = from_node.id and saved.to_node_id = to_node.id and saved.relationship = edge.relationship
  where saved.agent_run_id = p_agent_run_id;

  if saved_edge_count <> jsonb_array_length(p_edges) then
    raise exception 'Every graph edge endpoint must be present in the submitted node batch.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_forecasts) as forecast(
      stable_key text, ticker text, scenario text, forecast_type text,
      horizon_date date, probability numeric, predicted_value numeric, unit text,
      benchmark_symbol text, benchmark_value numeric, model_version text, metadata jsonb
    )
    join public.hermes_forecasts existing
      on existing.ticker = forecast.ticker and existing.scenario = forecast.scenario
      and existing.forecast_type = forecast.forecast_type
      and existing.unit = coalesce(forecast.unit, 'ratio')
      and existing.model_version = forecast.model_version
    where row(existing.stable_key, existing.horizon_date, existing.probability,
              existing.predicted_value, existing.benchmark_symbol, existing.benchmark_value,
              existing.agent_run_id, existing.metadata)
      is distinct from
          row(forecast.stable_key, forecast.horizon_date, forecast.probability,
              forecast.predicted_value, coalesce(forecast.benchmark_symbol, 'QQQ'), forecast.benchmark_value,
              p_agent_run_id, coalesce(forecast.metadata, '{}'::jsonb))
  ) then
    raise exception 'Forecast conflicts with immutable logical forecast history.' using errcode = '55000';
  end if;

  insert into public.hermes_forecasts (
    stable_key, ticker, scenario, forecast_type, horizon_date, probability,
    predicted_value, unit, benchmark_symbol, benchmark_value, agent_run_id,
    model_version, status, metadata
  )
  select
    forecast.stable_key, forecast.ticker, forecast.scenario, forecast.forecast_type,
    forecast.horizon_date, forecast.probability, forecast.predicted_value,
    coalesce(forecast.unit, 'ratio'), coalesce(forecast.benchmark_symbol, 'QQQ'),
    forecast.benchmark_value, p_agent_run_id, forecast.model_version,
    'open', coalesce(forecast.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_forecasts) as forecast(
    stable_key text, ticker text, scenario text, forecast_type text,
    horizon_date date, probability numeric, predicted_value numeric, unit text,
    benchmark_symbol text, benchmark_value numeric, model_version text, metadata jsonb
  )
  on conflict (ticker, scenario, forecast_type, unit, model_version) do nothing;
  get diagnostics saved_forecast_count = row_count;

  return jsonb_build_object(
    'nodes', saved_node_count,
    'edges', saved_edge_count,
    'forecasts_inserted', saved_forecast_count
  );
end;
$$;

revoke all on function public.hermes_grade_forecast_outcome(uuid, timestamptz, numeric, numeric, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hermes_grade_forecast_outcome(uuid, timestamptz, numeric, numeric, boolean, text, text, jsonb) to service_role;

revoke all on function public.hermes_replace_underwriting_graph(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hermes_replace_underwriting_graph(uuid, jsonb, jsonb, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- Evaluation view
-- ----------------------------------------------------------------------------
create or replace view public.hermes_forecast_evaluations as
select
  f.id as forecast_id,
  f.stable_key,
  f.ticker,
  f.scenario,
  f.forecast_type,
  f.model_version,
  f.as_of,
  f.horizon_date,
  f.probability,
  f.predicted_value,
  f.unit,
  f.benchmark_symbol,
  f.benchmark_value,
  f.status,
  o.id as outcome_id,
  o.observed_at,
  o.actual_value,
  o.qqq_value,
  o.outcome_occurred,
  abs(o.actual_value - f.predicted_value) as absolute_error,
  case
    when f.forecast_type <> 'annualized_return'::text or f.unit <> 'ratio'::text or o.qqq_value is null then null::numeric
    else o.actual_value - o.qqq_value
  end as alpha,
  case
    when f.forecast_type <> 'annualized_return'::text or f.unit <> 'ratio'::text or o.qqq_value is null or f.benchmark_value is null then null::boolean
    else (f.predicted_value > f.benchmark_value) = (o.actual_value > o.qqq_value)
  end as directional_hit,
  case
    when f.probability is null or o.outcome_occurred is null then null::numeric
    else power(f.probability - case when o.outcome_occurred then 1 else 0 end::numeric, 2::numeric)
  end as brier_component,
  f.agent_run_id
from public.hermes_forecasts f
left join lateral (
  select latest.*
  from public.hermes_forecast_outcomes latest
  where latest.forecast_id = f.id
  order by latest.observed_at desc
  limit 1
) o on true;

alter view public.hermes_forecast_evaluations set (security_invoker = on);
grant select on public.hermes_forecast_evaluations to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS + realtime
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'hermes_prompt_versions', 'hermes_agent_runs',
    'hermes_underwriting_nodes', 'hermes_underwriting_edges',
    'hermes_forecasts', 'hermes_forecast_outcomes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'hermes_agent_runs', 'hermes_underwriting_nodes', 'hermes_underwriting_edges',
    'hermes_forecasts', 'hermes_forecast_outcomes'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

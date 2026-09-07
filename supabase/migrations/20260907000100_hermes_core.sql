-- ============================================================================
-- Dustin North Star Project Hermes — core schema extension
-- Target: Supabase project INVESTING-BRAIN-AG (cwiaqczpifnxxcucqwvr)
--
-- Design rules (see README "Data model"):
--   * Extension, not rewrite. Every legacy Awe Capital table stays untouched
--     and keeps its triggers/views. Hermes adds hermes_* tables, views and
--     functions next to them and links by uuid / ticker.
--   * Reads: anon + authenticated SELECT (the app reads with the publishable
--     key, exactly like the legacy tables). Writes: service_role only, through
--     Hermes route handlers / server actions / agent API. RLS is enabled on
--     every new table; no anon write policy exists on purpose.
--   * Every table is realtime-published so the UI can invalidate live.
--   * Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.hermes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Canonical ticker helpers: "NAS:MU" -> "MU", "MU" -> "MU"
create or replace function public.hermes_bare_symbol(ticker text)
returns text
language sql
immutable
as $$
  select upper(case when position(':' in coalesce(ticker, '')) > 0 then split_part(ticker, ':', 2) else ticker end);
$$;

-- array_to_string is only STABLE in Postgres, which disqualifies it from
-- generated columns; this immutable wrapper is what the tsvector columns use.
create or replace function public.hermes_join_text(items text[])
returns text
language sql
immutable
as $$
  select coalesce(array_to_string(items, ' '), '');
$$;

-- ----------------------------------------------------------------------------
-- hermes_mandate — the always-accessible North Star (single versioned row)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_mandate (
  id text primary key default 'north-star',
  version integer not null default 1,
  title text not null default 'North Star Project Hermes',
  mission text not null,
  benchmark_symbol text not null default 'QQQ',
  horizon_years integer not null default 10,
  hurdle_irr numeric not null default 0.15,
  rules jsonb not null default '[]'::jsonb,
  kpis jsonb not null default '[]'::jsonb,
  sleeves jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists hermes_mandate_set_updated_at on public.hermes_mandate;
create trigger hermes_mandate_set_updated_at
before update on public.hermes_mandate
for each row execute function public.hermes_set_updated_at();

-- ----------------------------------------------------------------------------
-- hermes_ideas — Idea Pipeline (Kanban) cards
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_ideas (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,                       -- canonical exchange-prefixed when known (NAS:MU)
  symbol text generated always as (public.hermes_bare_symbol(ticker)) stored,
  company_name text,
  stage text not null default 'sourcing'
    check (stage in ('sourcing', 'diligence', 'live', 'monitor', 'archive')),
  sort_order double precision not null default 0,
  conviction smallint check (conviction between 1 and 5),
  risk_score smallint check (risk_score between 1 and 5),
  target_weight_pct numeric,                  -- decimal ratio (0.03 = 3%)
  current_weight_pct numeric,                 -- decimal ratio, snapshot at last sync
  thesis text,
  why_beat_qqq text,
  falsifier text,
  catalyst text,
  next_action text,
  persona_slug text,
  memo_id uuid,                               -- analyst_memos.id (soft link; memos are append-only)
  theme_slug text,
  tags text[] not null default '{}',
  source text not null default 'manual',      -- manual | north_star_seed | master_recommendation | position | agent | import
  source_ref jsonb not null default '{}'::jsonb,
  owner text not null default 'dustin',
  archived_reason text,
  metadata jsonb not null default '{}'::jsonb,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hermes_ideas_stage_order on public.hermes_ideas (stage, sort_order);
create index if not exists idx_hermes_ideas_symbol on public.hermes_ideas (symbol);
create index if not exists idx_hermes_ideas_tags on public.hermes_ideas using gin (tags);
create unique index if not exists uq_hermes_ideas_active_ticker
  on public.hermes_ideas (upper(ticker)) where stage <> 'archive';

drop trigger if exists hermes_ideas_set_updated_at on public.hermes_ideas;
create trigger hermes_ideas_set_updated_at
before update on public.hermes_ideas
for each row execute function public.hermes_set_updated_at();

create table if not exists public.hermes_idea_events (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.hermes_ideas (id) on delete cascade,
  event_type text not null,                   -- created | stage_changed | updated | archived | comment
  from_stage text,
  to_stage text,
  actor text not null default 'dustin',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_hermes_idea_events_idea on public.hermes_idea_events (idea_id, created_at desc);

-- Stage-change audit trail written by the database, not the app, so agent
-- writes and UI writes are recorded identically.
create or replace function public.hermes_ideas_audit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.hermes_idea_events (idea_id, event_type, to_stage, actor, payload)
    values (new.id, 'created', new.stage, coalesce(new.owner, 'dustin'),
            jsonb_build_object('source', new.source, 'ticker', new.ticker));
    return new;
  end if;
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    insert into public.hermes_idea_events (idea_id, event_type, from_stage, to_stage, actor, payload)
    values (new.id, 'stage_changed', old.stage, new.stage, coalesce(new.owner, 'dustin'),
            jsonb_build_object('ticker', new.ticker));
  end if;
  return new;
end;
$$;

drop trigger if exists hermes_ideas_audit_insert on public.hermes_ideas;
create trigger hermes_ideas_audit_insert
after insert on public.hermes_ideas
for each row execute function public.hermes_ideas_audit();

drop trigger if exists hermes_ideas_audit_update on public.hermes_ideas;
create trigger hermes_ideas_audit_update
before update on public.hermes_ideas
for each row execute function public.hermes_ideas_audit();

-- ----------------------------------------------------------------------------
-- hermes_notes — markdown-first research notes, journal entries, decisions
-- (legacy analyst_memos stay where they are; hermes_research_stream unions both)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'note'
    check (kind in ('memo', 'note', 'journal', 'decision', 'review', 'meeting', 'agent')),
  title text not null,
  body_md text not null default '',
  tickers text[] not null default '{}',
  tags text[] not null default '{}',
  persona_slug text,
  idea_id uuid references public.hermes_ideas (id) on delete set null,
  linked_memo_id uuid,                        -- analyst_memos.id
  verdict text,
  conviction smallint check (conviction between 1 and 5),
  author text not null default 'dustin',
  source_system text not null default 'hermes_app',
  is_pinned boolean not null default false,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', public.hermes_join_text(tickers)), 'A') ||
    setweight(to_tsvector('english', public.hermes_join_text(tags)), 'B') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hermes_notes_search on public.hermes_notes using gin (search);
create index if not exists idx_hermes_notes_tickers on public.hermes_notes using gin (tickers);
create index if not exists idx_hermes_notes_tags on public.hermes_notes using gin (tags);
create index if not exists idx_hermes_notes_occurred on public.hermes_notes (occurred_at desc);

drop trigger if exists hermes_notes_set_updated_at on public.hermes_notes;
create trigger hermes_notes_set_updated_at
before update on public.hermes_notes
for each row execute function public.hermes_set_updated_at();

-- ----------------------------------------------------------------------------
-- hermes_trades — explicit trade log (manual entries, agent proposals that were
-- executed by Dustin, and imported broker executions)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_trades (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,                   -- idempotency key for imports
  trade_time timestamptz not null,
  trade_date date generated always as ((trade_time at time zone 'UTC')::date) stored,
  symbol text not null,
  ticker text,                                -- canonical when known
  company_name text,
  asset_type text not null default 'stock' check (asset_type in ('stock', 'option', 'etf', 'cash', 'bond', 'fx', 'other')),
  side text not null check (side in ('BUY', 'SELL', 'SHORT', 'COVER', 'ASSIGN', 'EXERCISE', 'EXPIRE', 'DIVIDEND', 'OTHER')),
  quantity numeric,
  price numeric,
  currency text not null default 'USD',
  notional_usd numeric,
  fees_usd numeric,
  realized_pnl_usd numeric,
  sleeve_id text not null default 'ibkr-core',
  idea_id uuid references public.hermes_ideas (id) on delete set null,
  memo_id uuid,
  rationale text,
  tags text[] not null default '{}',
  source text not null default 'manual',      -- manual | ibkr_import | legacy_import:investment-brain | agent
  source_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_hermes_trades_time on public.hermes_trades (trade_time desc);
create index if not exists idx_hermes_trades_symbol on public.hermes_trades (symbol);

-- ----------------------------------------------------------------------------
-- hermes_performance_points — daily portfolio return series + benchmark
-- (imported once from the Dustin Awe Capital reference DB, then maintained by
--  the IBKR sync; the app never reads the reference DB directly)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_performance_points (
  observation_date date not null,
  series text not null default 'portfolio',   -- portfolio | benchmark
  nav numeric,
  daily_return numeric,                       -- decimal ratio, 1D TWR
  index_value numeric,                        -- benchmark total-return index or rebased NAV index
  ytd_return numeric,
  source text not null default 'legacy_import:investment-brain',
  imported_at timestamptz not null default now(),
  primary key (series, observation_date)
);
create index if not exists idx_hermes_perf_date on public.hermes_performance_points (observation_date);

-- ----------------------------------------------------------------------------
-- hermes_knowledge — migrated persona docs, playbooks, specs, templates
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_knowledge (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'process'
    check (category in ('persona', 'process', 'rules', 'playbook', 'spec', 'prompt', 'template', 'agent', 'skill', 'legacy')),
  persona_slug text,
  body_md text not null,
  summary text,
  source_repo text,                           -- awe-capital | dustin-awe-capital | hermes
  source_path text,
  content_sha256 text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  display_order integer not null default 100,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', public.hermes_join_text(tags)), 'B') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hermes_knowledge_search on public.hermes_knowledge using gin (search);
create index if not exists idx_hermes_knowledge_category on public.hermes_knowledge (category, display_order);

drop trigger if exists hermes_knowledge_set_updated_at on public.hermes_knowledge;
create trigger hermes_knowledge_set_updated_at
before update on public.hermes_knowledge
for each row execute function public.hermes_set_updated_at();

-- ----------------------------------------------------------------------------
-- hermes_quant_jobs — screens, backtests, factor studies (agent-extensible)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_quant_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('screen', 'backtest', 'factor', 'signal', 'custom')),
  name text not null,
  description text,
  spec jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'queued', 'running', 'done', 'error')),
  result jsonb,
  result_summary text,
  requested_by text not null default 'dustin',
  run_by text,
  error text,
  is_saved boolean not null default true,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_hermes_quant_jobs_kind on public.hermes_quant_jobs (kind, created_at desc);

drop trigger if exists hermes_quant_jobs_set_updated_at on public.hermes_quant_jobs;
create trigger hermes_quant_jobs_set_updated_at
before update on public.hermes_quant_jobs
for each row execute function public.hermes_set_updated_at();

-- ----------------------------------------------------------------------------
-- hermes_agent_tasks — control hooks for AI agents (claim / complete)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,                    -- underwrite | refresh_memo | screen | backtest | review | custom
  title text not null,
  instructions text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'claimed', 'done', 'failed', 'cancelled')),
  priority integer not null default 50,
  ticker text,
  idea_id uuid references public.hermes_ideas (id) on delete set null,
  assigned_agent text,
  claimed_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  result_ref jsonb not null default '{}'::jsonb,   -- {table, id} pointers to what the agent wrote
  created_by text not null default 'dustin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hermes_agent_tasks_status on public.hermes_agent_tasks (status, priority desc, created_at);

drop trigger if exists hermes_agent_tasks_set_updated_at on public.hermes_agent_tasks;
create trigger hermes_agent_tasks_set_updated_at
before update on public.hermes_agent_tasks
for each row execute function public.hermes_set_updated_at();

-- Atomic claim for agents: first open task of the requested types, highest
-- priority first. security definer so the agent API can call it via RPC with
-- the service key while the logic stays in one place.
create or replace function public.hermes_claim_agent_task(p_agent text, p_task_types text[] default null)
returns setof public.hermes_agent_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.hermes_agent_tasks
  where status = 'open'
    and (p_task_types is null or task_type = any (p_task_types))
  order by priority desc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.hermes_agent_tasks
  set status = 'claimed', assigned_agent = p_agent, claimed_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.hermes_claim_agent_task(text, text[]) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- hermes_activity — unified timeline (journal mode reads this + notes + memos)
-- ----------------------------------------------------------------------------
create table if not exists public.hermes_activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                         -- idea.stage | note.created | trade.logged | task.done | mandate.updated | ...
  ref_table text,
  ref_id text,
  ticker text,
  title text not null,
  detail text,
  actor text not null default 'dustin',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_hermes_activity_time on public.hermes_activity (occurred_at desc);
create index if not exists idx_hermes_activity_ticker on public.hermes_activity (ticker);

create or replace function public.hermes_activity_from_idea_event()
returns trigger
language plpgsql
as $$
declare
  v_ticker text;
begin
  select ticker into v_ticker from public.hermes_ideas where id = new.idea_id;
  insert into public.hermes_activity (kind, ref_table, ref_id, ticker, title, detail, actor, payload, occurred_at)
  values (
    'idea.' || new.event_type,
    'hermes_ideas', new.idea_id::text, v_ticker,
    case when new.event_type = 'stage_changed'
      then v_ticker || ' moved ' || coalesce(new.from_stage, '?') || ' → ' || coalesce(new.to_stage, '?')
      else v_ticker || ' idea ' || new.event_type end,
    null, new.actor, new.payload, new.created_at
  );
  return new;
end;
$$;

drop trigger if exists hermes_idea_events_activity on public.hermes_idea_events;
create trigger hermes_idea_events_activity
after insert on public.hermes_idea_events
for each row execute function public.hermes_activity_from_idea_event();

create or replace function public.hermes_activity_from_note()
returns trigger
language plpgsql
as $$
begin
  insert into public.hermes_activity (kind, ref_table, ref_id, ticker, title, detail, actor, payload, occurred_at)
  values ('note.created', 'hermes_notes', new.id::text, new.tickers[1], new.title, left(new.body_md, 240), new.author,
          jsonb_build_object('kind', new.kind, 'tags', new.tags), new.occurred_at);
  return new;
end;
$$;

drop trigger if exists hermes_notes_activity on public.hermes_notes;
create trigger hermes_notes_activity
after insert on public.hermes_notes
for each row execute function public.hermes_activity_from_note();

create or replace function public.hermes_activity_from_trade()
returns trigger
language plpgsql
as $$
begin
  if new.source like 'legacy_import%' then
    return new; -- bulk imports do not spam the timeline
  end if;
  insert into public.hermes_activity (kind, ref_table, ref_id, ticker, title, detail, actor, payload, occurred_at)
  values ('trade.logged', 'hermes_trades', new.id::text, coalesce(new.ticker, new.symbol),
          new.side || ' ' || coalesce(new.quantity::text, '') || ' ' || new.symbol || coalesce(' @ ' || new.price::text, ''),
          new.rationale, 'dustin', jsonb_build_object('sleeve', new.sleeve_id, 'source', new.source), new.trade_time);
  return new;
end;
$$;

drop trigger if exists hermes_trades_activity on public.hermes_trades;
create trigger hermes_trades_activity
after insert on public.hermes_trades
for each row execute function public.hermes_activity_from_trade();

-- ----------------------------------------------------------------------------
-- Full-text search over the legacy memo corpus (expression index; additive)
-- ----------------------------------------------------------------------------
create index if not exists idx_hermes_analyst_memos_fts
  on public.analyst_memos
  using gin (to_tsvector('english', coalesce(company_name, '') || ' ' || coalesce(ticker, '') || ' ' || coalesce(memo_markdown, '')));

-- ----------------------------------------------------------------------------
-- Row level security: anon/authenticated read; service_role writes.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'hermes_mandate', 'hermes_ideas', 'hermes_idea_events', 'hermes_notes', 'hermes_trades',
    'hermes_performance_points', 'hermes_knowledge', 'hermes_quant_jobs', 'hermes_agent_tasks', 'hermes_activity'
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

-- ----------------------------------------------------------------------------
-- Realtime publication (the publication exists but publishes no tables yet)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'hermes_mandate', 'hermes_ideas', 'hermes_idea_events', 'hermes_notes', 'hermes_trades',
    'hermes_quant_jobs', 'hermes_agent_tasks', 'hermes_activity'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

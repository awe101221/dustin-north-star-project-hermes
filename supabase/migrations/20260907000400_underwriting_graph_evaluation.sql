-- ============================================================================
-- North Star underwriting graph + forecast evaluation loop
-- Persists versioned prompt contracts, agent provenance, underwriting graph
-- nodes/edges, forward forecasts, and measured outcomes relative to QQQ.
-- Idempotent; confidential reads and all writes require server-side service_role.
-- ============================================================================

create table if not exists public.hermes_prompt_versions (
  prompt_id text not null,
  version text not null,
  role text not null,
  schema_version text not null,
  prompt_body text not null,
  content_sha256 text,
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  released_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (prompt_id, version),
  check (content_sha256 is null or content_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

-- Release and audit chronology is immutable provenance. Validate before any
-- prompt repair or trigger replacement so replay stops without changing state.
do $$
declare
  invalid_prompt record;
begin
  select prompt_id, version,
         case
           when released_at is null or not pg_catalog.isfinite(released_at) or released_at > pg_catalog.statement_timestamp() then 'released_at'
           when created_at is null or not pg_catalog.isfinite(created_at) or created_at > pg_catalog.statement_timestamp() then 'created_at'
           else 'updated_at'
         end as invalid_column
  into invalid_prompt
  from public.hermes_prompt_versions
  where released_at is null
     or not pg_catalog.isfinite(released_at)
     or released_at > pg_catalog.statement_timestamp()
     or created_at is null
     or not pg_catalog.isfinite(created_at)
     or created_at > pg_catalog.statement_timestamp()
     or updated_at is null
     or not pg_catalog.isfinite(updated_at)
     or updated_at > pg_catalog.statement_timestamp()
  order by prompt_id, version
  limit 1;

  if found then
    raise exception 'Cannot enforce prompt timestamp chronology for %@%: % must be non-null, finite, and not later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_prompt.prompt_id, invalid_prompt.version, invalid_prompt.invalid_column
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_prompt_versions alter column released_at set not null;
alter table public.hermes_prompt_versions alter column created_at set not null;
alter table public.hermes_prompt_versions alter column updated_at set not null;
alter table public.hermes_prompt_versions alter column released_at drop default;
alter table public.hermes_prompt_versions drop constraint if exists hermes_prompt_versions_released_at_finite_check;
alter table public.hermes_prompt_versions
  add constraint hermes_prompt_versions_released_at_finite_check
  check (pg_catalog.isfinite(released_at)) not valid;
alter table public.hermes_prompt_versions validate constraint hermes_prompt_versions_released_at_finite_check;
alter table public.hermes_prompt_versions drop constraint if exists hermes_prompt_versions_created_at_finite_check;
alter table public.hermes_prompt_versions
  add constraint hermes_prompt_versions_created_at_finite_check
  check (pg_catalog.isfinite(created_at)) not valid;
alter table public.hermes_prompt_versions validate constraint hermes_prompt_versions_created_at_finite_check;
alter table public.hermes_prompt_versions drop constraint if exists hermes_prompt_versions_updated_at_finite_check;
alter table public.hermes_prompt_versions
  add constraint hermes_prompt_versions_updated_at_finite_check
  check (pg_catalog.isfinite(updated_at)) not valid;
alter table public.hermes_prompt_versions validate constraint hermes_prompt_versions_updated_at_finite_check;

do $$
declare
  invalid_prompt record;
begin
  select prompt_id, version, created_at, updated_at into invalid_prompt
  from public.hermes_prompt_versions
  where created_at > updated_at
  order by prompt_id, version
  limit 1;
  if found then
    raise exception 'Cannot enforce prompt audit chronology for %@%: created_at % must be less than or equal to updated_at %; remediate this row explicitly before replaying this migration.',
      invalid_prompt.prompt_id, invalid_prompt.version,
      invalid_prompt.created_at, invalid_prompt.updated_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_prompt_versions
  drop constraint if exists hermes_prompt_versions_audit_chronology_check;
alter table public.hermes_prompt_versions
  add constraint hermes_prompt_versions_audit_chronology_check
  check (created_at <= updated_at) not valid;
alter table public.hermes_prompt_versions
  validate constraint hermes_prompt_versions_audit_chronology_check;

-- This migration may already be in the ledger. Keep upgrades idempotent so a
-- changed migration checksum safely upgrades an existing installation.
alter table public.hermes_prompt_versions add column if not exists prompt_body text;
alter table public.hermes_prompt_versions add column if not exists content_sha256 text;
drop trigger if exists hermes_prompt_versions_protect on public.hermes_prompt_versions;
drop trigger if exists hermes_prompt_versions_hash_body on public.hermes_prompt_versions;
alter table public.hermes_prompt_versions drop constraint if exists hermes_prompt_versions_content_hash_check;

-- Only the four seed rows produced by the known pre-body migration may infer a
-- missing body from their exact complete legacy tuple. Any other null body is
-- preserved and stops replay for explicit remediation.
update public.hermes_prompt_versions as target
set prompt_body = legacy.legacy_body
from (values
  ('daily-10-plus-10', '2.0.0', 'Hermes PM orchestrator', 'best-ideas-snapshot-v2', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', 'active', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', '{"source":"north-star-seed"}'::jsonb),
  ('company-underwrite', '1.0.0', 'Company analyst', 'company-model-v1', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', 'active', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', '{"source":"north-star-seed"}'::jsonb),
  ('risk-falsifier-review', '1.0.0', 'Risk and falsifier analyst', 'falsifier-review-v1', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', 'active', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', '{"source":"north-star-seed"}'::jsonb),
  ('forecast-outcome-grade', '0.1.0', 'Outcome evaluator', 'forecast-outcome-v1', 'Close due forecasts against observed results and QQQ, preserving source evidence.', 'draft', 'Close due forecasts against observed results and QQQ, preserving source evidence.', '{"source":"north-star-seed"}'::jsonb)
) as legacy(prompt_id, version, role, schema_version, legacy_body, status, description, metadata)
where target.prompt_id = legacy.prompt_id
  and target.version = legacy.version
  and target.prompt_body is null
  and target.content_sha256 is null
  and target.role = legacy.role
  and target.schema_version = legacy.schema_version
  and target.status = legacy.status
  and target.description is not distinct from legacy.description
  and target.metadata = legacy.metadata;

do $$
declare
  unexpected record;
begin
  select prompt_id, version into unexpected
  from public.hermes_prompt_versions
  where prompt_body is null
  order by prompt_id, version
  limit 1;

  if found then
    raise exception 'Cannot enforce prompt integrity for %@%: the row has no prompt_body and is not an explicitly known complete legacy tuple; the row was preserved. Remediate role, schema_version, status, description, metadata, prompt_body, and content_sha256 explicitly before replay.',
      unexpected.prompt_id, unexpected.version
      using errcode = '23514';
  end if;
end $$;

-- A missing checksum remains repairable for non-seed historical prompts and for
-- an exact known legacy seed tuple. At one of the four seed identities, every
-- other tuple (including a current body without its checksum) fails closed.
do $$
declare
  unexpected record;
begin
  with contracts(prompt_id, version, role, schema_version, legacy_body, status, description, metadata) as (values
    ('daily-10-plus-10', '2.0.0', 'Hermes PM orchestrator', 'best-ideas-snapshot-v2', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', 'active', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', '{"source":"north-star-seed"}'::jsonb),
    ('company-underwrite', '1.0.0', 'Company analyst', 'company-model-v1', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', 'active', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', '{"source":"north-star-seed"}'::jsonb),
    ('risk-falsifier-review', '1.0.0', 'Risk and falsifier analyst', 'falsifier-review-v1', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', 'active', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', '{"source":"north-star-seed"}'::jsonb),
    ('forecast-outcome-grade', '0.1.0', 'Outcome evaluator', 'forecast-outcome-v1', 'Close due forecasts against observed results and QQQ, preserving source evidence.', 'draft', 'Close due forecasts against observed results and QQQ, preserving source evidence.', '{"source":"north-star-seed"}'::jsonb)
  )
  select target.prompt_id, target.version into unexpected
  from public.hermes_prompt_versions target
  join contracts on contracts.prompt_id = target.prompt_id and contracts.version = target.version
  where target.content_sha256 is null
    and row(target.role, target.schema_version, target.prompt_body, target.status, target.description, target.metadata)
        is distinct from
        row(contracts.role, contracts.schema_version, contracts.legacy_body, contracts.status, contracts.description, contracts.metadata)
  order by target.prompt_id, target.version
  limit 1;

  if found then
    raise exception 'Cannot repair unexpected prompt contract %@%: a checksum is missing from a tuple that is not an explicitly known complete legacy state. The row was preserved for remediation.',
      unexpected.prompt_id, unexpected.version
      using errcode = '55000';
  end if;
end $$;

-- Backfill every remaining missing checksum before immutability, then reject every
-- provided checksum that does not already match its preserved body.
update public.hermes_prompt_versions
set content_sha256 = encode(extensions.digest(prompt_body, 'sha256'), 'hex')
where content_sha256 is null;

do $$
declare
  unexpected record;
begin
  select prompt_id, version into unexpected
  from public.hermes_prompt_versions
  where content_sha256 <> encode(extensions.digest(prompt_body, 'sha256'), 'hex')
  order by prompt_id, version
  limit 1;

  if found then
    raise exception 'Cannot enforce prompt integrity for %@%: the checksum does not match prompt_body; the row was preserved. Remediate explicitly before replaying this migration.',
      unexpected.prompt_id, unexpected.version
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_prompt_versions alter column prompt_body set not null;
alter table public.hermes_prompt_versions alter column content_sha256 set not null;

create table if not exists public.hermes_agent_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null,
  workflow_version text not null,
  external_key text unique,
  prompt_id text,
  prompt_version text,
  agent_name text not null,
  status text not null default 'running' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  ticker text,
  task_id uuid references public.hermes_agent_tasks (id) on delete set null,
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
  constraint hermes_agent_runs_prompt_provenance_pair_check
    check ((prompt_id is null) = (prompt_version is null)),
  foreign key (prompt_id, prompt_version) references public.hermes_prompt_versions (prompt_id, version) on update cascade
);

-- Preserve audit chronology before reinstalling any mutable run lifecycle logic.
do $$
declare
  invalid_run record;
begin
  select id,
         case
           when created_at is null or not pg_catalog.isfinite(created_at) or created_at > pg_catalog.statement_timestamp() then 'created_at'
           else 'updated_at'
         end as invalid_column
  into invalid_run
  from public.hermes_agent_runs
  where created_at is null
     or not pg_catalog.isfinite(created_at)
     or created_at > pg_catalog.statement_timestamp()
     or updated_at is null
     or not pg_catalog.isfinite(updated_at)
     or updated_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce agent run audit chronology for run %: % must be non-null, finite, and not later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_run.id, invalid_run.invalid_column
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_agent_runs alter column created_at set not null;
alter table public.hermes_agent_runs alter column updated_at set not null;
alter table public.hermes_agent_runs drop constraint if exists hermes_agent_runs_created_at_finite_check;
alter table public.hermes_agent_runs
  add constraint hermes_agent_runs_created_at_finite_check
  check (pg_catalog.isfinite(created_at)) not valid;
alter table public.hermes_agent_runs validate constraint hermes_agent_runs_created_at_finite_check;
alter table public.hermes_agent_runs drop constraint if exists hermes_agent_runs_updated_at_finite_check;
alter table public.hermes_agent_runs
  add constraint hermes_agent_runs_updated_at_finite_check
  check (pg_catalog.isfinite(updated_at)) not valid;
alter table public.hermes_agent_runs validate constraint hermes_agent_runs_updated_at_finite_check;

do $$
declare
  invalid_run record;
begin
  select id, created_at, updated_at into invalid_run
  from public.hermes_agent_runs
  where created_at > updated_at
  order by id
  limit 1;
  if found then
    raise exception 'Cannot enforce agent run audit chronology for run %: created_at % must be less than or equal to updated_at %; remediate this row explicitly before replaying this migration.',
      invalid_run.id, invalid_run.created_at, invalid_run.updated_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_agent_runs
  drop constraint if exists hermes_agent_runs_audit_chronology_check;
alter table public.hermes_agent_runs
  add constraint hermes_agent_runs_audit_chronology_check
  check (created_at <= updated_at) not valid;
alter table public.hermes_agent_runs
  validate constraint hermes_agent_runs_audit_chronology_check;

-- Existing registration chronology is immutable provenance. Fail before
-- reinstalling run protections instead of freezing an invalid legacy start.
do $$
declare
  invalid_run record;
begin
  select id, started_at into invalid_run
  from public.hermes_agent_runs
  where started_at is null
     or not pg_catalog.isfinite(started_at)
     or started_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce agent run registration chronology for run %: existing started_at is null, non-finite, or later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_run.id
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_agent_runs alter column started_at set not null;
alter table public.hermes_agent_runs
  drop constraint if exists hermes_agent_runs_started_at_valid_check;
alter table public.hermes_agent_runs
  add constraint hermes_agent_runs_started_at_valid_check
  check (pg_catalog.isfinite(started_at)) not valid;
alter table public.hermes_agent_runs
  validate constraint hermes_agent_runs_started_at_valid_check;

-- started_at records lifecycle provenance while created_at records row audit
-- creation. Either may legitimately come first, so replay removes the obsolete
-- cross-column constraint without rewriting preserved runs.
alter table public.hermes_agent_runs
  drop constraint if exists hermes_agent_runs_registration_chronology_check;

-- Completion timestamps are immutable lifecycle provenance. A replay must not
-- freeze, rewrite, or silently accept an invalid legacy terminal chronology.
do $$
declare
  invalid_run record;
begin
  select id, status, started_at, completed_at into invalid_run
  from public.hermes_agent_runs
  where (status in ('succeeded', 'failed', 'cancelled') and completed_at is null)
     or (status in ('queued', 'running') and completed_at is not null)
     or (completed_at is not null and (
       not pg_catalog.isfinite(completed_at)
       or completed_at < started_at
       or completed_at > pg_catalog.statement_timestamp()
     ))
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce agent run completion chronology for run % (status %, started_at %, completed_at %): completion must be finite, at or after started_at, not in the future, present exactly for terminal status, and absent for queued/running status; remediate this row explicitly before replaying this migration.',
      invalid_run.id, invalid_run.status, invalid_run.started_at, invalid_run.completed_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_agent_runs
  drop constraint if exists hermes_agent_runs_completion_valid_check;
alter table public.hermes_agent_runs
  add constraint hermes_agent_runs_completion_valid_check
  check (
    (
      status in ('succeeded', 'failed', 'cancelled')
      and completed_at is not null
      and pg_catalog.isfinite(completed_at)
      and completed_at >= started_at
    )
    or (
      status in ('queued', 'running')
      and completed_at is null
    )
  ) not valid;
alter table public.hermes_agent_runs
  validate constraint hermes_agent_runs_completion_valid_check;

-- A partial provenance pair cannot be repaired without guessing immutable
-- history. Stop replay for explicit remediation instead of rewriting live rows.
do $$
begin
  if exists (
    select 1 from public.hermes_agent_runs
    where (prompt_id is null) <> (prompt_version is null)
  ) then
    raise exception 'Cannot enforce complete prompt provenance: existing agent runs contain partial prompt provenance; remediate explicitly before replaying this migration.'
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_agent_runs
  drop constraint if exists hermes_agent_runs_prompt_provenance_pair_check;
alter table public.hermes_agent_runs
  add constraint hermes_agent_runs_prompt_provenance_pair_check
  check ((prompt_id is null) = (prompt_version is null));
create index if not exists idx_hermes_agent_runs_workflow on public.hermes_agent_runs (workflow_id, started_at desc);
create index if not exists idx_hermes_agent_runs_ticker on public.hermes_agent_runs (ticker, started_at desc);
create index if not exists idx_hermes_agent_runs_status on public.hermes_agent_runs (status, started_at desc);

create table if not exists public.hermes_underwriting_nodes (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  node_type text not null check (node_type in ('company', 'assumption', 'forecast', 'falsifier', 'monitor', 'source', 'evidence', 'outcome', 'agent_run', 'decision', 'theme')),
  ticker text,
  title text not null,
  body text,
  status text not null default 'active' check (status in ('active', 'open', 'graded', 'superseded')),
  confidence numeric check (confidence is null or confidence between 0 and 1),
  as_of timestamptz not null,
  valid_until timestamptz,
  supersedes_id uuid references public.hermes_underwriting_nodes (id) on delete set null,
  agent_run_id uuid references public.hermes_agent_runs (id) on delete set null,
  prompt_id text,
  prompt_version text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stable_key, as_of)
);

alter table public.hermes_underwriting_nodes add column if not exists prompt_id text;
alter table public.hermes_underwriting_nodes add column if not exists prompt_version text;
do $$
begin
  if exists (
    select 1 from public.hermes_underwriting_nodes
    where (prompt_id is null) <> (prompt_version is null)
  ) then
    raise exception 'Cannot enforce complete node prompt provenance: existing underwriting nodes contain partial prompt provenance; remediate explicitly before replaying this migration.'
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_underwriting_nodes drop constraint if exists hermes_underwriting_nodes_prompt_provenance_pair_check;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_prompt_provenance_pair_check
  check ((prompt_id is null) = (prompt_version is null));
alter table public.hermes_underwriting_nodes drop constraint if exists hermes_underwriting_nodes_prompt_provenance_fkey;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_prompt_provenance_fkey
  foreign key (prompt_id, prompt_version)
  references public.hermes_prompt_versions (prompt_id, version);

-- Graph row creation/update times are audit history independent of valid_until.
do $$
declare
  invalid_node record;
begin
  select id, stable_key,
         case
           when created_at is null or not pg_catalog.isfinite(created_at) or created_at > pg_catalog.statement_timestamp() then 'created_at'
           else 'updated_at'
         end as invalid_column
  into invalid_node
  from public.hermes_underwriting_nodes
  where created_at is null
     or not pg_catalog.isfinite(created_at)
     or created_at > pg_catalog.statement_timestamp()
     or updated_at is null
     or not pg_catalog.isfinite(updated_at)
     or updated_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce underwriting node audit chronology for node % (stable_key %): % must be non-null, finite, and not later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_node.id, invalid_node.stable_key, invalid_node.invalid_column
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_underwriting_nodes alter column created_at set not null;
alter table public.hermes_underwriting_nodes alter column updated_at set not null;
alter table public.hermes_underwriting_nodes drop constraint if exists hermes_underwriting_nodes_created_at_finite_check;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_created_at_finite_check
  check (pg_catalog.isfinite(created_at)) not valid;
alter table public.hermes_underwriting_nodes validate constraint hermes_underwriting_nodes_created_at_finite_check;
alter table public.hermes_underwriting_nodes drop constraint if exists hermes_underwriting_nodes_updated_at_finite_check;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_updated_at_finite_check
  check (pg_catalog.isfinite(updated_at)) not valid;
alter table public.hermes_underwriting_nodes validate constraint hermes_underwriting_nodes_updated_at_finite_check;

do $$
declare
  invalid_node record;
begin
  select id, stable_key, created_at, updated_at into invalid_node
  from public.hermes_underwriting_nodes
  where created_at > updated_at
  order by id
  limit 1;
  if found then
    raise exception 'Cannot enforce underwriting node audit chronology for node % (stable_key %): created_at % must be less than or equal to updated_at %; remediate this row explicitly before replaying this migration.',
      invalid_node.id, invalid_node.stable_key,
      invalid_node.created_at, invalid_node.updated_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_underwriting_nodes
  drop constraint if exists hermes_underwriting_nodes_audit_chronology_check;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_audit_chronology_check
  check (created_at <= updated_at) not valid;
alter table public.hermes_underwriting_nodes
  validate constraint hermes_underwriting_nodes_audit_chronology_check;

-- A graph version without a finite, already-observed publication instant is
-- not recoverable history. Preserve and stop before replacing or validating
-- the direct-table boundary so live upgrades fail closed.
do $$
declare
  invalid_node record;
begin
  select id, stable_key, as_of into invalid_node
  from public.hermes_underwriting_nodes
  where as_of is null
     or not pg_catalog.isfinite(as_of)
     or as_of > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce graph publication chronology for node % (stable_key %): null or non-finite or future as_of %; remediate explicitly before replaying this migration.',
      invalid_node.id, invalid_node.stable_key, invalid_node.as_of
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_underwriting_nodes alter column as_of set not null;
alter table public.hermes_underwriting_nodes
  drop constraint if exists hermes_underwriting_nodes_as_of_valid_check;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_as_of_valid_check
  check (pg_catalog.isfinite(as_of)) not valid;
alter table public.hermes_underwriting_nodes
  validate constraint hermes_underwriting_nodes_as_of_valid_check;

-- A validity window is optional, but a present expiration must identify a
-- finite instant at or after the node version it governs. Identify the exact
-- legacy row before replacing protections so replay fails closed.
do $$
declare
  invalid_node record;
begin
  select id, stable_key, as_of, valid_until into invalid_node
  from public.hermes_underwriting_nodes
  where valid_until is not null
    and (
      not pg_catalog.isfinite(valid_until)
      or valid_until < as_of
    )
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce graph node validity window for node % (stable_key %): existing valid_until % must be finite and greater than or equal to as_of %; remediate this row explicitly before replaying this migration.',
      invalid_node.id, invalid_node.stable_key,
      invalid_node.valid_until, invalid_node.as_of
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_underwriting_nodes
  drop constraint if exists hermes_underwriting_nodes_valid_until_valid_check;
alter table public.hermes_underwriting_nodes
  add constraint hermes_underwriting_nodes_valid_until_valid_check
  check (
    valid_until is null
    or (
      pg_catalog.isfinite(valid_until)
      and valid_until >= as_of
    )
  ) not valid;
alter table public.hermes_underwriting_nodes
  validate constraint hermes_underwriting_nodes_valid_until_valid_check;
create index if not exists idx_hermes_underwriting_nodes_ticker on public.hermes_underwriting_nodes (ticker, as_of desc);
create index if not exists idx_hermes_underwriting_nodes_kind on public.hermes_underwriting_nodes (node_type, status, as_of desc);

create table if not exists public.hermes_underwriting_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.hermes_underwriting_nodes (id) on delete cascade,
  to_node_id uuid not null references public.hermes_underwriting_nodes (id) on delete cascade,
  relationship text not null check (relationship in ('has_forecast', 'depends_on', 'could_invalidate', 'tests', 'informed_by', 'supports', 'refutes', 'revises', 'confirms', 'disconfirms', 'produced_by', 'competes_with')),
  strength numeric check (strength is null or strength between -1 and 1),
  note text,
  agent_run_id uuid references public.hermes_agent_runs (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id, relationship)
);

-- Edge creation time is immutable audit provenance.
do $$
declare
  invalid_edge record;
begin
  select id, from_node_id, to_node_id, created_at into invalid_edge
  from public.hermes_underwriting_edges
  where created_at is null
     or not pg_catalog.isfinite(created_at)
     or created_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce underwriting edge audit chronology for edge % (% -> %): created_at % must be non-null, finite, and not later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_edge.id, invalid_edge.from_node_id, invalid_edge.to_node_id, invalid_edge.created_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_underwriting_edges alter column created_at set not null;
alter table public.hermes_underwriting_edges drop constraint if exists hermes_underwriting_edges_created_at_finite_check;
alter table public.hermes_underwriting_edges
  add constraint hermes_underwriting_edges_created_at_finite_check
  check (pg_catalog.isfinite(created_at)) not valid;
alter table public.hermes_underwriting_edges validate constraint hermes_underwriting_edges_created_at_finite_check;
create index if not exists idx_hermes_underwriting_edges_from on public.hermes_underwriting_edges (from_node_id, relationship);
create index if not exists idx_hermes_underwriting_edges_to on public.hermes_underwriting_edges (to_node_id, relationship);

create table if not exists public.hermes_forecasts (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  ticker text not null,
  scenario text not null check (scenario in ('Bear', 'Base', 'Bull', 'Probability-weighted')),
  forecast_type text not null check (forecast_type in ('annualized_return', 'target_price', 'revenue_cagr', 'margin', 'binary')),
  horizon_date date not null,
  probability numeric check (probability is null or probability between 0 and 1),
  predicted_value numeric not null,
  unit text not null default 'ratio',
  benchmark_symbol text not null default 'QQQ',
  benchmark_value numeric,
  agent_run_id uuid references public.hermes_agent_runs (id) on delete set null,
  prompt_id text,
  prompt_version text,
  model_version timestamptz not null
    constraint hermes_forecasts_model_version_finite_check
    check (pg_catalog.isfinite(model_version)),
  as_of timestamptz not null,
  status text not null default 'open' check (status in ('open', 'graded', 'superseded', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stable_key, model_version)
);

alter table public.hermes_forecasts add column if not exists prompt_id text;
alter table public.hermes_forecasts add column if not exists prompt_version text;
do $$
begin
  if exists (
    select 1 from public.hermes_forecasts
    where (prompt_id is null) <> (prompt_version is null)
  ) then
    raise exception 'Cannot enforce complete forecast prompt provenance: existing forecasts contain partial prompt provenance; remediate explicitly before replaying this migration.'
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_prompt_provenance_pair_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_prompt_provenance_pair_check
  check ((prompt_id is null) = (prompt_version is null));
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_prompt_provenance_fkey;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_prompt_provenance_fkey
  foreign key (prompt_id, prompt_version)
  references public.hermes_prompt_versions (prompt_id, version);

-- Forecast row creation/update times are immutable audit provenance.
do $$
declare
  invalid_forecast record;
begin
  select id, stable_key,
         case
           when created_at is null or not pg_catalog.isfinite(created_at) or created_at > pg_catalog.statement_timestamp() then 'created_at'
           else 'updated_at'
         end as invalid_column
  into invalid_forecast
  from public.hermes_forecasts
  where created_at is null
     or not pg_catalog.isfinite(created_at)
     or created_at > pg_catalog.statement_timestamp()
     or updated_at is null
     or not pg_catalog.isfinite(updated_at)
     or updated_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce forecast audit chronology for forecast % (stable_key %): % must be non-null, finite, and not later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key, invalid_forecast.invalid_column
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts alter column created_at set not null;
alter table public.hermes_forecasts alter column updated_at set not null;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_created_at_finite_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_created_at_finite_check
  check (pg_catalog.isfinite(created_at)) not valid;
alter table public.hermes_forecasts validate constraint hermes_forecasts_created_at_finite_check;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_updated_at_finite_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_updated_at_finite_check
  check (pg_catalog.isfinite(updated_at)) not valid;
alter table public.hermes_forecasts validate constraint hermes_forecasts_updated_at_finite_check;

do $$
declare
  invalid_forecast record;
begin
  select id, stable_key, created_at, updated_at into invalid_forecast
  from public.hermes_forecasts
  where created_at > updated_at
  order by id
  limit 1;
  if found then
    raise exception 'Cannot enforce forecast audit chronology for forecast % (stable_key %): created_at % must be less than or equal to updated_at %; remediate this row explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key,
      invalid_forecast.created_at, invalid_forecast.updated_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts
  drop constraint if exists hermes_forecasts_audit_chronology_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_audit_chronology_check
  check (created_at <= updated_at) not valid;
alter table public.hermes_forecasts
  validate constraint hermes_forecasts_audit_chronology_check;
create index if not exists idx_hermes_forecasts_ticker on public.hermes_forecasts (ticker, as_of desc);
create index if not exists idx_hermes_forecasts_due on public.hermes_forecasts (status, horizon_date);

-- Upgrade an already-applied installation: registration time is server-owned,
-- horizons are forward-only, stable_key is not forecast identity, and model
-- versions are valid canonical instants rather than timestamp-shaped text.
-- Required forecast timestamp identity must be checked before the view,
-- constraints, defaults, or legacy text type are changed.
do $$
declare
  invalid_forecast record;
begin
  select id, stable_key,
         case when model_version is null then 'model_version' else 'as_of' end as invalid_column
  into invalid_forecast
  from public.hermes_forecasts
  where model_version is null
     or as_of is null
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce required forecast timestamp for forecast % (stable_key %): existing % is null; remediate this row explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key, invalid_forecast.invalid_column
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts alter column as_of set default now();
drop view if exists public.hermes_forecast_evaluations;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_stable_key_model_version_key;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_logical_identity_key;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_model_version_timestamp_check;
do $$
declare
  legacy_forecast record;
  parsed_model_version timestamptz;
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.hermes_forecasts'::regclass
      and attname = 'model_version'
      and atttypid = 'text'::regtype
      and not attisdropped
  ) then
    for legacy_forecast in
      select id, stable_key, model_version
      from public.hermes_forecasts
      order by id
    loop
      if legacy_forecast.model_version is null then
        raise exception 'Cannot canonicalize forecast % (stable_key %): legacy model_version is null; remediate this row explicitly before replaying this migration.',
          legacy_forecast.id, legacy_forecast.stable_key
          using errcode = '23514';
      end if;
      begin
        parsed_model_version := legacy_forecast.model_version::timestamptz;
      exception when others then
        raise exception 'Cannot canonicalize forecast % (stable_key %): legacy model_version % is a non-castable model_version; remediate this row explicitly before replaying this migration.',
          legacy_forecast.id, legacy_forecast.stable_key, legacy_forecast.model_version
          using errcode = '23514';
      end;
    end loop;

    alter table public.hermes_forecasts
      alter column model_version type timestamptz
      using model_version::timestamptz;
  end if;
end $$;

-- Forecast registration is server-owned immutable chronology. Preserve and
-- identify an invalid legacy row before reinstalling forecast protections.
do $$
declare
  invalid_forecast record;
begin
  select id, stable_key, as_of into invalid_forecast
  from public.hermes_forecasts
  where as_of is null
     or not pg_catalog.isfinite(as_of)
     or as_of > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce forecast registration chronology for forecast % (stable_key %): existing as_of is missing, non-finite, or later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts
  drop constraint if exists hermes_forecasts_as_of_valid_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_as_of_valid_check
  check (pg_catalog.isfinite(as_of)) not valid;
alter table public.hermes_forecasts
  validate constraint hermes_forecasts_as_of_valid_check;

-- Existing installations are upgraded fail-closed. A non-finite or future
-- value has no trustworthy publication instant to infer, so preserve it for
-- explicit remediation rather than silently rewriting forecast identity.
do $$
declare
  invalid_forecast record;
begin
  select id, stable_key, model_version into invalid_forecast
  from public.hermes_forecasts
  where model_version is null
     or not pg_catalog.isfinite(model_version)
     or model_version > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce forecast model publication chronology for forecast % (stable_key %): model_version % is null, a non-finite model_version, or a future model_version; remediate explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key, invalid_forecast.model_version
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts alter column model_version set not null;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_model_version_finite_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_model_version_finite_check
  check (pg_catalog.isfinite(model_version));

-- Model publication cannot occur after the forecast publication it informs.
-- Offset-equivalent timestamps compare equal as timestamptz. Fail with row
-- identity before installing the replay-safe cross-column CHECK.
do $$
declare
  invalid_forecast record;
begin
  select id, stable_key, model_version, as_of into invalid_forecast
  from public.hermes_forecasts
  where model_version > as_of
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce forecast publication chronology for forecast % (stable_key %): model_version % must be less than or equal to as_of %; remediate this row explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key,
      invalid_forecast.model_version, invalid_forecast.as_of
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts
  drop constraint if exists hermes_forecasts_model_version_as_of_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_model_version_as_of_check
  check (model_version <= as_of) not valid;
alter table public.hermes_forecasts
  validate constraint hermes_forecasts_model_version_as_of_check;

-- A CHECK alone would accept nulls and otherwise reports only the constraint
-- name. Identify every legacy row before changing the schema so remediation is
-- actionable and the replay remains atomic.
do $$
declare
  invalid_forecast record;
begin
  select id, stable_key, horizon_date, as_of into invalid_forecast
  from public.hermes_forecasts
  where horizon_date is null
     or as_of is null
     or horizon_date <= as_of::date
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce forward forecast horizon for forecast % (stable_key %): existing horizon_date % must be non-null and later than as_of date %; remediate this row explicitly before replaying this migration.',
      invalid_forecast.id, invalid_forecast.stable_key,
      invalid_forecast.horizon_date, invalid_forecast.as_of::date
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts alter column horizon_date set not null;
alter table public.hermes_forecasts alter column as_of set not null;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_forward_horizon_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_forward_horizon_check
  check (horizon_date > as_of::date) not valid;
alter table public.hermes_forecasts
  validate constraint hermes_forecasts_forward_horizon_check;

create table if not exists public.hermes_forecast_outcomes (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.hermes_forecasts (id) on delete cascade,
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
create index if not exists idx_hermes_forecast_outcomes_forecast on public.hermes_forecast_outcomes (forecast_id, observed_at desc);
alter table public.hermes_forecast_outcomes alter column evidence_url set not null;

create or replace function public.hermes_is_valid_evidence_url(value text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  with candidate as (
    select pg_catalog.btrim(value) as normalized
  )
  select coalesce(
    normalized ~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z])([/?#][^[:space:]]*)?$'
    and pg_catalog.lower(pg_catalog.substring(pg_catalog.lower(normalized), '^https://([^/?#]+)'))
        !~ '(^|[.])(localhost|local|test|invalid|example|onion|internal|lan|home|localdomain)$',
    false
  )
  from candidate
$$;

-- Validate legacy evidence before replacing any outcome validator/trigger or
-- validating outcome constraints. The same deterministic function protects
-- replay, direct-table writes, and the grading RPC.
do $$
declare
  invalid_outcome record;
begin
  select id, forecast_id, evidence_url into invalid_outcome
  from public.hermes_forecast_outcomes
  where evidence_url is not null
    and not public.hermes_is_valid_evidence_url(evidence_url)
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce evidence URL FQDN for outcome % (forecast %): existing evidence_url % is not a valid credential-free HTTPS URL with a multi-label DNS FQDN; the row was preserved. Remediate explicitly before replaying this migration.',
      invalid_outcome.id, invalid_outcome.forecast_id, invalid_outcome.evidence_url
      using errcode = '23514';
  end if;
end $$;

-- Outcome creation time is immutable audit provenance.
do $$
declare
  invalid_outcome record;
begin
  select id, forecast_id, created_at into invalid_outcome
  from public.hermes_forecast_outcomes
  where created_at is null
     or not pg_catalog.isfinite(created_at)
     or created_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce forecast outcome audit chronology for outcome % (forecast %): created_at % must be non-null, finite, and not later than statement_timestamp(); remediate this row explicitly before replaying this migration.',
      invalid_outcome.id, invalid_outcome.forecast_id, invalid_outcome.created_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecast_outcomes alter column created_at set not null;
alter table public.hermes_forecast_outcomes drop constraint if exists hermes_forecast_outcomes_created_at_finite_check;
alter table public.hermes_forecast_outcomes
  add constraint hermes_forecast_outcomes_created_at_finite_check
  check (pg_catalog.isfinite(created_at)) not valid;
alter table public.hermes_forecast_outcomes validate constraint hermes_forecast_outcomes_created_at_finite_check;

-- Existing outcome chronology cannot be repaired without inventing an
-- observation instant. Preserve and stop before replacing or validating the
-- direct-table boundary so a live upgrade fails closed.
do $$
declare
  invalid_outcome record;
begin
  select id, forecast_id, observed_at into invalid_outcome
  from public.hermes_forecast_outcomes
  where observed_at is null
     or not pg_catalog.isfinite(observed_at)
     or observed_at > pg_catalog.statement_timestamp()
  order by id
  limit 1;

  if found then
    raise exception 'Cannot enforce outcome observation chronology for outcome % (forecast %): null or non-finite or future observed_at %; remediate explicitly before replaying this migration.',
      invalid_outcome.id, invalid_outcome.forecast_id, invalid_outcome.observed_at
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecast_outcomes alter column observed_at set not null;
alter table public.hermes_forecast_outcomes
  drop constraint if exists hermes_forecast_outcomes_observed_at_valid_check;
alter table public.hermes_forecast_outcomes
  add constraint hermes_forecast_outcomes_observed_at_valid_check
  check (pg_catalog.isfinite(observed_at)) not valid;
alter table public.hermes_forecast_outcomes
  validate constraint hermes_forecast_outcomes_observed_at_valid_check;

-- PostgreSQL numeric accepts NaN and signed Infinity. Preserve and stop on any
-- legacy occurrence; never coerce a non-finite forecast or realized value.
do $$
begin
  if exists (
    select 1 from public.hermes_forecasts
    where predicted_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       or benchmark_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ) then
    raise exception 'Cannot enforce finite forecast numerics: existing rows contain a non-finite forecast numeric; remediate explicitly before replaying this migration.'
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_predicted_value_finite_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_predicted_value_finite_check
  check (predicted_value not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
alter table public.hermes_forecasts drop constraint if exists hermes_forecasts_benchmark_value_finite_check;
alter table public.hermes_forecasts
  add constraint hermes_forecasts_benchmark_value_finite_check
  check (benchmark_value is null or benchmark_value not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));

do $$
begin
  if exists (
    select 1 from public.hermes_forecast_outcomes
    where actual_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       or qqq_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ) then
    raise exception 'Cannot enforce finite outcome numerics: existing rows contain a non-finite outcome numeric; remediate explicitly before replaying this migration.'
      using errcode = '23514';
  end if;
end $$;
alter table public.hermes_forecast_outcomes drop constraint if exists hermes_forecast_outcomes_actual_value_finite_check;
alter table public.hermes_forecast_outcomes
  add constraint hermes_forecast_outcomes_actual_value_finite_check
  check (actual_value not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
alter table public.hermes_forecast_outcomes drop constraint if exists hermes_forecast_outcomes_qqq_value_finite_check;
alter table public.hermes_forecast_outcomes
  add constraint hermes_forecast_outcomes_qqq_value_finite_check
  check (qqq_value is null or qqq_value not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));

-- Converting legacy text timestamps can collapse offset-equivalent values into
-- one logical identity. Reconcile only exact immutable forecast duplicates and
-- exact duplicate observations. Anything else needs an explicit human choice,
-- so fail closed before deleting or remapping any history.
do $$
declare
  conflict record;
begin
  with ranked as (
    select
      forecast.*,
      count(*) over identity as identity_count,
      first_value(forecast.id) over (
        identity order by forecast.id::text
      ) as survivor_id
    from public.hermes_forecasts forecast
    window identity as (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version
    )
  )
  select candidate.id as candidate_id, candidate.stable_key as candidate_stable_key,
         survivor.id as survivor_id, survivor.stable_key as survivor_stable_key,
         candidate.ticker, candidate.scenario, candidate.forecast_type,
         candidate.unit, candidate.model_version
  into conflict
  from ranked candidate
  join public.hermes_forecasts survivor on survivor.id = candidate.survivor_id
  where candidate.identity_count > 1
    and candidate.id <> candidate.survivor_id
    and row(candidate.stable_key, candidate.horizon_date, candidate.probability,
            candidate.predicted_value, candidate.benchmark_symbol,
            candidate.benchmark_value, candidate.agent_run_id,
            candidate.prompt_id, candidate.prompt_version, candidate.as_of,
            candidate.status, candidate.metadata, candidate.created_at, candidate.updated_at)
        is distinct from
        row(survivor.stable_key, survivor.horizon_date, survivor.probability,
            survivor.predicted_value, survivor.benchmark_symbol,
            survivor.benchmark_value, survivor.agent_run_id,
            survivor.prompt_id, survivor.prompt_version, survivor.as_of,
            survivor.status, survivor.metadata, survivor.created_at, survivor.updated_at)
  order by candidate.ticker, candidate.scenario, candidate.forecast_type,
           candidate.unit, candidate.model_version, candidate.id::text
  limit 1;

  if found then
    raise exception 'Cannot canonicalize equivalent-instant forecasts % (stable_key %) and % (stable_key %) for ticker %, scenario %, type %, unit %, model_version %: conflicting immutable forecast content or provenance, including prompt provenance; remediate these rows explicitly before replaying this migration.',
      conflict.survivor_id, conflict.survivor_stable_key,
      conflict.candidate_id, conflict.candidate_stable_key,
      conflict.ticker, conflict.scenario, conflict.forecast_type,
      conflict.unit, conflict.model_version
      using errcode = '55000';
  end if;
end $$;

do $$
declare
  conflict record;
begin
  with duplicate_forecasts as (
    select forecast.*,
           count(*) over identity as identity_count
    from public.hermes_forecasts forecast
    window identity as (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version
    )
  ), ranked_outcomes as (
    select
      forecast.ticker, forecast.scenario, forecast.forecast_type,
      forecast.unit, forecast.model_version, outcome.*,
      count(*) over observation as observation_count,
      first_value(outcome.id) over (
        observation order by outcome.id::text
      ) as survivor_outcome_id
    from duplicate_forecasts forecast
    join public.hermes_forecast_outcomes outcome on outcome.forecast_id = forecast.id
    where forecast.identity_count > 1
    window observation as (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version, outcome.observed_at
    )
  )
  select candidate.ticker, candidate.scenario, candidate.forecast_type,
         candidate.unit, candidate.model_version, candidate.observed_at,
         survivor.id as survivor_outcome_id, candidate.id as candidate_outcome_id
  into conflict
  from ranked_outcomes candidate
  join public.hermes_forecast_outcomes survivor
    on survivor.id = candidate.survivor_outcome_id
  where candidate.observation_count > 1
    and candidate.id <> candidate.survivor_outcome_id
    and row(candidate.actual_value, candidate.qqq_value,
            candidate.outcome_occurred, candidate.evidence_url,
            candidate.notes, candidate.metadata, candidate.created_at)
        is distinct from
        row(survivor.actual_value, survivor.qqq_value,
            survivor.outcome_occurred, survivor.evidence_url,
            survivor.notes, survivor.metadata, survivor.created_at)
  order by candidate.ticker, candidate.scenario, candidate.forecast_type,
           candidate.unit, candidate.model_version, candidate.observed_at,
           candidate.id::text
  limit 1;

  if found then
    raise exception 'Cannot canonicalize equivalent-instant forecasts for ticker %, scenario %, type %, unit %, model_version %: conflicting outcomes % and % at observed_at %; remediate these rows explicitly before replaying this migration.',
      conflict.ticker, conflict.scenario, conflict.forecast_type,
      conflict.unit, conflict.model_version, conflict.survivor_outcome_id,
      conflict.candidate_outcome_id, conflict.observed_at
      using errcode = '55000';
  end if;
end $$;

-- An earlier application of this migration may already have installed the
-- append-only trigger. Validation above runs while it is still active; remove
-- it only for the deterministic repair, then reinstall it below.
drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;

with duplicate_forecasts as (
  select forecast.*,
         count(*) over identity as identity_count
  from public.hermes_forecasts forecast
  window identity as (
    partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                 forecast.unit, forecast.model_version
  )
), ranked_outcomes as (
  select
    outcome.id,
    row_number() over (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version, outcome.observed_at
      order by outcome.id::text
    ) as observation_rank
  from duplicate_forecasts forecast
  join public.hermes_forecast_outcomes outcome on outcome.forecast_id = forecast.id
  where forecast.identity_count > 1
)
delete from public.hermes_forecast_outcomes outcome
using ranked_outcomes duplicate
where outcome.id = duplicate.id
  and duplicate.observation_rank > 1;

with ranked as (
  select
    forecast.id,
    row_number() over (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version
      order by forecast.id::text
    ) as identity_rank,
    first_value(forecast.id) over (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version
      order by forecast.id::text
    ) as survivor_id
  from public.hermes_forecasts forecast
), duplicate_map as (
  select id as duplicate_id, survivor_id
  from ranked
  where identity_rank > 1
)
update public.hermes_forecast_outcomes outcome
set forecast_id = duplicate.survivor_id
from duplicate_map duplicate
where outcome.forecast_id = duplicate.duplicate_id;

with ranked as (
  select
    forecast.id,
    row_number() over (
      partition by forecast.ticker, forecast.scenario, forecast.forecast_type,
                   forecast.unit, forecast.model_version
      order by forecast.id::text
    ) as identity_rank
  from public.hermes_forecasts forecast
)
delete from public.hermes_forecasts forecast
using ranked duplicate
where forecast.id = duplicate.id
  and duplicate.identity_rank > 1;

alter table public.hermes_forecasts
  add constraint hermes_forecasts_logical_identity_key
  unique (ticker, scenario, forecast_type, unit, model_version);

create or replace view public.hermes_forecast_evaluations
with (security_invoker = on) as
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
    when f.forecast_type <> 'annualized_return' or f.unit <> 'ratio' or o.qqq_value is null then null
    else o.actual_value - o.qqq_value
  end as alpha,
  case
    when f.forecast_type <> 'annualized_return' or f.unit <> 'ratio' or o.qqq_value is null or f.benchmark_value is null then null
    else (f.predicted_value > f.benchmark_value) = (o.actual_value > o.qqq_value)
  end as directional_hit,
  case
    when f.probability is null or o.outcome_occurred is null then null
    else power(f.probability - case when o.outcome_occurred then 1 else 0 end, 2)
  end as brier_component,
  f.agent_run_id
from public.hermes_forecasts f
left join lateral (
  select latest.* from public.hermes_forecast_outcomes latest
  where latest.forecast_id = f.id
  order by latest.observed_at desc
  limit 1
) o on true;

create or replace function public.hermes_validate_prompt_version_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.released_at is not null then
    raise exception 'Prompt release time is server-owned for %@%; callers must omit released_at.',
      new.prompt_id, new.version
      using errcode = '23514';
  end if;
  if new.created_at is null
     or not pg_catalog.isfinite(new.created_at)
     or new.created_at > pg_catalog.statement_timestamp() then
    raise exception 'Prompt %@% created_at must be finite and not later than statement_timestamp().',
      new.prompt_id, new.version
      using errcode = '23514';
  end if;
  if new.updated_at is null
     or not pg_catalog.isfinite(new.updated_at)
     or new.updated_at > pg_catalog.statement_timestamp() then
    raise exception 'Prompt %@% updated_at must be finite and not later than statement_timestamp().',
      new.prompt_id, new.version
      using errcode = '23514';
  end if;
  if new.created_at > new.updated_at then
    raise exception 'Prompt %@% created_at % must be less than or equal to updated_at % (hermes_prompt_versions_audit_chronology_check).',
      new.prompt_id, new.version, new.created_at, new.updated_at
      using errcode = '23514';
  end if;
  new.released_at := pg_catalog.statement_timestamp();
  return new;
end;
$$;

drop trigger if exists hermes_prompt_versions_validate_timestamps on public.hermes_prompt_versions;
drop trigger if exists hermes_prompt_versions_a_validate_timestamps on public.hermes_prompt_versions;
create trigger hermes_prompt_versions_a_validate_timestamps
before insert on public.hermes_prompt_versions
for each row execute function public.hermes_validate_prompt_version_timestamps();

create or replace function public.hermes_hash_prompt_body()
returns trigger
language plpgsql
set search_path = pg_catalog, extensions
as $$
begin
  new.content_sha256 := encode(digest(new.prompt_body, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists hermes_prompt_versions_hash_body on public.hermes_prompt_versions;
create trigger hermes_prompt_versions_hash_body
before insert or update of prompt_body on public.hermes_prompt_versions
for each row execute function public.hermes_hash_prompt_body();

-- Repair only the four explicitly enumerated complete seed tuples created by
-- the known legacy migrations, including the exact content-unavailable metadata
-- variant. Current complete tuples are no-ops. Any other immutable state at the
-- same identity is preserved and fails replay closed.
drop trigger if exists hermes_prompt_versions_protect on public.hermes_prompt_versions;
do $$
declare
  unexpected record;
begin
  with contracts(
    prompt_id, version, role, schema_version, legacy_body, expected_body,
    status, description, metadata, content_unavailable_metadata
  ) as (values
    ('daily-10-plus-10', '2.0.0', 'Hermes PM orchestrator', 'best-ideas-snapshot-v2',
      'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.',
      'Refresh current prices and source evidence, reconcile every active 10 + 10 company with its model, compare each conclusion with QQQ, preserve falsifiers, and publish one canonical ranked Top 10 plus Watchlist 10 snapshot. Do not authorize or place trades.',
      'active', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb),
    ('company-underwrite', '1.0.0', 'Company analyst', 'company-model-v1',
      'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.',
      'Produce a source-backed five-year company underwriting with explicit Bear, Base, and Bull revenue growth, margin, exit-multiple, target-price, and annualized-return assumptions. State probability, risks, monitoring tests, data limitations, and the QQQ opportunity-cost hurdle. Do not rewrite a forecast after it is registered.',
      'active', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb),
    ('risk-falsifier-review', '1.0.0', 'Risk and falsifier analyst', 'falsifier-review-v1',
      'Identify evidence that would invalidate the active thesis or make QQQ the better default.',
      'Review the active thesis and identify specific source-verifiable evidence that could invalidate each material assumption, impair the downside case, or make QQQ the better default. Keep falsifiers distinct from blended conviction scores.',
      'active', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb),
    ('forecast-outcome-grade', '0.1.0', 'Outcome evaluator', 'forecast-outcome-v1',
      'Close due forecasts against observed results and QQQ, preserving source evidence.',
      'After a forecast horizon has been reached, record the realized value, realized QQQ comparator when applicable, binary outcome when applicable, and a required evidence URL. Preserve the original forecast and close it atomically. Never grade a forecast early.',
      'draft', 'Close due forecasts against observed results and QQQ, preserving source evidence.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb)
  )
  select target.prompt_id, target.version
  into unexpected
  from public.hermes_prompt_versions target
  join contracts on contracts.prompt_id = target.prompt_id and contracts.version = target.version
  where row(target.role, target.schema_version, target.prompt_body, target.content_sha256,
            target.status, target.description, target.metadata) is distinct from
        row(contracts.role, contracts.schema_version, contracts.expected_body,
            encode(extensions.digest(contracts.expected_body, 'sha256'), 'hex'),
            contracts.status, contracts.description, contracts.metadata)
    and row(target.role, target.schema_version, target.prompt_body, target.content_sha256,
            target.status, target.description, target.metadata) is distinct from
        row(contracts.role, contracts.schema_version, contracts.legacy_body,
            encode(extensions.digest(contracts.legacy_body, 'sha256'), 'hex'),
            contracts.status, contracts.description, contracts.metadata)
    and row(target.role, target.schema_version, target.prompt_body, target.content_sha256,
            target.status, target.description, target.metadata) is distinct from
        row(contracts.role, contracts.schema_version, contracts.legacy_body,
            encode(extensions.digest(contracts.legacy_body, 'sha256'), 'hex'),
            contracts.status, contracts.description, contracts.content_unavailable_metadata)
  order by target.prompt_id, target.version
  limit 1;

  if found then
    raise exception 'Cannot repair unexpected prompt contract %@%; expected the complete current tuple or one explicitly known complete legacy tuple. The existing role, schema_version, body/hash, status, description, and metadata were preserved for remediation.',
      unexpected.prompt_id, unexpected.version
      using errcode = '55000';
  end if;
end $$;

update public.hermes_prompt_versions as target
set role = repaired.role,
    schema_version = repaired.schema_version,
    prompt_body = repaired.prompt_body,
    content_sha256 = encode(extensions.digest(repaired.prompt_body, 'sha256'), 'hex'),
    status = repaired.status,
    description = repaired.description,
    metadata = repaired.metadata
from (values
  ('daily-10-plus-10', '2.0.0', 'Hermes PM orchestrator', 'best-ideas-snapshot-v2', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', 'Refresh current prices and source evidence, reconcile every active 10 + 10 company with its model, compare each conclusion with QQQ, preserve falsifiers, and publish one canonical ranked Top 10 plus Watchlist 10 snapshot. Do not authorize or place trades.', 'active', 'Refresh price, evidence, models, QQQ line placement, and the canonical 10 + 10 snapshot.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb),
  ('company-underwrite', '1.0.0', 'Company analyst', 'company-model-v1', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', 'Produce a source-backed five-year company underwriting with explicit Bear, Base, and Bull revenue growth, margin, exit-multiple, target-price, and annualized-return assumptions. State probability, risks, monitoring tests, data limitations, and the QQQ opportunity-cost hurdle. Do not rewrite a forecast after it is registered.', 'active', 'Produce explicit five-year Bear, Base, and Bull operating assumptions with risks and monitoring items.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb),
  ('risk-falsifier-review', '1.0.0', 'Risk and falsifier analyst', 'falsifier-review-v1', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', 'Review the active thesis and identify specific source-verifiable evidence that could invalidate each material assumption, impair the downside case, or make QQQ the better default. Keep falsifiers distinct from blended conviction scores.', 'active', 'Identify evidence that would invalidate the active thesis or make QQQ the better default.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb),
  ('forecast-outcome-grade', '0.1.0', 'Outcome evaluator', 'forecast-outcome-v1', 'Close due forecasts against observed results and QQQ, preserving source evidence.', 'After a forecast horizon has been reached, record the realized value, realized QQQ comparator when applicable, binary outcome when applicable, and a required evidence URL. Preserve the original forecast and close it atomically. Never grade a forecast early.', 'draft', 'Close due forecasts against observed results and QQQ, preserving source evidence.', '{"source":"north-star-seed"}'::jsonb, '{"source":"north-star-seed","contentStored":false}'::jsonb)
) as repaired(prompt_id, version, role, schema_version, legacy_body, prompt_body, status, description, metadata, content_unavailable_metadata)
where target.prompt_id = repaired.prompt_id
  and target.version = repaired.version
  and target.role = repaired.role
  and target.schema_version = repaired.schema_version
  and target.prompt_body = repaired.legacy_body
  and target.content_sha256 = encode(extensions.digest(repaired.legacy_body, 'sha256'), 'hex')
  and target.status = repaired.status
  and target.description is not distinct from repaired.description
  and target.metadata in (repaired.metadata, repaired.content_unavailable_metadata);

alter table public.hermes_prompt_versions
  add constraint hermes_prompt_versions_content_hash_check
  check (content_sha256 = encode(extensions.digest(prompt_body, 'sha256'), 'hex'));

create or replace function public.hermes_protect_prompt_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Prompt versions are immutable; publish a new version instead.' using errcode = '55000';
end;
$$;

create trigger hermes_prompt_versions_protect
before update or delete on public.hermes_prompt_versions
for each row execute function public.hermes_protect_prompt_version();

create or replace function public.hermes_protect_agent_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Agent run provenance is immutable.' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.status in ('succeeded', 'failed', 'cancelled') then
    if new is distinct from old then
      raise exception 'Completed agent runs are immutable.' using errcode = '55000';
    end if;
    -- Cancel an exact physical no-op before the generic updated_at trigger can
    -- turn it into a terminal audit mutation.
    return null;
  end if;
  if new.created_at is null
     or not pg_catalog.isfinite(new.created_at)
     or new.created_at > pg_catalog.statement_timestamp() then
    raise exception 'Agent run % created_at must be finite and not later than statement_timestamp().', new.id
      using errcode = '23514';
  end if;
  if new.updated_at is null
     or not pg_catalog.isfinite(new.updated_at)
     or new.updated_at > pg_catalog.statement_timestamp() then
    raise exception 'Agent run % updated_at must be finite and not later than statement_timestamp().', new.id
      using errcode = '23514';
  end if;
  if new.created_at > new.updated_at then
    raise exception 'Agent run % created_at % must be less than or equal to updated_at % (hermes_agent_runs_audit_chronology_check).',
      new.id, new.created_at, new.updated_at
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('queued', 'running') then
      raise exception 'Agent runs must be created queued or running.' using errcode = '23514';
    end if;
    if new.completed_at is not null then
      raise exception 'New agent runs cannot have completed_at.' using errcode = '23514';
    end if;
    if new.started_at is null
       or not pg_catalog.isfinite(new.started_at)
       or new.started_at > pg_catalog.statement_timestamp() then
      raise exception 'New agent runs cannot use a non-finite or future started_at.' using errcode = '22007';
    end if;
    return new;
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
  if new.completed_at is not null and (
    not pg_catalog.isfinite(new.completed_at)
    or new.completed_at < old.started_at
    or new.completed_at > pg_catalog.statement_timestamp()
  ) then
    raise exception 'Terminal agent runs require a valid finite completion timestamp at or after started_at and not in the future.' using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists hermes_agent_runs_protect on public.hermes_agent_runs;
create trigger hermes_agent_runs_protect
before insert or update or delete on public.hermes_agent_runs
for each row execute function public.hermes_protect_agent_run();

create or replace function public.hermes_protect_forecast_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  run_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Forecast records are immutable.' using errcode = '55000';
  end if;

  if new.created_at is null
     or not pg_catalog.isfinite(new.created_at)
     or new.created_at > pg_catalog.statement_timestamp() then
    raise exception 'Forecast % (stable_key %) created_at must be finite and not later than statement_timestamp().',
      new.id, new.stable_key
      using errcode = '23514';
  end if;
  if new.updated_at is null
     or not pg_catalog.isfinite(new.updated_at)
     or new.updated_at > pg_catalog.statement_timestamp() then
    raise exception 'Forecast % (stable_key %) updated_at must be finite and not later than statement_timestamp().',
      new.id, new.stable_key
      using errcode = '23514';
  end if;
  if new.created_at > new.updated_at then
    raise exception 'Forecast % (stable_key %) created_at % must be less than or equal to updated_at % (hermes_forecasts_audit_chronology_check).',
      new.id, new.stable_key, new.created_at, new.updated_at
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'Forecasts must be created open.' using errcode = '23514';
    end if;
    if new.agent_run_id is not null then
      select status into run_status
      from public.hermes_agent_runs
      where id = new.agent_run_id
      for share;
      if not found then
        raise exception 'Agent run % was not found.', new.agent_run_id using errcode = 'P0002';
      end if;
      if run_status not in ('queued', 'running') then
        raise exception 'Agent run % is % and cannot register forecasts.', new.agent_run_id, run_status using errcode = '55000';
      end if;
    end if;
    new.as_of := pg_catalog.statement_timestamp();
    if not pg_catalog.isfinite(new.model_version) then
      raise exception 'Forecast % (stable_key %) model_version must be finite (hermes_forecasts_model_version_finite_check).',
        new.id, new.stable_key
        using errcode = '23514';
    end if;
    if pg_catalog.isfinite(new.model_version)
       and new.model_version > new.as_of then
      raise exception 'Forecast % (stable_key %) cannot use a future model_version: model_version % must be less than or equal to as_of % (hermes_forecasts_model_version_as_of_check).',
        new.id, new.stable_key, new.model_version, new.as_of
        using errcode = '22007';
    end if;
    if new.horizon_date <= new.as_of::date then
      raise exception 'Forecast horizon must be after registration date.' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status <> 'open' or new.status <> 'graded' or
     row(new.id, new.stable_key, new.ticker, new.scenario, new.forecast_type,
         new.horizon_date, new.probability, new.predicted_value, new.unit,
         new.benchmark_symbol, new.benchmark_value, new.agent_run_id,
         new.prompt_id, new.prompt_version, new.model_version, new.as_of, new.metadata, new.created_at)
       is distinct from
     row(old.id, old.stable_key, old.ticker, old.scenario, old.forecast_type,
         old.horizon_date, old.probability, old.predicted_value, old.unit,
         old.benchmark_symbol, old.benchmark_value, old.agent_run_id,
         old.prompt_id, old.prompt_version, old.model_version, old.as_of, old.metadata, old.created_at) then
    raise exception 'Forecast records are immutable except for atomic open-to-graded closure.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists hermes_forecasts_protect_immutability on public.hermes_forecasts;
create trigger hermes_forecasts_protect_immutability
before insert or update or delete on public.hermes_forecasts
for each row execute function public.hermes_protect_forecast_immutability();

create or replace function public.hermes_is_valid_evidence_url(value text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  with candidate as (
    select pg_catalog.btrim(value) as normalized
  )
  select coalesce(
    normalized ~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z])([/?#][^[:space:]]*)?$'
    and pg_catalog.lower(pg_catalog.substring(pg_catalog.lower(normalized), '^https://([^/?#]+)'))
        !~ '(^|[.])(localhost|local|test|invalid|example|onion|internal|lan|home|localdomain)$',
    false
  )
  from candidate
$$;

alter table public.hermes_forecast_outcomes
  drop constraint if exists hermes_forecast_outcomes_evidence_url_fqdn_check;
alter table public.hermes_forecast_outcomes
  add constraint hermes_forecast_outcomes_evidence_url_fqdn_check
  check (public.hermes_is_valid_evidence_url(evidence_url)) not valid;
alter table public.hermes_forecast_outcomes
  validate constraint hermes_forecast_outcomes_evidence_url_fqdn_check;

create or replace function public.hermes_validate_forecast_outcome_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.evidence_url := pg_catalog.btrim(new.evidence_url);
  if not public.hermes_is_valid_evidence_url(new.evidence_url) then
    raise exception 'Outcome evidence URL must be a valid credential-free HTTPS URL with a fully qualified host.' using errcode = '23514';
  end if;
  if new.observed_at is null
     or not pg_catalog.isfinite(new.observed_at)
     or new.observed_at > pg_catalog.statement_timestamp() then
    raise exception 'Forecast outcome % observed_at must be finite and not later than statement_timestamp() (hermes_forecast_outcomes_observed_at_valid_check).', new.id
      using errcode = '23514';
  end if;
  if new.created_at is null
     or not pg_catalog.isfinite(new.created_at)
     or new.created_at > pg_catalog.statement_timestamp() then
    raise exception 'Forecast outcome % (forecast %) created_at must be finite and not later than statement_timestamp().',
      new.id, new.forecast_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists hermes_forecast_outcomes_validate_insert on public.hermes_forecast_outcomes;
create trigger hermes_forecast_outcomes_validate_insert
before insert on public.hermes_forecast_outcomes
for each row execute function public.hermes_validate_forecast_outcome_insert();

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
set search_path = ''
as $$
declare
  target public.hermes_forecasts%rowtype;
  saved public.hermes_forecast_outcomes%rowtype;
begin
  if p_actual_value is null
     or p_actual_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     or p_qqq_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Outcome actual_value and nullable qqq_value must be finite numeric values.' using errcode = '22023';
  end if;
  if not public.hermes_is_valid_evidence_url(p_evidence_url) then
    raise exception 'Outcome evidence URL must be a valid credential-free HTTPS URL with a fully qualified host.' using errcode = '23514';
  end if;
  if p_observed_at is null
     or not pg_catalog.isfinite(p_observed_at)
     or p_observed_at > pg_catalog.statement_timestamp() then
    raise exception 'Outcome observed_at must be finite and not in the future; future observed_at values are prohibited.' using errcode = '22007';
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
    pg_catalog.btrim(p_evidence_url), p_notes, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into saved;

  update public.hermes_forecasts set status = 'graded' where id = p_forecast_id;
  return saved;
end;
$$;

drop function if exists public.hermes_replace_underwriting_graph(uuid, jsonb, jsonb);
create or replace function public.hermes_replace_underwriting_graph(
  p_agent_run_id uuid,
  p_nodes jsonb,
  p_edges jsonb,
  p_forecasts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_node_count integer := 0;
  resolved_node_count integer := 0;
  saved_edge_count integer := 0;
  saved_forecast_count integer := 0;
  resolved_forecast_count integer := 0;
  run_status text;
  invalid_forecast_key text;
  invalid_forecast_model_version timestamptz;
begin
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_array_length(p_nodes) = 0 then
    raise exception 'Graph replacement requires at least one node.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_edges) <> 'array' then
    raise exception 'Graph replacement edges must be an array.' using errcode = '22023';
  end if;
  -- NULL is an explicit graph-only replay sentinel used by the underwriting
  -- endpoint. An array means this call atomically owns the forecast payload.
  if p_forecasts is not null and jsonb_typeof(p_forecasts) <> 'array' then
    raise exception 'Graph replacement forecasts must be an array.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_nodes) as n(prompt_id text, prompt_version text)
    where (n.prompt_id is null) <> (n.prompt_version is null)
       or (n.prompt_id is not null and (
         pg_catalog.btrim(n.prompt_id) = '' or pg_catalog.btrim(n.prompt_version) = ''
       ))
  ) then
    raise exception 'Graph node prompt provenance must be a complete non-empty pair or null.' using errcode = '23514';
  end if;
  if p_forecasts is not null and exists (
    select 1
    from jsonb_to_recordset(p_forecasts) as forecast(prompt_id text, prompt_version text)
    where (forecast.prompt_id is null) <> (forecast.prompt_version is null)
       or (forecast.prompt_id is not null and (
         pg_catalog.btrim(forecast.prompt_id) = '' or pg_catalog.btrim(forecast.prompt_version) = ''
       ))
  ) then
    raise exception 'Forecast prompt provenance must be a complete non-empty pair or null.' using errcode = '23514';
  end if;
  if p_forecasts is not null and exists (
    select 1
    from jsonb_to_recordset(p_forecasts) as forecast(predicted_value numeric, benchmark_value numeric)
    where forecast.predicted_value is null
       or forecast.predicted_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       or forecast.benchmark_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ) then
    raise exception 'Forecast predicted_value and nullable benchmark_value must be finite numeric values.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_edges) as edge(from_key text, to_key text, relationship text)
    group by edge.from_key, edge.to_key, edge.relationship
    having count(*) > 1
  ) then
    raise exception 'Graph edges must be logically unique within a batch.' using errcode = '22023';
  end if;
  if p_forecasts is not null and exists (
    select 1
    from jsonb_to_recordset(p_forecasts) as forecast(
      ticker text, scenario text, forecast_type text, unit text, model_version timestamptz
    )
    group by forecast.ticker, forecast.scenario, forecast.forecast_type,
             coalesce(forecast.unit, 'ratio'), forecast.model_version
    having count(*) > 1
  ) then
    raise exception 'Forecasts must be logically unique within a batch by ticker, scenario, forecast_type, unit, and model_version.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_nodes) as n(stable_key text, as_of timestamptz)
    group by n.stable_key, n.as_of
    having count(*) > 1
  ) then
    raise exception 'Graph nodes must be logically unique within a batch.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_nodes) as n(stable_key text, as_of timestamptz)
    where n.as_of is null
       or not pg_catalog.isfinite(n.as_of)
       or n.as_of > pg_catalog.statement_timestamp()
  ) then
    raise exception 'Graph nodes cannot use a non-finite or future as_of.' using errcode = '22007';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_nodes) as n(
      as_of timestamptz, valid_until timestamptz
    )
    where n.valid_until is not null
      and (
        not pg_catalog.isfinite(n.valid_until)
        or n.valid_until < n.as_of
      )
  ) then
    raise exception 'Graph node valid_until must be finite and greater than or equal to as_of.' using errcode = '22007';
  end if;
  if p_forecasts is not null and exists (
    select 1
    from jsonb_to_recordset(p_forecasts) as forecast(stable_key text, model_version timestamptz)
    where pg_catalog.isfinite(forecast.model_version)
      and forecast.model_version > pg_catalog.statement_timestamp()
  ) then
    select forecast.stable_key, forecast.model_version
    into invalid_forecast_key, invalid_forecast_model_version
    from jsonb_to_recordset(p_forecasts) as forecast(stable_key text, model_version timestamptz)
    where pg_catalog.isfinite(forecast.model_version)
      and forecast.model_version > pg_catalog.statement_timestamp()
    order by forecast.stable_key, forecast.model_version
    limit 1;
    raise exception 'Forecast % cannot use a future model_version: model_version % must be less than or equal to registration as_of % (hermes_forecasts_model_version_as_of_check).',
      invalid_forecast_key, invalid_forecast_model_version, pg_catalog.statement_timestamp()
      using errcode = '22007';
  end if;

  select status into run_status
  from public.hermes_agent_runs
  where id = p_agent_run_id
  for update;

  if not found then
    raise exception 'Agent run % was not found.', p_agent_run_id using errcode = 'P0002';
  end if;
  if run_status in ('failed', 'cancelled') then
    raise exception 'Agent run % is % and cannot persist underwriting output.', p_agent_run_id, run_status using errcode = '55000';
  end if;
  if run_status = 'queued' then
    update public.hermes_agent_runs set status = 'running' where id = p_agent_run_id;
    run_status := 'running';
  end if;

  -- Serialize every submitted logical node identity in canonical order. This
  -- closes the check/insert race between different agent runs without taking a
  -- table-wide lock; extract(epoch) keeps equivalent offset timestamps keyed
  -- to the same transaction-scoped advisory lock across session time zones.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      locked_node.stable_key || pg_catalog.chr(31) || extract(epoch from locked_node.as_of)::text,
      0
    )
  )
  from (
    select n.stable_key, n.as_of
    from jsonb_to_recordset(p_nodes) as n(stable_key text, as_of timestamptz)
    order by n.stable_key, n.as_of
  ) as locked_node;

  -- Serialize every submitted logical forecast identity in canonical order
  -- before any ownership/conflict check. A direct insert must either precede
  -- this lock and be observed below or wait until this transaction completes.
  if p_forecasts is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        locked_forecast.ticker || pg_catalog.chr(31)
        || locked_forecast.scenario || pg_catalog.chr(31)
        || locked_forecast.forecast_type || pg_catalog.chr(31)
        || locked_forecast.unit || pg_catalog.chr(31)
        || extract(epoch from locked_forecast.model_version)::text,
        0
      )
    )
    from (
      select forecast.ticker, forecast.scenario, forecast.forecast_type,
             coalesce(forecast.unit, 'ratio') as unit, forecast.model_version
      from jsonb_to_recordset(p_forecasts) as forecast(
        ticker text, scenario text, forecast_type text, unit text, model_version timestamptz
      )
      order by forecast.ticker, forecast.scenario, forecast.forecast_type,
               coalesce(forecast.unit, 'ratio'), forecast.model_version
    ) as locked_forecast;
  end if;

  -- A succeeded run is append-closed. Permit only a byte-for-byte logical
  -- replay of every node, edge, and forecast already attributed to the run.
  if run_status = 'succeeded' then
    if (select count(*) from public.hermes_underwriting_nodes where agent_run_id = p_agent_run_id) <> jsonb_array_length(p_nodes)
       or exists (
         select 1
         from jsonb_to_recordset(p_nodes) as n(
           stable_key text, node_type text, ticker text, title text, body text,
           status text, confidence numeric, as_of timestamptz, valid_until timestamptz,
           prompt_id text, prompt_version text, payload jsonb
         )
         where not exists (
           select 1 from public.hermes_underwriting_nodes existing
           where existing.agent_run_id = p_agent_run_id
             and existing.stable_key = n.stable_key and existing.as_of = n.as_of
             and row(existing.node_type, existing.ticker, existing.title, existing.body,
                     existing.status, existing.confidence, existing.valid_until,
                     existing.prompt_id, existing.prompt_version, existing.payload)
                 is not distinct from
                 row(n.node_type, n.ticker, n.title, n.body, coalesce(n.status, 'active'),
                     n.confidence, n.valid_until, n.prompt_id, n.prompt_version,
                     coalesce(n.payload, '{}'::jsonb))
         )
       )
       or exists (
         select 1 from public.hermes_underwriting_nodes existing
         where existing.agent_run_id = p_agent_run_id
           and not exists (
             select 1
             from jsonb_to_recordset(p_nodes) as n(
               stable_key text, node_type text, ticker text, title text, body text,
               status text, confidence numeric, as_of timestamptz, valid_until timestamptz,
               prompt_id text, prompt_version text, payload jsonb
             )
             where existing.stable_key = n.stable_key and existing.as_of = n.as_of
               and row(existing.node_type, existing.ticker, existing.title, existing.body,
                       existing.status, existing.confidence, existing.valid_until,
                       existing.prompt_id, existing.prompt_version, existing.payload)
                   is not distinct from
                   row(n.node_type, n.ticker, n.title, n.body, coalesce(n.status, 'active'),
                       n.confidence, n.valid_until, n.prompt_id, n.prompt_version,
                       coalesce(n.payload, '{}'::jsonb))
           )
       ) then
      raise exception 'Terminal agent run replay must exactly match persisted nodes.' using errcode = '55000';
    end if;

    if (select count(*) from public.hermes_underwriting_edges where agent_run_id = p_agent_run_id) <> jsonb_array_length(p_edges)
       or exists (
         select 1
         from jsonb_to_recordset(p_edges) as edge(
           from_key text, to_key text, relationship text, strength numeric, note text, metadata jsonb
         )
         where not exists (
           select 1
           from jsonb_to_recordset(p_nodes) as from_input(stable_key text, as_of timestamptz)
           join public.hermes_underwriting_nodes from_node
             on from_node.stable_key = from_input.stable_key and from_node.as_of = from_input.as_of
           join jsonb_to_recordset(p_nodes) as to_input(stable_key text, as_of timestamptz)
             on to_input.stable_key = edge.to_key
           join public.hermes_underwriting_nodes to_node
             on to_node.stable_key = to_input.stable_key and to_node.as_of = to_input.as_of
           join public.hermes_underwriting_edges existing
             on existing.from_node_id = from_node.id and existing.to_node_id = to_node.id
            and existing.relationship = edge.relationship and existing.agent_run_id = p_agent_run_id
           where from_input.stable_key = edge.from_key
             and row(existing.strength, existing.note, existing.metadata)
                 is not distinct from row(edge.strength, edge.note, coalesce(edge.metadata, '{}'::jsonb))
         )
       )
       or exists (
         select 1
         from public.hermes_underwriting_edges existing
         join public.hermes_underwriting_nodes from_node on from_node.id = existing.from_node_id
         join public.hermes_underwriting_nodes to_node on to_node.id = existing.to_node_id
         where existing.agent_run_id = p_agent_run_id
           and not exists (
             select 1
             from jsonb_to_recordset(p_edges) as edge(
               from_key text, to_key text, relationship text, strength numeric, note text, metadata jsonb
             )
             where edge.from_key = from_node.stable_key and edge.to_key = to_node.stable_key
               and edge.relationship = existing.relationship
               and row(edge.strength, edge.note, coalesce(edge.metadata, '{}'::jsonb))
                   is not distinct from row(existing.strength, existing.note, existing.metadata)
           )
       ) then
      raise exception 'Terminal agent run replay must exactly match persisted edges.' using errcode = '55000';
    end if;

    if p_forecasts is not null and (
       (select count(*) from public.hermes_forecasts where agent_run_id = p_agent_run_id) <> jsonb_array_length(p_forecasts)
       or exists (
         select 1
         from jsonb_to_recordset(p_forecasts) as forecast(
           stable_key text, ticker text, scenario text, forecast_type text,
           horizon_date date, probability numeric, predicted_value numeric, unit text,
           benchmark_symbol text, benchmark_value numeric, model_version timestamptz,
           prompt_id text, prompt_version text, metadata jsonb
         )
         where not exists (
           select 1 from public.hermes_forecasts existing
           where existing.agent_run_id = p_agent_run_id
             and existing.ticker = forecast.ticker and existing.scenario = forecast.scenario
             and existing.forecast_type = forecast.forecast_type
             and existing.unit = coalesce(forecast.unit, 'ratio')
             and existing.model_version = forecast.model_version
             and row(existing.stable_key, existing.horizon_date, existing.probability,
                    existing.predicted_value, existing.benchmark_symbol, existing.benchmark_value,
                    existing.prompt_id, existing.prompt_version, existing.metadata)
                is not distinct from
                row(forecast.stable_key, forecast.horizon_date, forecast.probability,
                    forecast.predicted_value, coalesce(forecast.benchmark_symbol, 'QQQ'), forecast.benchmark_value,
                    forecast.prompt_id, forecast.prompt_version, coalesce(forecast.metadata, '{}'::jsonb))
         )
       )
       or exists (
         select 1 from public.hermes_forecasts existing
         where existing.agent_run_id = p_agent_run_id
           and not exists (
             select 1
             from jsonb_to_recordset(p_forecasts) as forecast(
               stable_key text, ticker text, scenario text, forecast_type text,
               horizon_date date, probability numeric, predicted_value numeric, unit text,
               benchmark_symbol text, benchmark_value numeric, model_version timestamptz,
           prompt_id text, prompt_version text, metadata jsonb
             )
             where existing.ticker = forecast.ticker and existing.scenario = forecast.scenario
               and existing.forecast_type = forecast.forecast_type
               and existing.unit = coalesce(forecast.unit, 'ratio')
               and existing.model_version = forecast.model_version
               and row(existing.stable_key, existing.horizon_date, existing.probability,
                    existing.predicted_value, existing.benchmark_symbol, existing.benchmark_value,
                    existing.prompt_id, existing.prompt_version, existing.metadata)
                is not distinct from
                row(forecast.stable_key, forecast.horizon_date, forecast.probability,
                    forecast.predicted_value, coalesce(forecast.benchmark_symbol, 'QQQ'), forecast.benchmark_value,
                    forecast.prompt_id, forecast.prompt_version, coalesce(forecast.metadata, '{}'::jsonb))
           )
       )
    ) then
      raise exception 'Terminal agent run replay must exactly match persisted forecasts.' using errcode = '55000';
    end if;

    return jsonb_build_object(
      'nodes', jsonb_array_length(p_nodes),
      'edges', jsonb_array_length(p_edges),
      'forecasts_inserted', 0
    );
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_nodes) as n(
      stable_key text, node_type text, ticker text, title text, body text,
      status text, confidence numeric, as_of timestamptz, valid_until timestamptz,
      prompt_id text, prompt_version text, payload jsonb
    )
    join public.hermes_underwriting_nodes existing
      on existing.stable_key = n.stable_key and existing.as_of = n.as_of
    where row(existing.node_type, existing.ticker, existing.title, existing.body,
              existing.status, existing.confidence, existing.valid_until,
              existing.agent_run_id, existing.prompt_id, existing.prompt_version, existing.payload)
      is distinct from
          row(n.node_type, n.ticker, n.title, n.body, coalesce(n.status, 'active'),
              n.confidence, n.valid_until, p_agent_run_id, n.prompt_id, n.prompt_version,
              coalesce(n.payload, '{}'::jsonb))
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
    as_of, valid_until, agent_run_id, prompt_id, prompt_version, payload
  )
  select
    n.stable_key, n.node_type, n.ticker, n.title, n.body,
    coalesce(n.status, 'active'), n.confidence, n.as_of, n.valid_until,
    p_agent_run_id, n.prompt_id, n.prompt_version, coalesce(n.payload, '{}'::jsonb)
  from jsonb_to_recordset(p_nodes) as n(
    stable_key text, node_type text, ticker text, title text, body text,
    status text, confidence numeric, as_of timestamptz, valid_until timestamptz,
    prompt_id text, prompt_version text, payload jsonb
  )
  on conflict (stable_key, as_of) do nothing;

  select count(*), count(*) filter (where existing.agent_run_id = p_agent_run_id)
  into resolved_node_count, saved_node_count
  from jsonb_to_recordset(p_nodes) as n(stable_key text, as_of timestamptz)
  join public.hermes_underwriting_nodes existing
    on existing.stable_key = n.stable_key and existing.as_of = n.as_of;

  if resolved_node_count <> jsonb_array_length(p_nodes)
     or saved_node_count <> jsonb_array_length(p_nodes) then
    raise exception 'Every submitted underwriting node must belong to the submitting agent run before edges are persisted.' using errcode = '55000';
  end if;

  if p_forecasts is not null and exists (
    select 1
    from jsonb_to_recordset(p_forecasts) as forecast(
      stable_key text, ticker text, scenario text, forecast_type text,
      horizon_date date, probability numeric, predicted_value numeric, unit text,
      benchmark_symbol text, benchmark_value numeric, model_version timestamptz,
           prompt_id text, prompt_version text, metadata jsonb
    )
    join public.hermes_forecasts existing
      on existing.ticker = forecast.ticker and existing.scenario = forecast.scenario
      and existing.forecast_type = forecast.forecast_type
      and existing.unit = coalesce(forecast.unit, 'ratio')
      and existing.model_version = forecast.model_version
    where row(existing.stable_key, existing.horizon_date, existing.probability,
              existing.predicted_value, existing.benchmark_symbol, existing.benchmark_value,
              existing.agent_run_id, existing.prompt_id, existing.prompt_version, existing.metadata)
      is distinct from
          row(forecast.stable_key, forecast.horizon_date, forecast.probability,
              forecast.predicted_value, coalesce(forecast.benchmark_symbol, 'QQQ'), forecast.benchmark_value,
              p_agent_run_id, forecast.prompt_id, forecast.prompt_version,
              coalesce(forecast.metadata, '{}'::jsonb))
  ) then
    raise exception 'Forecast conflicts with immutable logical forecast history.' using errcode = '55000';
  end if;

  if p_forecasts is not null and exists (
    select 1 from public.hermes_forecasts existing
    where existing.agent_run_id = p_agent_run_id
      and not exists (
        select 1
        from jsonb_to_recordset(p_forecasts) as forecast(
          stable_key text, ticker text, scenario text, forecast_type text,
          horizon_date date, probability numeric, predicted_value numeric, unit text,
          benchmark_symbol text, benchmark_value numeric, model_version timestamptz,
           prompt_id text, prompt_version text, metadata jsonb
        )
        where existing.ticker = forecast.ticker and existing.scenario = forecast.scenario
          and existing.forecast_type = forecast.forecast_type
          and existing.unit = coalesce(forecast.unit, 'ratio')
          and existing.model_version = forecast.model_version
          and row(existing.stable_key, existing.horizon_date, existing.probability,
                    existing.predicted_value, existing.benchmark_symbol, existing.benchmark_value,
                    existing.prompt_id, existing.prompt_version, existing.metadata)
                is not distinct from
                row(forecast.stable_key, forecast.horizon_date, forecast.probability,
                    forecast.predicted_value, coalesce(forecast.benchmark_symbol, 'QQQ'), forecast.benchmark_value,
                    forecast.prompt_id, forecast.prompt_version, coalesce(forecast.metadata, '{}'::jsonb))
      )
  ) then
    raise exception 'Underwriting graph replay omitted or changed immutable historical forecasts.' using errcode = '55000';
  end if;

  insert into public.hermes_forecasts (
    stable_key, ticker, scenario, forecast_type, horizon_date, probability,
    predicted_value, unit, benchmark_symbol, benchmark_value, agent_run_id,
    model_version, prompt_id, prompt_version, status, metadata
  )
  select
    forecast.stable_key, forecast.ticker, forecast.scenario, forecast.forecast_type,
    forecast.horizon_date, forecast.probability, forecast.predicted_value,
    coalesce(forecast.unit, 'ratio'), coalesce(forecast.benchmark_symbol, 'QQQ'),
    forecast.benchmark_value, p_agent_run_id, forecast.model_version,
    forecast.prompt_id, forecast.prompt_version, 'open', coalesce(forecast.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_forecasts) as forecast(
    stable_key text, ticker text, scenario text, forecast_type text,
    horizon_date date, probability numeric, predicted_value numeric, unit text,
    benchmark_symbol text, benchmark_value numeric, model_version timestamptz,
           prompt_id text, prompt_version text, metadata jsonb
  )
  on conflict (ticker, scenario, forecast_type, unit, model_version) do nothing;
  get diagnostics saved_forecast_count = row_count;

  if p_forecasts is not null then
    select count(*) into resolved_forecast_count
    from jsonb_to_recordset(p_forecasts) as forecast(
      stable_key text, ticker text, scenario text, forecast_type text,
      horizon_date date, probability numeric, predicted_value numeric, unit text,
      benchmark_symbol text, benchmark_value numeric, model_version timestamptz,
           prompt_id text, prompt_version text, metadata jsonb
    )
    join public.hermes_forecasts existing
      on existing.ticker = forecast.ticker and existing.scenario = forecast.scenario
      and existing.forecast_type = forecast.forecast_type
      and existing.unit = coalesce(forecast.unit, 'ratio')
      and existing.model_version = forecast.model_version
    where existing.agent_run_id = p_agent_run_id
      and existing.status = 'open'
      and row(existing.stable_key, existing.horizon_date, existing.probability,
                    existing.predicted_value, existing.benchmark_symbol, existing.benchmark_value,
                    existing.prompt_id, existing.prompt_version, existing.metadata)
                is not distinct from
                row(forecast.stable_key, forecast.horizon_date, forecast.probability,
                    forecast.predicted_value, coalesce(forecast.benchmark_symbol, 'QQQ'), forecast.benchmark_value,
                    forecast.prompt_id, forecast.prompt_version, coalesce(forecast.metadata, '{}'::jsonb));

    if resolved_forecast_count <> jsonb_array_length(p_forecasts) then
      raise exception 'Every submitted forecast must exactly match immutable content and belong to the submitting agent run before edges are persisted.' using errcode = '55000';
    end if;
  end if;

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

  return jsonb_build_object(
    'nodes', saved_node_count,
    'edges', saved_edge_count,
    'forecasts_inserted', saved_forecast_count
  );
end;
$$;

create or replace function public.hermes_complete_underwriting_seed(
  p_agent_run_id uuid,
  p_nodes jsonb,
  p_edges jsonb,
  p_forecasts jsonb,
  p_output_ref jsonb,
  p_metrics jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  current_run public.hermes_agent_runs%rowtype;
  current_status text;
  current_output_ref jsonb;
  current_metrics jsonb;
  submitted_explicit_provenance boolean;
  submitted_null_provenance boolean;
  completion_timestamp timestamptz := pg_catalog.statement_timestamp();
begin
  -- Unlike the graph-only helper's explicit NULL sentinel, the current seed
  -- contract always publishes forecasts and must prove their exact bijection.
  if p_forecasts is null
     or jsonb_typeof(p_forecasts) <> 'array'
     or jsonb_array_length(p_forecasts) = 0 then
    raise exception 'Underwriting seed run % requires p_forecasts to be a non-empty JSON array.', p_agent_run_id
      using errcode = '22023';
  end if;
  if p_output_ref is null
     or p_metrics is null
     or jsonb_typeof(p_output_ref) <> 'object'
     or jsonb_typeof(p_metrics) <> 'object' then
    raise exception 'Seed completion output_ref and metrics must be JSON objects.' using errcode = '22023';
  end if;

  -- Seed completion is narrower than the graph helper. Lock and validate the
  -- immutable current seed run contract before the helper can write anything.
  select * into current_run
  from public.hermes_agent_runs
  where id = p_agent_run_id
  for update;

  if not found then
    raise exception 'Agent run % was not found.', p_agent_run_id using errcode = 'P0002';
  end if;

  if current_run.external_key is distinct from 'company-model-registry-import:2026-09-07T20:55:00.000Z'
     or current_run.workflow_id is distinct from 'company-model-registry-import'
     or current_run.workflow_version is distinct from '1.0.0'
     or current_run.prompt_id is distinct from 'company-underwrite'
     or current_run.prompt_version is distinct from '1.0.0'
     or current_run.agent_name is distinct from 'hermes-pm'
     or current_run.ticker is not null
     or current_run.task_id is not null
     or current_run.tools_used is distinct from array[
       'Yahoo Finance', 'FinanceToolkit', 'Hermes scenario drafting'
     ]::text[]
     or current_run.source_count is distinct from 2
     or current_run.input_ref is distinct from '{"file":"src/lib/company-models.ts","tickers":["MELI","NU","META","GOOGL","APPF","ACN","CRDO","TCEHY","ANET","TSM","VRT","AMKR","MU","CAMT","MRVL","ASML","ONTO","FORM","GEV","RXRX"]}'::jsonb
     or current_run.metadata is distinct from '{"seed":true,"provisionalResearch":true,"tickers":["MELI","NU","META","GOOGL","APPF","ACN","CRDO","TCEHY","ANET","TSM","VRT","AMKR","MU","CAMT","MRVL","ASML","ONTO","FORM","GEV","RXRX"]}'::jsonb then
    raise exception 'Underwriting seed run % does not match the exact current seed run contract.', p_agent_run_id
      using errcode = '55000';
  end if;

  submitted_explicit_provenance := coalesce(jsonb_typeof(p_nodes) = 'array'
    and jsonb_array_length(p_nodes) > 0
    and not exists (
      select 1
      from jsonb_to_recordset(p_nodes) as node(prompt_id text, prompt_version text)
      where node.prompt_id is distinct from 'company-underwrite'
         or node.prompt_version is distinct from '1.0.0'
    )
    and not exists (
      select 1
      from jsonb_to_recordset(p_forecasts) as forecast(prompt_id text, prompt_version text)
      where forecast.prompt_id is distinct from 'company-underwrite'
         or forecast.prompt_version is distinct from '1.0.0'
    ), false);
  submitted_null_provenance := coalesce(jsonb_typeof(p_nodes) = 'array'
    and jsonb_array_length(p_nodes) > 0
    and not exists (
      select 1
      from jsonb_to_recordset(p_nodes) as node(prompt_id text, prompt_version text)
      where node.prompt_id is not null or node.prompt_version is not null
    )
    and not exists (
      select 1
      from jsonb_to_recordset(p_forecasts) as forecast(prompt_id text, prompt_version text)
      where forecast.prompt_id is not null or forecast.prompt_version is not null
    ), false);

  if current_run.status in ('queued', 'running') then
    if not submitted_explicit_provenance then
      raise exception 'Current underwriting seed writes require every node and forecast to use company-underwrite@1.0.0.'
        using errcode = '23514';
    end if;
  elsif current_run.status = 'succeeded' then
    if not submitted_explicit_provenance
       and not (
         p_agent_run_id = '1e48faa4-20e5-4a0d-b155-c3e13762b36d'::uuid
         and submitted_null_provenance
       ) then
      raise exception 'Terminal underwriting seed replay requires company-underwrite@1.0.0; all-null compatibility is restricted to the exact immutable historical seed run.'
        using errcode = '23514';
    end if;
  else
    raise exception 'Underwriting seed run % is % and cannot complete.', p_agent_run_id, current_run.status
      using errcode = '55000';
  end if;

  -- Function calls share this transaction. Any validation, graph, edge,
  -- forecast, or completion failure rolls the entire seed attempt back.
  saved := public.hermes_replace_underwriting_graph(
    p_agent_run_id, p_nodes, p_edges, p_forecasts
  );

  select status, output_ref, metrics
  into current_status, current_output_ref, current_metrics
  from public.hermes_agent_runs
  where id = p_agent_run_id
  for update;

  if current_status = 'succeeded' then
    if current_output_ref is distinct from p_output_ref
       or current_metrics is distinct from p_metrics then
      raise exception 'Terminal seed replay must exactly match persisted completion metadata.' using errcode = '55000';
    end if;
    return saved;
  end if;
  if current_status <> 'running' then
    raise exception 'Underwriting seed run % is % and cannot complete.', p_agent_run_id, current_status using errcode = '55000';
  end if;

  update public.hermes_agent_runs
  set status = 'succeeded',
      completed_at = completion_timestamp,
      updated_at = completion_timestamp,
      output_ref = p_output_ref,
      metrics = p_metrics,
      error = null
  where id = p_agent_run_id;

  return saved;
end;
$$;

create or replace function public.hermes_validate_underwriting_node_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  run_status text;
begin
  if new.created_at is null
     or not pg_catalog.isfinite(new.created_at)
     or new.created_at > pg_catalog.statement_timestamp() then
    raise exception 'Underwriting node % (stable_key %) created_at must be finite and not later than statement_timestamp().',
      new.id, new.stable_key
      using errcode = '23514';
  end if;
  if new.updated_at is null
     or not pg_catalog.isfinite(new.updated_at)
     or new.updated_at > pg_catalog.statement_timestamp() then
    raise exception 'Underwriting node % (stable_key %) updated_at must be finite and not later than statement_timestamp().',
      new.id, new.stable_key
      using errcode = '23514';
  end if;
  if new.created_at > new.updated_at then
    raise exception 'Underwriting node % (stable_key %) created_at % must be less than or equal to updated_at % (hermes_underwriting_nodes_audit_chronology_check).',
      new.id, new.stable_key, new.created_at, new.updated_at
      using errcode = '23514';
  end if;
  if new.as_of is null
     or not pg_catalog.isfinite(new.as_of)
     or new.as_of > pg_catalog.statement_timestamp() then
    raise exception 'Underwriting nodes cannot use a non-finite or future as_of.' using errcode = '22007';
  end if;
  if new.valid_until is not null
     and (
       not pg_catalog.isfinite(new.valid_until)
       or new.valid_until < new.as_of
     ) then
    raise exception 'Underwriting node valid_until must be finite and greater than or equal to as_of.' using errcode = '22007';
  end if;
  if new.agent_run_id is null then
    raise exception 'Underwriting nodes must belong to an agent run and be written through hermes_replace_underwriting_graph.' using errcode = '23514';
  end if;

  select status into run_status
  from public.hermes_agent_runs
  where id = new.agent_run_id
  for share;
  if not found then
    raise exception 'Agent run % was not found.', new.agent_run_id using errcode = 'P0002';
  end if;
  if run_status not in ('queued', 'running') then
    raise exception 'Agent run % is % and cannot accept underwriting nodes.', new.agent_run_id, run_status using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.hermes_validate_underwriting_edge_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  from_run_id uuid;
  to_run_id uuid;
  run_status text;
begin
  if new.created_at is null
     or not pg_catalog.isfinite(new.created_at)
     or new.created_at > pg_catalog.statement_timestamp() then
    raise exception 'Underwriting edge % created_at must be finite and not later than statement_timestamp().', new.id
      using errcode = '23514';
  end if;
  if new.agent_run_id is null then
    raise exception 'Underwriting edges must belong to an agent run and be written through hermes_replace_underwriting_graph.' using errcode = '23514';
  end if;

  select agent_run_id into from_run_id
  from public.hermes_underwriting_nodes
  where id = new.from_node_id;
  if not found then
    raise exception 'Underwriting edge source node % was not found.', new.from_node_id using errcode = '23503';
  end if;

  select agent_run_id into to_run_id
  from public.hermes_underwriting_nodes
  where id = new.to_node_id;
  if not found then
    raise exception 'Underwriting edge target node % was not found.', new.to_node_id using errcode = '23503';
  end if;

  if from_run_id is null or to_run_id is null
     or from_run_id <> new.agent_run_id
     or to_run_id <> new.agent_run_id then
    raise exception 'Underwriting edge endpoints and edge must belong to the same agent run.' using errcode = '55000';
  end if;

  select status into run_status
  from public.hermes_agent_runs
  where id = new.agent_run_id
  for share;
  if not found then
    raise exception 'Agent run % was not found.', new.agent_run_id using errcode = 'P0002';
  end if;
  if run_status not in ('queued', 'running') then
    raise exception 'Agent run % is % and cannot accept underwriting edges.', new.agent_run_id, run_status using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists hermes_underwriting_nodes_validate_insert on public.hermes_underwriting_nodes;
create trigger hermes_underwriting_nodes_validate_insert
before insert on public.hermes_underwriting_nodes
for each row execute function public.hermes_validate_underwriting_node_insert();
drop trigger if exists hermes_underwriting_edges_validate_insert on public.hermes_underwriting_edges;
create trigger hermes_underwriting_edges_validate_insert
before insert on public.hermes_underwriting_edges
for each row execute function public.hermes_validate_underwriting_edge_insert();

create or replace function public.hermes_protect_underwriting_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Underwriting graph history is immutable; publish a new as_of version.' using errcode = '55000';
end;
$$;

drop trigger if exists hermes_underwriting_nodes_protect on public.hermes_underwriting_nodes;
create trigger hermes_underwriting_nodes_protect
before update or delete on public.hermes_underwriting_nodes
for each row execute function public.hermes_protect_underwriting_history();
drop trigger if exists hermes_underwriting_edges_protect on public.hermes_underwriting_edges;
create trigger hermes_underwriting_edges_protect
before update or delete on public.hermes_underwriting_edges
for each row execute function public.hermes_protect_underwriting_history();

drop trigger if exists hermes_prompt_versions_set_updated_at on public.hermes_prompt_versions;
create trigger hermes_prompt_versions_set_updated_at before update on public.hermes_prompt_versions for each row execute function public.hermes_set_updated_at();

create or replace function public.hermes_set_agent_run_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := coalesce(new.completed_at, pg_catalog.statement_timestamp());
  return new;
end;
$$;

drop trigger if exists hermes_agent_runs_set_updated_at on public.hermes_agent_runs;
drop trigger if exists hermes_agent_runs_z_set_updated_at on public.hermes_agent_runs;
create trigger hermes_agent_runs_z_set_updated_at before update on public.hermes_agent_runs for each row execute function public.hermes_set_agent_run_updated_at();
drop trigger if exists hermes_underwriting_nodes_set_updated_at on public.hermes_underwriting_nodes;
create trigger hermes_underwriting_nodes_set_updated_at before update on public.hermes_underwriting_nodes for each row execute function public.hermes_set_updated_at();
drop trigger if exists hermes_forecasts_set_updated_at on public.hermes_forecasts;
create trigger hermes_forecasts_set_updated_at before update on public.hermes_forecasts for each row execute function public.hermes_set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'hermes_prompt_versions', 'hermes_agent_runs', 'hermes_underwriting_nodes',
    'hermes_underwriting_edges', 'hermes_forecasts', 'hermes_forecast_outcomes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('revoke select, insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Prompt and forecast content are append-only for the API role. Prompt changes
-- require a new version; only the grading RPC may perform the one allowed
-- forecast status transition. Outcomes are also RPC-only writes.
revoke update, delete on public.hermes_prompt_versions from service_role;
revoke truncate on public.hermes_prompt_versions from service_role;
revoke delete, truncate on public.hermes_agent_runs from service_role;
revoke insert, update, delete, truncate on public.hermes_underwriting_nodes from service_role;
revoke insert, update, delete, truncate on public.hermes_underwriting_edges from service_role;
revoke update, delete on public.hermes_forecasts from service_role;
revoke truncate on public.hermes_forecasts from service_role;
revoke insert, update, delete, truncate on public.hermes_forecast_outcomes from service_role;

revoke all on function public.hermes_grade_forecast_outcome(uuid, timestamptz, numeric, numeric, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hermes_grade_forecast_outcome(uuid, timestamptz, numeric, numeric, boolean, text, text, jsonb) to service_role;
revoke all on function public.hermes_replace_underwriting_graph(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hermes_replace_underwriting_graph(uuid, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.hermes_complete_underwriting_seed(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hermes_complete_underwriting_seed(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

revoke select on public.hermes_forecast_evaluations from anon, authenticated;
grant select on public.hermes_forecast_evaluations to service_role;

do $$
declare t text;
begin
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
end $$;

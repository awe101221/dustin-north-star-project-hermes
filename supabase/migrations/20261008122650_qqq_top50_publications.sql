-- Both sleeves activate atomically with their reviewed identity/authority
-- registry. Existing tables, roles and default privileges are unchanged.
create table if not exists public.hermes_qqq_ranking_releases (
  release_hash text primary key check (release_hash ~ '^[a-f0-9]{64}$'),
  as_of timestamptz not null,
  approved_at timestamptz not null check (approved_at >= as_of),
  publications jsonb not null check ((
    jsonb_typeof(publications) = 'array' and jsonb_array_length(publications) = 2
    and publications->0->'draft'->>'sleeve' = 'core'
    and publications->1->'draft'->>'sleeve' = 'ai-regime'
    and jsonb_array_length(publications->0->'draft'->'forecasts') = 50
    and jsonb_array_length(publications->1->'draft'->'forecasts') = 50
  ) is true),
  securities jsonb not null check (jsonb_typeof(securities) = 'array' and jsonb_array_length(securities) > 0),
  authorities jsonb not null check (jsonb_typeof(authorities) = 'array' and jsonb_array_length(authorities) > 0),
  created_at timestamptz not null default now(),
  unique (as_of, approved_at)
);
alter table public.hermes_qqq_ranking_releases enable row level security;
revoke all on public.hermes_qqq_ranking_releases from public, anon, authenticated, service_role;
grant select, insert on public.hermes_qqq_ranking_releases to service_role;
comment on table public.hermes_qqq_ranking_releases is
  'Append-only exact-hash Top50 releases. Pages require a signed Hermes session; publication CLI verifies actual completed author/reviewer/PM runs. No public reads or direct agent writes.';

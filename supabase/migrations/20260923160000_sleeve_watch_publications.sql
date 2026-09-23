-- Watch-only sleeve publications. This table cannot authorize Top 10 or
-- Watchlist 10 membership. roster_write_approved is constrained false.
-- Anon and authenticated may read. They cannot insert, update, or delete.
-- There is no agent API route for this table.

create table if not exists public.hermes_sleeve_watch_publications (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  symbol text not null,
  company_name text not null,
  as_of timestamptz not null,
  review_task_id text not null,
  pm_task_id text not null,
  content_hash text not null,
  review_verdict text not null,
  roster_write_approved boolean not null default false,
  thesis text not null,
  parked_reason text,
  created_at timestamptz not null default now(),
  constraint hermes_sleeve_watch_publications_roster_write_false check (roster_write_approved = false),
  constraint hermes_sleeve_watch_publications_verdict check (review_verdict in ('PASS', 'PASS WITH CAVEATS')),
  constraint hermes_sleeve_watch_publications_distinct_tasks check (review_task_id <> pm_task_id)
);

create index if not exists idx_hermes_sleeve_watch_publications_as_of
  on public.hermes_sleeve_watch_publications (as_of desc);

alter table public.hermes_sleeve_watch_publications enable row level security;

drop policy if exists hermes_sleeve_watch_publications_read on public.hermes_sleeve_watch_publications;
create policy hermes_sleeve_watch_publications_read
  on public.hermes_sleeve_watch_publications
  for select to anon, authenticated
  using (true);

revoke insert, update, delete on public.hermes_sleeve_watch_publications from anon, authenticated;
grant select on public.hermes_sleeve_watch_publications to anon, authenticated;
grant all on public.hermes_sleeve_watch_publications to service_role;

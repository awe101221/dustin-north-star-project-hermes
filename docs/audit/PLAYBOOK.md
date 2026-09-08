# Hermes daily audit playbook

Recurring engineering audit for **Dustin North Star Project Hermes**.
Mandate: beat QQQ over 10 years. Live brain: INVESTING-BRAIN-AG (`cwiaqczpifnxxcucqwvr`).
App: [dustin-north-star-hermes.vercel.app](https://dustin-north-star-hermes.vercel.app).

This playbook is for **code, schema, freshness, and trust-the-numbers** issues.
Investing-philosophy updates belong in `/learnings` (`hermes-investing-philosophy-learning` notes), not here.

## Output (every run)

1. Write `docs/audit/YYYY-MM-DD.md` (UTC date). Counts and dates only — **never NAV dollars, keys, or tokens**.
2. Update the rolling GitHub issue titled `Daily Hermes audit` (create it if missing). Link the new file. Do not open a new issue every day.
3. Open a code PR only for **safe, small P0/P1 hygiene** (docs, smoke list, env guard, matching a live `hermes_*` migration into `supabase/migrations/`). Leave data backfills, RLS on legacy tables, and product features as recommendations.

## Hard rules

- Do not point the app at any Supabase ref except `cwiaqczpifnxxcucqwvr`.
- Do not write the Dustin Awe Capital reference project (`vnxypnpepwxurhbdtswn`).
- Do not touch `kms-brain`.
- Do not drop, rename, or rewrite legacy tables. New storage is a new `hermes_*` object plus a migration.
- Do not auto-enable RLS on the ~26 advisor-flagged tables. Enabling without policies locks the brain.
- Do not apply live DDL from an audit unless Dustin asked for that specific change.

## Checklist

### 1. What the product is today

Read `README.md`, `src/config/nav.ts`, and `src/app/page.tsx`. The home surface is **10 + 10** ranked ideas, not the portfolio hub. Portfolio is `/portfolio`. If README, smoke routes, or nav disagree, that is a finding.

### 2. GitHub / CI

- `git log origin/main -10 --oneline`
- Latest GitHub Actions on `main` (lint, typecheck, vitest, build)
- Open PRs and whether they drift schema or rankings

### 3. Vercel

Project: `dustin-north-star-hermes` (`prj_XLgUd3K32dOL597DkHr61od85UvG`).

- Latest production deploy SHA vs `origin/main`
- Runtime error clusters (7d)
- Status-code mix (24h). `401` can be the app password gate or Vercel Authentication (`all_except_custom_domains`).
- Do not claim a live-data browser pass unless you actually ran `BASE_URL=https://dustin-north-star-hermes.vercel.app npm run smoke` (needs the access password).

### 4. Schema ledger

Repo files: `supabase/migrations/*.sql`.
Live ledger: `hermes_schema_migrations` (`name`, `sha256`, `applied_at`).

A 4th (or Nth) live name with no matching file is **P0**. Reconstruct from `information_schema` / `pg_get_*` only when the dump is complete (columns, checks, FKs, indexes, RLS, grants, triggers, function bodies). If anything would be guessed, document the drift and stop.

Also list live `hermes_*` tables that still have **no** repo migration (sleeves were in this state on Day 1).

### 5. Freshness SQL (read-only)

Run against INVESTING-BRAIN-AG. Record `n` and `latest` only.

```sql
select 'perf_portfolio' as metric, count(*)::text as n, max(observation_date)::text as latest
from hermes_performance_points where series = 'portfolio'
union all
select 'perf_benchmark', count(*)::text, max(observation_date)::text
from hermes_performance_points where series = 'benchmark'
union all
select 'trades', count(*)::text, max(trade_time)::text from hermes_trades
union all
select 'ideas', count(*)::text, max(updated_at)::text from hermes_ideas
union all
select 'notes', count(*)::text, max(created_at)::text from hermes_notes
union all
select 'ibkr_pos', count(*)::text, max(report_date)::text from ibkr_positions
union all
select 'ibkr_nav', count(*)::text, max(snapshot_date)::text from ibkr_nav_history
union all
select 'mission_bm', count(*)::text, max(as_of)::text from mission_benchmark
union all
select 'memos', count(*)::text, max(analyzed_at)::text from analyst_memos
union all
select 'persona_catalog', count(*)::text, max(created_at)::text from hermes_persona_catalog
union all
select 'research_stream', count(*)::text, max(occurred_at)::text from hermes_research_stream
union all
select 'positions_latest', count(*)::text, max(report_date)::text from hermes_positions_latest;
```

Position classification (README ISSUES #6):

```sql
select
  count(*) filter (where sector is not null) as with_sector,
  count(*) filter (where sector is null) as without_sector,
  count(*) as total
from hermes_positions_latest;
```

Pipeline mix:

```sql
select stage, count(*) from hermes_ideas group by stage order by count(*) desc;
```

QQQ in `hermes_performance_points` is series **`benchmark`**, not `qqq`.

### 6. Security advisors

Supabase advisors: security + performance on `cwiaqczpifnxxcucqwvr`.

- Call out new **hermes_*** findings.
- Repeat the legacy RLS-disabled list only if the count or members changed.
- `hermes_schema_migrations` has historically had RLS off; do not enable it in an audit PR without an explicit read policy.

### 7. Rankings trust

- `src/lib/company-models.ts` is a git seed (`COMPANY_MODEL_AS_OF`). Stale models vs live prices/memos is a P0/P1 finding until models live in `hermes_*`.
- Best-ideas scores in `src/lib/best-ideas.ts` are a completeness heuristic unless a published snapshot is the source. Do not treat them as live IRRs.
- Empty `hermes_agent_tasks` plus stale memos means the underwriting loop is idle.

### 8. Report shape

Use yesterday’s file as the template. Sections:

1. Snapshot (commit, deploy, CI)
2. Freshness table
3. P0 / P1 / P2
4. Recommendations (what to do next, not a rewrite)
5. What changed in this audit’s understanding (so tomorrow is smarter)
6. Out of scope / do not do

Close the rolling GitHub issue only when Dustin says the audit program is done. Each day is an update, not a close.

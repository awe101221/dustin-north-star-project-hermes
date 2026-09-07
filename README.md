# Dustin North Star Project Hermes

Quant-PM cockpit for one mandate: **beat QQQ over 10 years**. Hermes sits on top of the existing
Awe Capital "brain" (Supabase project INVESTING-BRAIN-AG) and extends it with its own tables,
views and an agent-facing API. It is a Next.js 16 App Router app, TypeScript end to end, built
for Vercel.

> The old Awe Capital app was not rewritten. Every memo, persona, ranking, position, filing and
> 13F row it produced is read in place. Hermes adds `hermes_*` objects next to them and migrates the
> reusable knowledge (persona prompts, playbooks, specs, templates) into a searchable table.

---

## ISSUES / open questions (read first)

These are the things I would want to know before trusting the numbers or the deploy. None of
them block the PR; several need a decision from you.

1. **Alpha is measured on time-weighted return, not NAV.** `hermes_performance_points.daily_return`
   is the IBKR TWR chain; NAV (`nav`) includes deposits and withdrawals and is only shown as a
   level. The reference DB's own digest noted NAV-index "alpha" was flow-inflated. The North Star
   page uses TWR. If any legacy chart still compares NAV growth to QQQ, treat it as decoration.
2. **Legacy performance data needed cleaning, and the cleaning is a judgment call.**
   The reference DB holds three overlapping imports of the same dates (newest import wins) and a
   benchmark table that mixes the continuous IBKR QQQ total-return index (base 2025-01-01 = 100)
   with a rebased archive copy (duplicate 2026 dates). Only the IBKR series was imported. 1D
   returns were missing for all but two dates, so daily returns are derived from consecutive YTD
   values (portfolio) and consecutive index values (benchmark). Details in
   `scripts/migrate/import-legacy-performance.ts`.
3. **The sandbox that built this could not reach `*.supabase.co` directly**, so the UI was
   smoke-tested only in its degraded "query failed" state (all 16 routes render an `ErrorPanel`,
   no crashes, no error boundary) and every data-layer query was verified at the SQL level instead
   (views executed, every selected column checked against `information_schema`). Rendering against
   live data in a browser is the first thing to check on the Vercel preview:
   `BASE_URL=<preview> npm run smoke`.
4. **Supabase security advisor flags 25 legacy tables with RLS disabled** (staging/backup tables
   such as `analyst_memos_archive_backup_20260811`, `stg_*`, `retired_securities`,
   `ranking_channels`). Hermes did not touch them. They are readable through the API today; decide
   whether to enable RLS or drop the backups. The advisor's findings on `hermes_*` objects
   (security-definer views, mutable `search_path` on functions) were fixed by the third migration.
5. **Knowledge migration was applied through the SQL console, not the script** (the sandbox had no
   service-role key and no route to PostgREST). The row count in *State of the live database*
   below is what actually landed. `npm run migrate:knowledge` is idempotent (upsert on slug,
   content hash) and will complete or refresh the set from the two legacy checkouts.
6. **Positions are only partially classified.** 156 of 376 latest IBKR positions join to an
   `investment_companies` row; the rest show without sector/industry. Backfilling
   `investment_companies` (or a symbol alias table) fixes the exposure charts.
7. **QQQ year-start close is a constant for 2026** (`QQQ_PRIOR_YEAR_CLOSE` in `src/lib/db/hub.ts`)
   used only as a fallback when `hermes_benchmark_series` has no year-start row. Move it to the
   database when the benchmark sync writes year-end marks.
8. **Backtests are illustrative.** Prices come from stooq (free, end-of-day, no survivorship
   handling, no corporate-action audit). The backtest lab is for shape and sanity, not attribution.
9. **Single shared agent token, single optional password.** There is no per-user auth. That is
   fine for one PM plus agents; it is not fine for a team.
10. **Options exposure.** IBKR option rows are listed under the underlying symbol in the trade log
    and dossiers; notional for non-USD trades (EUR/GBP lines) is left null rather than guessed.

---

## What shipped

| Route | Module | Notes |
|---|---|---|
| `/` | **Portfolio Hub** | live book from `hermes_positions_latest`, sleeves, exposures, P&L, YTD vs QQQ, trade log (781 imported IBKR executions + manual entry), alpha attribution |
| `/research`, `/research/[id]`, `/research/new` | **Research / Memos / Analyst Engine** | unified stream of 1,838 legacy memos + Hermes notes, latest / timeline / journal modes, full-text search (`hermes_search_research`), facets by persona / verdict / tag, markdown-first editor (`⌘S`), ticker linking |
| `/personas`, `/personas/[slug]` | **Persona architecture** | editable framework prompts (versioned), boards, artifacts, verdict mix, linked knowledge; create new personas |
| `/pipeline` | **Idea Pipeline** | Kanban Sourcing → Diligence → Live → Monitor → Archive, drag/drop (dnd-kit), conviction / risk / target weight, thesis / why-beat-QQQ / falsifier, audit trail |
| `/quant` | **Quant tools** | JSON screener with presets over the memo universe, backtest lab (basket vs QQQ, rebalance, cost bps, exposure overlay), 13F guru crossover, insider/news alt-data, saved jobs |
| `/north-star` | **Mandate & stats** | editable mandate (rules, KPIs, sleeves, guardrails, versioned), YoY vs QQQ, rolling Sharpe / Sortino (60/120d), beta, tracking error, information ratio, hit rate, drawdown, decision scorecard |
| `/companies`, `/companies/[ticker]` | Company dossiers | every lens's latest view, memo history, notes, holders, filings, trades, one-click note / pipeline / underwrite |
| `/knowledge`, `/knowledge/[slug]` | Knowledge base | migrated persona prompts, playbooks, specs, templates, agent instructions; text search |
| `/agents` | Agent console | task queue (open / claimed / done), automations freshness, API docs |
| `/activity`, `/settings`, `/playground` | Timeline, diagnostics, chart playground | |

UX: `⌘K` command palette (cmdk), `g`-prefixed navigation, `\` presentation toggle that blurs
every sensitive number, North Star drawer (`.`), keyboard shortcuts dialog (`?`), realtime
invalidation on every `hermes_*` table (Supabase `postgres_changes`), TanStack Query for instant
feel. Design tokens and the validated chart palette are in `docs/design.md`.

---

## Architecture

```
browser ──publishable key──▶ Supabase (RLS read policies, realtime)  ◀──service role── route handlers
   │                                    ▲                                        ▲
   │  TanStack Query + realtime         │ hermes_* tables/views + legacy tables  │ zod-validated writes
   ▼                                    │                                        │
Next.js 16 App Router (server components read via serverReadClient; client components via getBrowserClient)
   │
   └── /api/agent/* (bearer HERMES_AGENT_TOKEN) ── task queue, context bundles, notes, ideas, quant jobs
```

- **Stack.** Next.js 16.3 (App Router, `proxy.ts`), React 19, TypeScript strict +
  `noUncheckedIndexedAccess`, Tailwind CSS 4, shadcn-style primitives on the unified `radix-ui`
  package, TanStack Query 5, zustand (UI state), cmdk, dnd-kit, recharts, zod 4,
  `@supabase/supabase-js` 2, vitest, Playwright (smoke).
- **Data layer.** `src/lib/db/*` are isomorphic query modules `(db, args) => Promise<T>` with
  hand-written row types (`types.ts`). Server pages call them with `serverReadClient()`; client
  components call them with `getBrowserClient()` inside TanStack Query hooks and subscribe to
  `useRealtime(tables, queryKeys)` for invalidation. Numeric coercion is explicit (`num()`).
- **Writes.** `/api/hermes/*` route handlers run with the service role behind `withAdmin`
  (503 if the key is missing, so a read-only deploy still works). `/api/agent/*` run behind
  `withAgent` (timing-safe bearer check, then the same admin client). All bodies are zod schemas
  in `src/lib/server/schemas.ts`. Every mutation logs to `hermes_activity`.
- **Auth.** Optional whole-app password gate: HMAC-signed cookie (`src/lib/auth.ts`,
  `src/proxy.ts`, `/login`). `/api/health`, `/api/auth/*` and `/api/agent/*` are exempt.
- **Project-ref guard.** `src/lib/env.ts` throws if `NEXT_PUBLIC_SUPABASE_URL` does not point at
  `cwiaqczpifnxxcucqwvr`; the reference DB client in `scripts/lib/rest.ts` refuses any non-GET.

### Database extension (`supabase/migrations/`)

Applied to INVESTING-BRAIN-AG. Nothing legacy was altered.

`20260907000100_hermes_core.sql`

| Object | Purpose |
|---|---|
| `hermes_mandate` | the North Star: mission, benchmark, horizon, hurdle IRR, rules / KPIs / sleeves / guardrails (jsonb), versioned |
| `hermes_ideas` + `hermes_idea_events` | pipeline cards (stage, sort order, conviction, risk, sizing, thesis, falsifier, catalyst, links to memo / persona / theme) with an audit trigger; one active card per ticker |
| `hermes_notes` | memos, notes, journal, decisions, reviews, meetings, agent output; markdown body, tickers[], tags[], generated tsvector |
| `hermes_trades` | trade log (manual, IBKR import, agent) with idempotent `external_key` |
| `hermes_performance_points` | daily portfolio TWR + QQQ total-return index series |
| `hermes_knowledge` | migrated persona prompts / playbooks / specs / templates / agent docs (slug, category, sha256, tsvector) |
| `hermes_quant_jobs` | saved screens / backtests / factor jobs with results |
| `hermes_agent_tasks` | agent work queue with `hermes_claim_agent_task()` (SKIP LOCKED) |
| `hermes_activity` | unified timeline, fed by triggers on ideas / notes / trades |
| RLS | enabled on every `hermes_*` table; `anon` / `authenticated` may SELECT, writes are service-role only; tables added to the `supabase_realtime` publication |

`20260907000200_hermes_views.sql`

| View / function | Reads |
|---|---|
| `hermes_research_stream` | every complete `analyst_memos` row (with `is_latest`) unioned with `hermes_notes` |
| `hermes_search_research(q, lim)` | ranked websearch over memos + notes with headlines |
| `hermes_positions_latest` | latest `ibkr_positions` joined to `investment_companies` |
| `hermes_screener_universe` | latest memo per ticker/persona joined to live quotes, master scores, health cache, held weight |
| `hermes_benchmark_series` | `mission_benchmark` joined to `ibkr_nav_history` |
| `hermes_guru_crossover` | 13F buyers / sellers per ticker for the latest quarter |
| `hermes_decision_scorecard` | `master_decisions` with latest outcomes |
| `hermes_persona_catalog` | `analyst_personas` with memo / ticker counts |

`supabase/seed/hermes_pipeline_seed.sql` is the SQL twin of `scripts/seed/seed-pipeline.ts`
(runs from the SQL editor without a service key).

### Security model

- The browser only ever holds the publishable key. Reads on `hermes_*` tables go through explicit
  `anon` / `authenticated` SELECT policies.
- The seven `hermes_*` views run with `security_invoker = on`
  (`supabase/migrations/20260907000300_hermes_hardening.sql`), so they never widen what the
  caller could already read. Every legacy table they touch already grants `anon` SELECT through
  its own policies, which is what makes a read-only deploy with only the publishable key work.
  The same migration pins `search_path = public` on every `hermes_*` function.
- `hermes_claim_agent_task` is the one SECURITY DEFINER function (it needs `SKIP LOCKED` on the
  task queue); it is not executable by `anon` and is only called from the bearer-token route.
- The advisor also lists 25 legacy tables with RLS disabled (see ISSUES #4). Hermes did not create
  or modify them.
- Put `HERMES_ACCESS_PASSWORD` + `HERMES_SESSION_SECRET` on the production deployment. Without
  them the hub, which shows live NAV, is public at the URL.

---

## Setup

### Environment

Copy `.env.example` to `.env.local` (local) or add the same keys in Vercel → Project → Settings →
Environment Variables. Never commit values.

| Variable | Scope | Required for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | everything (must be the INVESTING-BRAIN-AG URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | reads, realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | server | every write (pipeline, notes, trades, mandate, personas, quant jobs, agent API) |
| `HERMES_ACCESS_PASSWORD`, `HERMES_SESSION_SECRET` | server | optional password gate (recommended in production) |
| `HERMES_AGENT_TOKEN` | server | enables `/api/agent/*` |
| `GURUFOCUS_API_KEY` | server | optional insider/news provider (SEC EDGAR fallback otherwise) |
| `HERMES_PRICE_PROVIDER` | server | `stooq` (default) or `none` for the backtest lab |
| `DATABASE_URL` | scripts | `npm run db:migrate` / `db:verify` |
| `LEGACY_INVESTMENT_BRAIN_URL`, `LEGACY_INVESTMENT_BRAIN_SERVICE_ROLE_KEY` | scripts | one-time imports from the reference DB |

### Vercel

`vercel.json` pins the framework, `npm ci` and region `iad1`. Set the variables above, deploy
the `main` branch (or this PR's preview). The build never contacts the database (every page is
`force-dynamic`), so a preview builds without secrets; it renders "not connected" panels until
the public keys are set. `.github/workflows/ci.yml` runs lint, typecheck, vitest and the build
on every push.

### Local

```bash
npm ci
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
npm run check                # lint + typecheck + vitest + build
BASE_URL=http://localhost:3000 npm run smoke   # Playwright screenshots of every route → scripts/smoke/output
```

`npm run smoke` accepts `CHROMIUM_PATH=/path/to/chrome` when Playwright's bundled browser is
not installed, and `HERMES_ACCESS_PASSWORD` to log in through the gate first.

---

## Migration, seeds and what was migrated

| Script | Source → target | Idempotency |
|---|---|---|
| `npm run db:migrate` | `supabase/migrations/*.sql` → live DB via `DATABASE_URL` | ledger `hermes_schema_migrations` (sha256) |
| `npm run db:verify` | counts / smoke queries on views | read-only |
| `npm run seed:mandate` | `scripts/seed/mandate.ts` → `hermes_mandate` | insert-if-missing |
| `npm run migrate:knowledge` | legacy checkouts (`LEGACY_AWE_CAPITAL_DIR`, `LEGACY_DUSTIN_AWE_CAPITAL_DIR`) → `hermes_knowledge` | upsert on slug; skips files already stored as `analyst_project_artifacts`; `--emit-sql <dir>` writes SQL instead of executing |
| `npm run seed:pipeline` | live views + legacy `northStarCompanies.ts` seeds → `hermes_ideas` | never touches existing cards; `--emit-sql <file>` |
| `npm run migrate:performance` | reference DB `capital.portfolio_performance_points` + `portfolio_benchmark_observations` → `hermes_performance_points` | upsert on (series, date) |
| `npm run migrate:trades` | reference DB `capital.realized_executions` → `hermes_trades` | upsert on `external_key` |
| `npm run migrate:all` | mandate → knowledge → pipeline → verify | |

State of the live database after this PR:

| Table | Rows | Provenance |
|---|---|---|
| `hermes_mandate` | 1 (v1: 10 rules, 7 KPIs, 3 sleeves, 5 guardrails) | `scripts/seed/mandate.ts` |
| `hermes_performance_points` | 594 (177 portfolio 2026-01-01 → 2026-09-04, 417 QQQ TR 2025-01-01 → 2026-08-31) | reference DB, cleaned as in ISSUES #2 |
| `hermes_trades` | 781 IBKR executions 2025-07-01 → 2026-08-28 | reference DB `capital.realized_executions` |
| `hermes_ideas` | 76 cards (25 live, 24 monitor, 7 diligence, 20 sourcing) | open recommendations, trigger alerts, held names with memos, legacy North Star seeds, master scores |
| `hermes_knowledge` | 22 of the 69 documents extracted from `awe-capital` and `dustin-awe-capital` (personas, gates, specs, playbooks, prompts, queue-worker contracts, skills, templates, agent instructions); the remaining 47 load with `npm run migrate:knowledge` | `scripts/migrate/import-legacy-knowledge.ts` (`--emit-sql`, pushed through the SQL console) |
| `hermes_schema_migrations` | 3 rows (file name + sha256 of each applied migration) | `scripts/db/apply-migrations.ts` |

What was **not** copied: memos, rankings, positions, filings and 13F data stay in their legacy
tables and are read through the `hermes_*` views. Persona prompts stay in
`analyst_project_artifacts` / `analyst_personas` and are edited in place from `/personas`.

---

## Agent integration

Agents (Claude Code, Codex, scheduled jobs) talk to Hermes through `/api/agent/*` with
`Authorization: Bearer $HERMES_AGENT_TOKEN`. Every endpoint returns JSON and every write is
validated and logged to `hermes_activity`.

| Endpoint | Purpose |
|---|---|
| `GET /api/agent/tasks?status=open` | list queued work (`underwrite`, `reunderwrite`, `screen`, custom) |
| `POST /api/agent/tasks` | enqueue a task `{ task_type, title, instructions, ticker?, idea_id?, priority? }` |
| `POST /api/agent/tasks/claim` | atomically claim the next task `{ agent, task_types? }` (SKIP LOCKED) |
| `POST /api/agent/tasks/[id]/complete` | `{ result, result_ref?, status? }` |
| `GET /api/agent/context?ticker=NAS:MU` | one bundle: mandate, company, latest views per lens, memo history, notes, position, idea, filings, 13F flow, trades |
| `GET /api/agent/mandate` | mandate + open recommendations + alerts + pipeline |
| `POST /api/agent/notes` | write a memo / note / journal entry (markdown, tickers, tags, persona, verdict) |
| `POST /api/agent/ideas` | create or update a pipeline card by ticker (agents cannot move cards to `live`) |
| `POST /api/agent/quant-jobs`, `PATCH ?id=` | submit / update screen or backtest jobs |

Typical loop for an underwriting agent:

```bash
T=$HERMES_AGENT_TOKEN; H=https://<deployment>
curl -s -H "Authorization: Bearer $T" -X POST $H/api/agent/tasks/claim -d '{"agent":"claude-code","task_types":["underwrite"]}'
curl -s -H "Authorization: Bearer $T" "$H/api/agent/context?ticker=NAS:MU"
# ... write the memo into analyst_memos as the persona prompt requires, then:
curl -s -H "Authorization: Bearer $T" -X POST $H/api/agent/notes -d '{"kind":"agent","title":"MU underwrite","body_md":"...","tickers":["NAS:MU"],"persona_slug":"brad-gerstner"}'
curl -s -H "Authorization: Bearer $T" -X POST $H/api/agent/tasks/<id>/complete -d '{"result":{"memo_id":"..."}}'
```

Inside the app, "Queue underwrite" on a company dossier and the agent console create the same
tasks. Persona prompts (`/personas/[slug]`) are the instructions agents should load; they are
versioned on every edit.

---

## Extending

- **New page or panel:** add a query in `src/lib/db/<module>.ts`, a server page that wraps it in
  `safeLoad()`, and a client component for anything interactive. Register the route in
  `src/config/nav.ts` to get sidebar, palette and `g`-hotkey for free.
- **New table:** add `supabase/migrations/<timestamp>_<name>.sql` (idempotent DDL, RLS + policies,
  add to the realtime publication), a row type in `src/lib/db/types.ts`, zod schemas in
  `src/lib/server/schemas.ts`, and a `/api/hermes/<name>` handler using `withAdmin`.
- **New persona:** create it from `/personas` (writes `analyst_personas`), then upload its prompt
  artifacts; the research stream, boards and knowledge links pick it up by slug.
- **New screener preset:** append to `SCREEN_PRESETS` in `src/lib/quant/screener.ts`. The
  `ScreenSpec` JSON is the same shape agents submit through `/api/agent/quant-jobs`.
- **New stat:** `src/lib/stats.ts` is pure and unit-tested (`npm test`); `getNorthStarStats` in
  `src/lib/db/northstar.ts` composes it from `hermes_performance_points`.
- **Storybook / playground:** `/playground` renders every chart primitive with synthetic data;
  the UI primitives in `src/components/ui` are plain React and Storybook-ready (no Storybook config
  is committed to keep the install small).

---

## Verification performed for this PR

- `npm run lint`, `npm run typecheck`, `npm test` (16 tests: stats, backtest engine) and
  `npm run build` pass; the build also passes with no environment variables at all.
- All three migrations applied to INVESTING-BRAIN-AG and recorded in
  `hermes_schema_migrations` with their file hashes; all views executed and row counts checked
  (research stream 1,838 rows / 1,064 latest; positions 376; universe 1,064; guru crossover 9,464;
  decision scorecard 47/47 graded; full-text search returns ranked hits). The Supabase security
  advisor reports no errors on `hermes_*` objects after the hardening migration.
- Every `(table, column)` pair selected anywhere in `src/` was checked against
  `information_schema` on the live database: no missing objects.
- Playwright smoke run over all 16 routes against a production build: 200 responses, no error
  overlay, no page errors, no React error boundary. Because the sandbox could not reach Supabase,
  the pages rendered their "query failed" `ErrorPanel` state; see ISSUES #3.

Reference: `KICKOFF_PROMPT.md` and `CLAUDE_ONESHOT_KICKOFF.md` hold the original brief.
`AGENTS.md` has the working rules for humans and agents.

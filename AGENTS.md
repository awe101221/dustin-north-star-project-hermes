# Working in this repo (humans and agents)

Read `README.md` first. The rules below are the ones that bite.

## Non-negotiables

1. **Live storage is one Supabase project: INVESTING-BRAIN-AG, ref `cwiaqczpifnxxcucqwvr`.**
   Every read and write in the app goes there. `src/lib/env.ts` refuses any other ref.
2. **The "Dustin Awe Capital" project (`vnxypnpepwxurhbdtswn`) is reference-only.** It is read
   by one-time import scripts under `scripts/migrate/` through a client that refuses non-GET
   requests. Never point the app at it and never write to it.
3. **Never touch `kms-brain`.**
4. **Legacy tables are never dropped, renamed or rewritten.** Hermes extends the brain with
   `hermes_*` tables and views (`supabase/migrations/`). A new feature that needs storage gets a
   new `hermes_*` object plus a migration file, never a column on a legacy table.
5. **The service-role key is server-only.** It is read in `src/lib/supabase/server.ts` and route
   handlers only. The browser gets the publishable key and RLS read policies.
6. **No secrets in the repo.** `.env.local` is gitignored; `.env.example` lists every variable.

## Conventions

- Data access lives in `src/lib/db/*` as isomorphic functions `(db, args) => Promise<T>` with
  hand-written row types in `src/lib/db/types.ts`. Pages call them through `serverReadClient()`;
  client components call them through `getBrowserClient()` + TanStack Query.
- Server pages wrap loads in `safeLoad()` and render `ErrorPanel` on failure. Do not put JSX
  inside `try/catch` (React Compiler lint rule) and do not let a failed query 500 the page.
- Writes go through `/api/hermes/*` (session, service role) or `/api/agent/*` (bearer token).
  Every body is validated with zod in `src/lib/server/schemas.ts`.
- Numbers from PostgREST are strings; coerce with `num()` from `src/lib/db/query.ts`.
- Charts: fixed series order from `--series-1..6`, one y-axis, legend for two or more series.
  Re-validate the palette if you change it (see `docs/design.md`).
- Keep `npm run check` green (lint, typecheck, vitest, build). CI runs the same four steps.

## Where things are

| Concern | Path |
|---|---|
| Schema extension | `supabase/migrations/*.sql`, `supabase/seed/*.sql` |
| Env + project-ref guard | `src/lib/env.ts` |
| Supabase clients | `src/lib/supabase/{public,server}.ts` |
| Query modules | `src/lib/db/{portfolio,hub,research,personas,pipeline,quant,northstar,knowledge,company}.ts` |
| Stats / quant engines | `src/lib/stats.ts`, `src/lib/quant/{screener,backtest,prices,runner}.ts` |
| Route handlers + auth wrappers | `src/app/api/**`, `src/lib/server/{handlers,schemas,safe}.ts` |
| Shell, palette, hotkeys | `src/components/shell/*`, `src/hooks/use-hotkeys.ts`, `src/config/nav.ts` |
| Migration / seed scripts | `scripts/{db,migrate,seed,smoke}/*` |

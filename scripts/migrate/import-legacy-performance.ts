import { hermesClient, legacyClient, chunk } from "../lib/rest";
import { log } from "../lib/env";

/**
 * One-time (re-runnable) import of the daily performance series from the
 * Dustin Awe Capital reference DB (project investment-brain, schema capital)
 * into hermes_performance_points in the live DB.
 *
 *   capital.portfolio_performance_points (period=1D/YTD)  -> series=portfolio  (nav, daily_return, ytd_return)
 *   capital.portfolio_benchmark_observations              -> series=benchmark  (index_value=qqq_index, ytd_return)
 *
 * Source hygiene (learned from the reference data, keep in sync with README):
 *   - portfolio_performance_points holds several imports (import_id) of the
 *     same dates with slightly different values; the newest import wins for
 *     each (date, period).
 *   - portfolio_benchmark_observations mixes the continuous IBKR QQQ
 *     total-return index (base 2025-01-01 = 100) with a rebased "Former Awe
 *     Capital benchmark archive" copy that duplicates 2026 dates; only the
 *     IBKR series is imported.
 *   - 1D returns are missing for nearly every date in the reference data, so
 *     daily_return is derived where absent:
 *       portfolio  r_t = (1 + YTD_t) / (1 + YTD_{t-1}) - 1   (TWR chain, resets each year)
 *       benchmark  r_t = index_t / index_{t-1} - 1
 *
 * The app never reads the reference DB; after this import the IBKR sync (or a
 * re-run of this script) keeps the series current. Source is stamped on every
 * row so provenance is auditable.
 */
const SOURCE = "legacy_import:investment-brain";
const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

async function main() {
  const legacy = legacyClient();
  const hermes = hermesClient();

  const points = await legacy.selectAll<{ import_id: number; period: string; observation_date: string; nav: string | null; return_ratio: string | null }>(
    "portfolio_performance_points",
    "select=import_id,period,observation_date,nav,return_ratio&period=in.(1D,YTD)&order=observation_date.asc,import_id.desc",
    { schema: "capital" },
  );
  const bench = await legacy.selectAll<{ as_of: string; qqq_index: string | null; qqq_return_ytd_ratio: string | null; source: string | null }>(
    "portfolio_benchmark_observations",
    "select=as_of,qqq_index,qqq_return_ytd_ratio,source&source=like.Interactive%20Brokers*&order=as_of.asc,qqq_index.desc",
    { schema: "capital" },
  );
  log(`reference DB: ${points.length} portfolio points, ${bench.length} IBKR benchmark observations`);

  // newest import wins per (date, period) — rows arrive ordered import_id desc within a date
  const byDate = new Map<string, { nav: number | null; daily: number | null; ytd: number | null }>();
  for (const p of points) {
    const cur = byDate.get(p.observation_date) ?? { nav: null, daily: null, ytd: null };
    if (p.period === "YTD" && cur.ytd === null) {
      cur.ytd = num(p.return_ratio);
      cur.nav = num(p.nav) ?? cur.nav;
    }
    if (p.period === "1D" && cur.daily === null) cur.daily = num(p.return_ratio);
    byDate.set(p.observation_date, cur);
  }

  const rows: Record<string, unknown>[] = [];
  let prev: { date: string; ytd: number } | null = null;
  for (const date of Array.from(byDate.keys()).sort()) {
    const v = byDate.get(date)!;
    let daily = v.daily;
    if (daily === null && v.ytd !== null && prev && prev.date.slice(0, 4) === date.slice(0, 4) && 1 + prev.ytd !== 0) {
      daily = (1 + v.ytd) / (1 + prev.ytd) - 1;
    }
    rows.push({ observation_date: date, series: "portfolio", nav: v.nav, daily_return: daily, ytd_return: v.ytd, index_value: null, source: SOURCE });
    if (v.ytd !== null) prev = { date, ytd: v.ytd };
  }

  const seenBench = new Set<string>();
  let prevIdx: number | null = null;
  for (const b of bench) {
    if (seenBench.has(b.as_of)) continue; // duplicates (if any) arrive index-desc; keep the continuous series
    seenBench.add(b.as_of);
    const idx = num(b.qqq_index);
    const daily = idx !== null && prevIdx !== null && prevIdx !== 0 ? idx / prevIdx - 1 : null;
    rows.push({ observation_date: b.as_of, series: "benchmark", nav: null, daily_return: daily, ytd_return: num(b.qqq_return_ytd_ratio), index_value: idx, source: SOURCE });
    if (idx !== null) prevIdx = idx;
  }

  for (const batch of chunk(rows, 500)) await hermes.upsert("hermes_performance_points", batch, "series,observation_date");
  const portfolio = rows.filter((r) => r.series === "portfolio").length;
  log(`upserted ${rows.length} rows into hermes_performance_points (${portfolio} portfolio, ${rows.length - portfolio} benchmark)`);
  log(`table now holds ${await hermes.count("hermes_performance_points", "select=observation_date")} rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { hermesClient, publicClient, toInsertSql, chunk } from "../lib/rest";
import { log, optionalEnv } from "../lib/env";

/**
 * Seeds the Idea Pipeline from what the brain already knows, so the board is
 * useful on day one instead of empty:
 *
 *   live      — held names (≥ 0.75% of NAV) that have a latest memo
 *   monitor   — open master recommendations (TRIM/EXIT) + names with a pierced
 *               or approaching trigger
 *   diligence — the legacy North Star "top 10 ranked" seeds (thesis, why-beat-QQQ,
 *               evidence, falsifier migrated from src/data/northStarCompanies.ts)
 *               + latest BUY/BUY-MORE memos ≥ 20% IRR not held
 *   sourcing  — the legacy North Star watchlist + top master-conviction names
 *               with no memo-backed position
 *
 * Idempotent: one active card per ticker (unique index); existing cards are
 * left untouched (the seed never overwrites human edits).
 */
type Seed = { ticker: string; name: string; category: string; thesis: string; whyBeatQqq: string; evidenceNeeded: string; falsifier: string; nextAction: string; list: "ranked" | "watchlist"; score: number };

function parseNorthStarSeeds(file: string): Seed[] {
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, "utf8");
  const out: Seed[] = [];
  const sections: Array<["ranked" | "watchlist", string]> = [];
  const rankedIdx = src.indexOf("const rankedSeeds");
  const watchIdx = src.indexOf("const watchlistSeeds");
  if (rankedIdx >= 0 && watchIdx >= 0) {
    sections.push(["ranked", src.slice(rankedIdx, watchIdx)]);
    sections.push(["watchlist", src.slice(watchIdx, src.indexOf("function boundedScore") >= 0 ? src.indexOf("function boundedScore") : undefined)]);
  }
  for (const [list, block] of sections) {
    const re = /ticker:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*northStarScore:\s*(\d+),\s*marketCapBand:\s*"[^"]*",\s*thesis:\s*"([^"]*)",\s*whyBeatQqq:\s*"([^"]*)",\s*evidenceNeeded:\s*"([^"]*)",\s*falsifier:\s*"([^"]*)",\s*nextAction:\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      out.push({ ticker: m[1]!, name: m[2]!, category: m[3]!, score: Number(m[4]), thesis: m[5]!, whyBeatQqq: m[6]!, evidenceNeeded: m[7]!, falsifier: m[8]!, nextAction: m[9]!, list });
    }
  }
  return out;
}

async function main() {
  // `--emit-sql <file>` writes the INSERT instead of executing it (reads use the anon key,
  // so no service-role key is needed; apply the file through the Supabase SQL editor).
  const emitIdx = process.argv.indexOf("--emit-sql");
  const emitTo = emitIdx >= 0 ? process.argv[emitIdx + 1] : undefined;
  if (emitIdx >= 0 && !emitTo) throw new Error("--emit-sql requires a file path");
  const db = emitTo ? publicClient() : hermesClient();
  const aweDir = optionalEnv("LEGACY_AWE_CAPITAL_DIR") ?? path.resolve(process.cwd(), "../awe-capital");
  const seeds = parseNorthStarSeeds(path.join(aweDir, "src/data/northStarCompanies.ts"));
  log(`legacy North Star seeds: ${seeds.length}`);

  const [positions, universe, recs, alerts, scores, existing, companies] = await Promise.all([
    db.selectAll<{ ticker: string | null; symbol: string; company_name: string; pct_of_nav: string | null; market_value_usd: string | null }>("hermes_positions_latest", "select=ticker,symbol,company_name,pct_of_nav,market_value_usd&order=market_value_usd.desc"),
    db.selectAll<{ memo_id: string; analyst_slug: string; ticker: string; symbol: string; company_name: string | null; verdict: string; memo_expected_irr: string | null; held_weight: string | null; buy_pierced: boolean | null; trigger_pierced: boolean | null; reunderwrite_trigger_price: string | null; buy_consideration_price: string | null }>("hermes_screener_universe", "select=memo_id,analyst_slug,ticker,symbol,company_name,verdict,memo_expected_irr,held_weight,buy_pierced,trigger_pierced,reunderwrite_trigger_price,buy_consideration_price"),
    db.select<{ id: string; ticker: string; action: string; size_suggestion: string | null; current_weight_pct: string | null; memo_refs: unknown }>("open_master_recommendations", "select=id,ticker,action,size_suggestion,current_weight_pct,memo_refs&limit=100"),
    db.select<{ ticker: string; alert_type: string; note: string | null; analyst_slug: string | null; memo_id: string | null; as_of: string }>("master_alerts", "select=ticker,alert_type,note,analyst_slug,memo_id,as_of&order=as_of.desc&limit=60"),
    db.select<{ ticker: string; company_name: string | null; mcs: string | null; rank: number | null }>("latest_master_scores", "select=ticker,company_name,mcs,rank&disqualified=eq.false&order=rank.asc&limit=40"),
    db.selectAll<{ ticker: string; symbol: string }>("hermes_ideas", "select=ticker,symbol&stage=neq.archive"),
    db.selectAll<{ ticker: string; symbol: string | null; company_name: string | null }>("investment_companies", "select=ticker,symbol,company_name"),
  ]);

  const taken = new Set(existing.map((e) => e.symbol.toUpperCase()));
  const canonicalBySymbol = new Map<string, { ticker: string; name: string | null }>();
  for (const c of companies) if (c.symbol) canonicalBySymbol.set(c.symbol.toUpperCase(), { ticker: c.ticker, name: c.company_name });
  const bestMemo = new Map<string, (typeof universe)[number]>();
  for (const u of universe) {
    const key = u.symbol.toUpperCase();
    const prev = bestMemo.get(key);
    if (!prev || Number(u.memo_expected_irr ?? -1) > Number(prev.memo_expected_irr ?? -1)) bestMemo.set(key, u);
  }
  const bare = (t: string) => (t.includes(":") ? t.split(":")[1]! : t).toUpperCase();
  const canonical = (t: string) => (t.includes(":") ? t.toUpperCase() : canonicalBySymbol.get(t.toUpperCase())?.ticker ?? t.toUpperCase());

  const rows: Record<string, unknown>[] = [];
  const order: Record<string, number> = { sourcing: 0, diligence: 0, live: 0, monitor: 0 };
  const push = (row: Record<string, unknown>) => {
    const sym = bare(String(row.ticker));
    if (taken.has(sym)) return;
    taken.add(sym);
    const stage = String(row.stage);
    order[stage] = (order[stage] ?? 0) + 1000;
    rows.push({ owner: "hermes-seed", ...row, sort_order: order[stage] });
  };

  // monitor: open recommendations + approaching/pierced triggers
  for (const r of recs) {
    const memo = bestMemo.get(bare(r.ticker));
    const refs = Array.isArray(r.memo_refs) ? (r.memo_refs as Array<{ lens?: string; memo_id?: string; verdict?: string }>) : [];
    push({ ticker: canonical(r.ticker), company_name: memo?.company_name ?? canonicalBySymbol.get(bare(r.ticker))?.name ?? null, stage: "monitor", persona_slug: refs[0]?.lens ?? memo?.analyst_slug ?? null, memo_id: refs[0]?.memo_id ?? memo?.memo_id ?? null, next_action: `${r.action}: ${r.size_suggestion ?? "review"}`, current_weight_pct: r.current_weight_pct !== null ? Number(r.current_weight_pct) : null, tags: ["master-recommendation", r.action.toLowerCase()], source: "master_recommendation", source_ref: { recommendation_id: r.id, action: r.action } });
  }
  const seenAlert = new Set<string>();
  for (const a of alerts) {
    if (seenAlert.has(a.ticker)) continue;
    seenAlert.add(a.ticker);
    const memo = bestMemo.get(bare(a.ticker));
    push({ ticker: canonical(a.ticker), company_name: memo?.company_name ?? null, stage: "monitor", persona_slug: a.analyst_slug, memo_id: a.memo_id ?? memo?.memo_id ?? null, next_action: a.note, catalyst: `Trigger ${a.alert_type.replace(/_/g, " ")}`, tags: ["trigger", a.alert_type], source: "master_alert", source_ref: { alert_type: a.alert_type, as_of: a.as_of }, current_weight_pct: memo?.held_weight !== null && memo?.held_weight !== undefined ? Number(memo.held_weight) : null });
  }

  // live: held ≥ 0.75% with a memo
  for (const p of positions) {
    const w = Number(p.pct_of_nav ?? 0);
    if (w < 0.0075) continue;
    const memo = bestMemo.get(p.symbol.toUpperCase());
    if (!memo) continue;
    push({ ticker: memo.ticker, company_name: p.company_name, stage: "live", persona_slug: memo.analyst_slug, memo_id: memo.memo_id, current_weight_pct: w, conviction: memo.verdict === "BUY-MORE" ? 5 : memo.verdict === "BUY" ? 4 : memo.verdict === "MAINTAIN" ? 3 : 2, next_action: memo.reunderwrite_trigger_price ? `Re-underwrite below ${memo.reunderwrite_trigger_price}` : null, tags: ["held", memo.verdict.toLowerCase()], source: "position", source_ref: { pct_of_nav: w } });
  }

  // diligence: legacy ranked seeds + strong un-held BUYs
  for (const s of seeds.filter((x) => x.list === "ranked")) {
    const memo = bestMemo.get(s.ticker.toUpperCase());
    push({ ticker: canonical(s.ticker), company_name: s.name, stage: "diligence", persona_slug: memo?.analyst_slug ?? null, memo_id: memo?.memo_id ?? null, thesis: s.thesis, why_beat_qqq: s.whyBeatQqq, falsifier: s.falsifier, next_action: s.nextAction, conviction: Math.max(1, Math.min(5, Math.round(s.score / 20))), tags: ["north-star-seed", s.category], source: "north_star_seed", source_ref: { evidence_needed: s.evidenceNeeded, north_star_score: s.score } });
  }
  for (const u of universe) {
    if (!["BUY", "BUY-MORE"].includes(u.verdict) || Number(u.memo_expected_irr ?? 0) < 0.2 || Number(u.held_weight ?? 0) > 0) continue;
    if (rows.length > 120) break;
    push({ ticker: u.ticker, company_name: u.company_name, stage: "diligence", persona_slug: u.analyst_slug, memo_id: u.memo_id, conviction: 3, next_action: u.buy_consideration_price ? `Stage entry at or below ${u.buy_consideration_price}` : "Confirm entry price", tags: ["memo-buy", u.analyst_slug], source: "memo", source_ref: { expected_irr: Number(u.memo_expected_irr) } });
  }

  // sourcing: watchlist seeds + master conviction leaders
  for (const s of seeds.filter((x) => x.list === "watchlist")) {
    const memo = bestMemo.get(s.ticker.toUpperCase());
    push({ ticker: canonical(s.ticker), company_name: s.name, stage: "sourcing", persona_slug: memo?.analyst_slug ?? null, memo_id: memo?.memo_id ?? null, thesis: s.thesis, why_beat_qqq: s.whyBeatQqq, falsifier: s.falsifier, next_action: s.nextAction, conviction: Math.max(1, Math.min(5, Math.round(s.score / 20))), tags: ["north-star-watchlist", s.category], source: "north_star_seed", source_ref: { evidence_needed: s.evidenceNeeded, north_star_score: s.score } });
  }
  for (const s of scores.slice(0, 20)) {
    const memo = bestMemo.get(bare(s.ticker));
    push({ ticker: canonical(s.ticker), company_name: s.company_name ?? memo?.company_name ?? null, stage: "sourcing", persona_slug: memo?.analyst_slug ?? null, memo_id: memo?.memo_id ?? null, next_action: `Master conviction rank ${s.rank} (MCS ${s.mcs}) — decide whether to underwrite`, tags: ["master-score"], source: "master_score", source_ref: { mcs: Number(s.mcs), rank: s.rank } });
  }

  if (emitTo) {
    fs.mkdirSync(path.dirname(path.resolve(emitTo)), { recursive: true });
    fs.writeFileSync(emitTo, toInsertSql("hermes_ideas", rows));
    log(`wrote ${rows.length} cards as SQL to ${emitTo} (not executed)`);
  } else {
    for (const batch of chunk(rows, 50)) await db.insert("hermes_ideas", batch);
    log(`inserted ${rows.length} cards (existing cards untouched)`);
  }
  const byStage = new Map<string, number>();
  for (const r of rows) byStage.set(String(r.stage), (byStage.get(String(r.stage)) ?? 0) + 1);
  console.table(Array.from(byStage, ([stage, count]) => ({ stage, count })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

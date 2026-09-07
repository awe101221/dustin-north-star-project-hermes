import { bareSymbol, toArray, toRecord, toStringArray } from "@/lib/utils";
import { num, unwrap, type Db } from "./query";
import type { AnalystMemoRow, NoteRow, ResearchStreamRow, SearchHit } from "./types";

// ── Stream ──────────────────────────────────────────────────────────────────

export type StreamItem = {
  id: string;
  kind: string;
  source: "analyst_memos" | "hermes_notes";
  title: string;
  ticker: string | null;
  symbol: string;
  companyName: string | null;
  persona: string | null;
  verdict: string | null;
  sourceSystem: string | null;
  expectedIrr: number | null;
  downside: number | null;
  price: number | null;
  buyPrice: number | null;
  triggerPrice: number | null;
  pwv: number | null;
  tags: string[];
  excerpt: string;
  bodyLength: number;
  isLatest: boolean;
  occurredAt: string;
};

export function mapStreamRow(r: ResearchStreamRow): StreamItem {
  return {
    id: r.id,
    kind: r.kind,
    source: r.source_table,
    title: r.title,
    ticker: r.ticker,
    symbol: bareSymbol(r.ticker),
    companyName: r.company_name,
    persona: r.persona_slug,
    verdict: r.verdict,
    sourceSystem: r.source_system,
    expectedIrr: num(r.expected_irr),
    downside: num(r.downside_drawdown_pct),
    price: num(r.current_price),
    buyPrice: num(r.buy_consideration_price),
    triggerPrice: num(r.reunderwrite_trigger_price),
    pwv: num(r.probability_weighted_value),
    tags: r.tags ?? [],
    excerpt: (r.excerpt ?? "").replace(/^#.*\n/, "").trim(),
    bodyLength: r.body_length ?? 0,
    isLatest: Boolean(r.is_latest),
    occurredAt: r.occurred_at ?? r.created_at,
  };
}

export type StreamFilter = {
  persona?: string | null;
  verdict?: string | null;
  kind?: string | null; // memo | note | journal | ...
  ticker?: string | null;
  tag?: string | null;
  latestOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function getResearchStream(db: Db, filter: StreamFilter = {}): Promise<StreamItem[]> {
  const limit = filter.limit ?? 60;
  let q = db.from("hermes_research_stream").select("*").order("occurred_at", { ascending: false, nullsFirst: false });
  if (filter.latestOnly !== false) q = q.eq("is_latest", true);
  if (filter.persona) q = q.eq("persona_slug", filter.persona);
  if (filter.verdict) q = q.eq("verdict", filter.verdict.toUpperCase());
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.ticker) {
    const sym = bareSymbol(filter.ticker);
    q = q.or(`ticker.eq.${filter.ticker.toUpperCase()},ticker.ilike.%:${sym},ticker.eq.${sym}`);
  }
  if (filter.tag) q = q.contains("tags", [filter.tag]);
  q = q.range(filter.offset ?? 0, (filter.offset ?? 0) + limit - 1);
  const rows = unwrap(await q, "research stream") as ResearchStreamRow[];
  return rows.map(mapStreamRow);
}

export async function searchResearch(db: Db, query: string, limit = 40): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = unwrap(await db.rpc("hermes_search_research", { q, lim: limit }), "search") as SearchHit[];
  return rows;
}

// ── Memo detail ─────────────────────────────────────────────────────────────

export type Gate = { slug: string; status: "pass" | "fail" | "ungated"; value: number | string | null; evidence: string | null; sourcePath: string | null; checkedBy: string | null };

export type Memo = {
  id: string;
  persona: string;
  ticker: string;
  symbol: string;
  companyName: string | null;
  sourceSystem: string | null;
  status: string;
  verdict: string;
  horizonYears: number | null;
  price: number | null;
  buyPrice: number | null;
  triggerPrice: number | null;
  pwv: number | null;
  expectedIrr: number | null;
  downside: number | null;
  mathMustWork: boolean | null;
  differentiation: number | null;
  positionContext: Record<string, unknown>;
  markdown: string;
  thesisBullets: Array<{ text: string; type?: string; source?: string }>;
  valuation: Record<string, unknown>;
  scenarios: Array<{ name: string; probability: number | null; irr: number | null; y5Price: number | null; iv: number | null; narrative: string | null }>;
  kpis: Array<Record<string, unknown>>;
  catalysts: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  actionPlan: Array<Record<string, unknown>>;
  dataSources: Array<Record<string, unknown>>;
  companyMetadata: Record<string, unknown>;
  gates: Gate[];
  analyzedAt: string | null;
  createdAt: string;
};

function mapBullets(value: unknown) {
  return toArray(value)
    .map((item) => {
      if (typeof item === "string") return { text: item };
      const rec = toRecord(item);
      const text = rec.text ?? rec.thesis ?? rec.claim ?? rec.bullet;
      return typeof text === "string" ? { text, type: typeof rec.type === "string" ? rec.type : undefined, source: typeof rec.source === "string" ? rec.source : undefined } : null;
    })
    .filter((x): x is { text: string; type?: string; source?: string } => Boolean(x));
}

function mapGates(value: unknown): Gate[] {
  const rec = toRecord(value);
  return Object.entries(rec)
    .map(([slug, raw]) => {
      const g = toRecord(raw);
      const status = g.status === "pass" || g.status === "fail" ? g.status : "ungated";
      return {
        slug,
        status: status as Gate["status"],
        value: typeof g.value === "number" || typeof g.value === "string" ? g.value : null,
        evidence: typeof g.evidence === "string" ? g.evidence : null,
        sourcePath: typeof g.source_path === "string" ? g.source_path : null,
        checkedBy: typeof g.checked_by === "string" ? g.checked_by : null,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function mapScenarios(valuation: Record<string, unknown>) {
  const sc = toRecord(valuation.scenarios);
  return ["bear", "base", "bull"]
    .filter((k) => k in sc)
    .map((name) => {
      const s = toRecord(sc[name]);
      return {
        name,
        probability: num(s.probability),
        irr: num(s.irr_5y),
        y5Price: num(s.y5_price ?? s.value_per_share_y5),
        iv: num(s.iv_per_share),
        narrative: typeof s.narrative === "string" ? s.narrative : null,
      };
    });
}

export function mapMemo(row: AnalystMemoRow): Memo {
  const valuation = toRecord(row.valuation);
  return {
    id: row.id,
    persona: row.analyst_slug,
    ticker: row.ticker,
    symbol: bareSymbol(row.ticker),
    companyName: row.company_name,
    sourceSystem: row.source_system,
    status: row.status,
    verdict: (row.verdict ?? "WATCH").toUpperCase(),
    horizonYears: num(row.horizon_years),
    price: num(row.current_price),
    buyPrice: num(row.buy_consideration_price),
    triggerPrice: num(row.reunderwrite_trigger_price),
    pwv: num(row.probability_weighted_value),
    expectedIrr: num(row.expected_irr),
    downside: num(row.downside_drawdown_pct),
    mathMustWork: row.math_must_work,
    differentiation: num(row.differentiation_score),
    positionContext: toRecord(row.position_context),
    markdown: row.memo_markdown ?? "",
    thesisBullets: mapBullets(row.thesis_bullets),
    valuation,
    scenarios: mapScenarios(valuation),
    kpis: toArray(row.kpis).map(toRecord),
    catalysts: toArray(row.catalysts).map(toRecord),
    risks: toArray(row.risks).map(toRecord),
    actionPlan: toArray(row.action_plan).map(toRecord),
    dataSources: toArray(row.data_sources).map(toRecord),
    companyMetadata: toRecord(row.company_metadata),
    gates: mapGates(row.gates),
    analyzedAt: row.analyzed_at,
    createdAt: row.created_at,
  };
}

export async function getMemo(db: Db, id: string): Promise<Memo | null> {
  const rows = unwrap(await db.from("analyst_memos").select("*").eq("id", id).limit(1), "memo") as AnalystMemoRow[];
  return rows[0] ? mapMemo(rows[0]) : null;
}

export async function getMemosForTicker(db: Db, ticker: string, limit = 30): Promise<Memo[]> {
  const sym = bareSymbol(ticker);
  const rows = unwrap(
    await db
      .from("analyst_memos")
      .select("*")
      .or(`ticker.eq.${ticker.toUpperCase()},ticker.ilike.%:${sym},ticker.eq.${sym}`)
      .eq("status", "complete")
      .order("analyzed_at", { ascending: false })
      .limit(limit),
    "memos for ticker",
  ) as AnalystMemoRow[];
  return rows.map(mapMemo);
}

export type MemoSummary = {
  id: string;
  persona: string;
  ticker: string;
  companyName: string | null;
  verdict: string;
  status: string;
  sourceSystem: string | null;
  price: number | null;
  expectedIrr: number | null;
  downside: number | null;
  pwv: number | null;
  buyPrice: number | null;
  triggerPrice: number | null;
  analyzedAt: string | null;
};

/** Light memo rows (no markdown) for company pages and agent context. */
export async function getMemoSummariesForTicker(db: Db, ticker: string, limit = 40): Promise<MemoSummary[]> {
  const sym = bareSymbol(ticker);
  const rows = unwrap(
    await db
      .from("analyst_memos")
      .select("id, analyst_slug, ticker, company_name, verdict, status, source_system, current_price, expected_irr, downside_drawdown_pct, probability_weighted_value, buy_consideration_price, reunderwrite_trigger_price, analyzed_at")
      .or(`ticker.eq.${ticker.toUpperCase()},ticker.ilike.%:${sym},ticker.eq.${sym}`)
      .eq("status", "complete")
      .order("analyzed_at", { ascending: false })
      .limit(limit),
    "memo summaries",
  ) as Array<Pick<AnalystMemoRow, "id" | "analyst_slug" | "ticker" | "company_name" | "verdict" | "status" | "source_system" | "current_price" | "expected_irr" | "downside_drawdown_pct" | "probability_weighted_value" | "buy_consideration_price" | "reunderwrite_trigger_price" | "analyzed_at">>;
  return rows.map((r) => ({
    id: r.id,
    persona: r.analyst_slug,
    ticker: r.ticker,
    companyName: r.company_name,
    verdict: r.verdict,
    status: r.status,
    sourceSystem: r.source_system,
    price: num(r.current_price),
    expectedIrr: num(r.expected_irr),
    downside: num(r.downside_drawdown_pct),
    pwv: num(r.probability_weighted_value),
    buyPrice: num(r.buy_consideration_price),
    triggerPrice: num(r.reunderwrite_trigger_price),
    analyzedAt: r.analyzed_at,
  }));
}

export async function getMemoHistory(db: Db, persona: string, ticker: string, limit = 20) {
  const rows = unwrap(
    await db
      .from("analyst_memos")
      .select("id, analyst_slug, ticker, verdict, status, source_system, current_price, expected_irr, probability_weighted_value, analyzed_at")
      .eq("analyst_slug", persona)
      .ilike("ticker", ticker)
      .order("analyzed_at", { ascending: false })
      .limit(limit),
    "memo history",
  ) as Array<Pick<AnalystMemoRow, "id" | "analyst_slug" | "ticker" | "verdict" | "status" | "source_system" | "current_price" | "expected_irr" | "probability_weighted_value" | "analyzed_at">>;
  return rows.map((r) => ({
    id: r.id,
    verdict: r.verdict,
    status: r.status,
    sourceSystem: r.source_system,
    price: num(r.current_price),
    expectedIrr: num(r.expected_irr),
    pwv: num(r.probability_weighted_value),
    analyzedAt: r.analyzed_at,
  }));
}

// ── Notes ───────────────────────────────────────────────────────────────────

export type Note = {
  id: string;
  kind: NoteRow["kind"];
  title: string;
  body: string;
  tickers: string[];
  tags: string[];
  persona: string | null;
  ideaId: string | null;
  linkedMemoId: string | null;
  verdict: string | null;
  conviction: number | null;
  author: string;
  sourceSystem: string;
  pinned: boolean;
  occurredAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function mapNote(r: NoteRow): Note {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body_md,
    tickers: r.tickers ?? [],
    tags: r.tags ?? [],
    persona: r.persona_slug,
    ideaId: r.idea_id,
    linkedMemoId: r.linked_memo_id,
    verdict: r.verdict,
    conviction: r.conviction,
    author: r.author,
    sourceSystem: r.source_system,
    pinned: r.is_pinned,
    occurredAt: r.occurred_at,
    metadata: toRecord(r.metadata),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getNote(db: Db, id: string): Promise<Note | null> {
  const rows = unwrap(await db.from("hermes_notes").select("*").eq("id", id).limit(1), "note") as NoteRow[];
  return rows[0] ? mapNote(rows[0]) : null;
}

export async function getNotes(db: Db, opts: { limit?: number; ticker?: string; ideaId?: string; kind?: string } = {}): Promise<Note[]> {
  let q = db.from("hermes_notes").select("*").order("is_pinned", { ascending: false }).order("occurred_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.ticker) q = q.contains("tickers", [opts.ticker.toUpperCase()]);
  if (opts.ideaId) q = q.eq("idea_id", opts.ideaId);
  if (opts.kind) q = q.eq("kind", opts.kind);
  const rows = unwrap(await q, "notes") as NoteRow[];
  return rows.map(mapNote);
}

/** Tag cloud across notes + memos (verdict/persona/chassis for memos). */
export async function getTagFacets(db: Db): Promise<Array<{ tag: string; count: number }>> {
  const rows = unwrap(await db.from("hermes_research_stream").select("tags").eq("is_latest", true).limit(5000), "tag facets") as Array<{ tags: string[] }>;
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of toStringArray(r.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

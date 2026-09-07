import { num, unwrap, type Db } from "./query";
import type { IdeaEventRow, IdeaRow, IdeaStage } from "./types";

export type Idea = {
  id: string;
  ticker: string;
  symbol: string;
  companyName: string | null;
  stage: IdeaStage;
  sortOrder: number;
  conviction: number | null;
  risk: number | null;
  targetWeight: number | null;
  currentWeight: number | null;
  thesis: string | null;
  whyBeatQqq: string | null;
  falsifier: string | null;
  catalyst: string | null;
  nextAction: string | null;
  persona: string | null;
  memoId: string | null;
  theme: string | null;
  tags: string[];
  source: string;
  sourceRef: Record<string, unknown>;
  owner: string;
  archivedReason: string | null;
  metadata: Record<string, unknown>;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function mapIdea(r: IdeaRow): Idea {
  return {
    id: r.id,
    ticker: r.ticker,
    symbol: r.symbol,
    companyName: r.company_name,
    stage: r.stage,
    sortOrder: r.sort_order,
    conviction: r.conviction,
    risk: r.risk_score,
    targetWeight: num(r.target_weight_pct),
    currentWeight: num(r.current_weight_pct),
    thesis: r.thesis,
    whyBeatQqq: r.why_beat_qqq,
    falsifier: r.falsifier,
    catalyst: r.catalyst,
    nextAction: r.next_action,
    persona: r.persona_slug,
    memoId: r.memo_id,
    theme: r.theme_slug,
    tags: r.tags ?? [],
    source: r.source,
    sourceRef: r.source_ref ?? {},
    owner: r.owner,
    archivedReason: r.archived_reason,
    metadata: r.metadata ?? {},
    stageChangedAt: r.stage_changed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getIdeas(db: Db, opts: { includeArchived?: boolean } = {}): Promise<Idea[]> {
  let q = db.from("hermes_ideas").select("*").order("stage").order("sort_order", { ascending: true }).limit(2000);
  if (!opts.includeArchived) q = q.neq("stage", "archive");
  const rows = unwrap(await q, "ideas") as IdeaRow[];
  return rows.map(mapIdea);
}

export async function getIdea(db: Db, id: string): Promise<Idea | null> {
  const rows = unwrap(await db.from("hermes_ideas").select("*").eq("id", id).limit(1), "idea") as IdeaRow[];
  return rows[0] ? mapIdea(rows[0]) : null;
}

export async function getIdeaForTicker(db: Db, ticker: string): Promise<Idea | null> {
  const rows = unwrap(await db.from("hermes_ideas").select("*").ilike("ticker", ticker).neq("stage", "archive").limit(1), "idea for ticker") as IdeaRow[];
  return rows[0] ? mapIdea(rows[0]) : null;
}

export type IdeaEvent = { id: string; ideaId: string; type: string; from: string | null; to: string | null; actor: string; payload: Record<string, unknown>; createdAt: string };

export async function getIdeaEvents(db: Db, ideaId: string, limit = 50): Promise<IdeaEvent[]> {
  const rows = unwrap(await db.from("hermes_idea_events").select("*").eq("idea_id", ideaId).order("created_at", { ascending: false }).limit(limit), "idea events") as IdeaEventRow[];
  return rows.map((r) => ({ id: r.id, ideaId: r.idea_id, type: r.event_type, from: r.from_stage, to: r.to_stage, actor: r.actor, payload: r.payload ?? {}, createdAt: r.created_at }));
}

export const STAGE_META: Record<IdeaStage, { label: string; hint: string; tone: string }> = {
  sourcing: { label: "Sourcing", hint: "Screens, gurus, themes, agents — anything worth a look", tone: "info" },
  diligence: { label: "Diligence", hint: "Underwriting in progress: memo, gates, falsifiers, sizing", tone: "cyan" },
  live: { label: "Live", hint: "Held. Thesis and sizing are on the book", tone: "pos" },
  monitor: { label: "Monitor", hint: "Triggers armed, trims proposed, re-underwrites pending", tone: "warn" },
  archive: { label: "Archive", hint: "Passed, exited or thesis broken — kept for the record", tone: "muted" },
};

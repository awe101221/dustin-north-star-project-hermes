import { getIdeas, type Idea } from "@/lib/db/pipeline";
import { unwrap, type Db } from "@/lib/db/query";
import type { IdeaStage, NoteRow } from "@/lib/db/types";

export const BEST_IDEAS_SNAPSHOT_TAG = "best-ideas-snapshot";
export const HERMES_BEST_IDEAS_MANDATE =
  "Hermes-ranked Top 10 and Watchlist 10: the app exists to surface Dustin North Star Project Hermes's best current ideas to beat QQQ over 10 years.";
export const QQQ_LINE_HURDLE_LABEL = "12% modeled 5y IRR hurdle";

export type QqqLinePosition = "above" | "below";

export type BestIdeaInput = Pick<
  Idea,
  | "id"
  | "ticker"
  | "symbol"
  | "companyName"
  | "stage"
  | "conviction"
  | "risk"
  | "targetWeight"
  | "currentWeight"
  | "thesis"
  | "whyBeatQqq"
  | "falsifier"
  | "catalyst"
  | "nextAction"
  | "persona"
  | "theme"
  | "tags"
  | "updatedAt"
>;

export type RankedBestIdea = BestIdeaInput & {
  rank: number;
  score: number;
  lane: "top-ten" | "watchlist";
  scoreLabel: string;
  qqqQuestion: string;
  qqqLine: QqqLinePosition;
  qqqLineReason: string | null;
  modeledReturn: number | null;
  missing: string[];
  source?: "hermes-snapshot" | "idea-table";
};

export type QqqLineInSand = {
  hurdleLabel: string;
  lastPriceRefresh: string | null;
  lineIndex: number;
  above: RankedBestIdea[];
  below: RankedBestIdea[];
  firstBelow: RankedBestIdea | null;
};

export type BestIdeasDashboard = {
  mandate: string;
  generatedBy: "Hermes";
  benchmark: "QQQ";
  horizonYears: 10;
  lastUpdated: string | null;
  sourceMode: "hermes-snapshot" | "idea-table";
  snapshotThesis: string | null;
  snapshotId: string | null;
  topTen: RankedBestIdea[];
  watchlistTen: RankedBestIdea[];
  totalActive: number;
};

export type SnapshotIdeaInput = {
  ticker: string;
  companyName?: string | null;
  thesis?: string | null;
  whyBeatQqq?: string | null;
  falsifier?: string | null;
  nextAction?: string | null;
  conviction?: number | null;
  risk?: number | null;
  targetWeight?: number | null;
  currentWeight?: number | null;
  score?: number | null;
  theme?: string | null;
  persona?: string | null;
  qqqLine?: QqqLinePosition | null;
  qqqLineReason?: string | null;
  modeledReturn?: number | null;
  tags?: string[];
};

export type BestIdeasSnapshotInput = {
  asOf?: string | null;
  thesis?: string | null;
  topTen: SnapshotIdeaInput[];
  watchlistTen: SnapshotIdeaInput[];
};

export type NormalizedBestIdeasSnapshot = {
  asOf: string;
  thesis: string | null;
  topTen: RankedBestIdea[];
  watchlistTen: RankedBestIdea[];
};

const STAGE_BONUS: Record<IdeaStage, number> = {
  live: 10,
  diligence: 8,
  monitor: 4,
  sourcing: 2,
  archive: -1000,
};

function textScore(value: string | null | undefined, points: number) {
  return value && value.trim().length >= 12 ? points : 0;
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanTicker(value: string) {
  return value.trim().toUpperCase();
}

function symbolFromTicker(ticker: string) {
  return ticker.includes(":") ? ticker.split(":").pop()! : ticker;
}

function missingFields(idea: BestIdeaInput) {
  const missing: string[] = [];
  if (!idea.thesis?.trim()) missing.push("thesis");
  if (!idea.whyBeatQqq?.trim()) missing.push("QQQ case");
  if (!idea.falsifier?.trim()) missing.push("falsifier");
  if (idea.conviction === null) missing.push("conviction");
  if (idea.risk === null) missing.push("risk");
  return missing;
}

function qqqLineFromTags(tags: string[] | null | undefined): QqqLinePosition | null {
  const normalized = (tags ?? []).map((tag) => tag.toLowerCase());
  if (normalized.some((tag) => ["above-qqq-line", "qqq-line-above", "qqq-beating"].includes(tag))) return "above";
  if (normalized.some((tag) => ["below-qqq-line", "qqq-line-below", "qqq-not-beating"].includes(tag))) return "below";
  return null;
}

function inferredQqqLine(idea: BestIdeaInput, score: number): QqqLinePosition {
  const tagged = qqqLineFromTags(idea.tags);
  if (tagged) return tagged;
  return score >= 75 && Boolean(idea.whyBeatQqq?.trim()) ? "above" : "below";
}

export function scoreBestIdea(idea: BestIdeaInput) {
  const conviction = idea.conviction ?? 0;
  const risk = idea.risk ?? 55;
  const targetWeight = idea.targetWeight ?? 0;
  const currentWeight = idea.currentWeight ?? 0;
  const hasQqqCase = Boolean(idea.whyBeatQqq?.trim());
  const hasFalsifier = Boolean(idea.falsifier?.trim());
  const completeness = textScore(idea.thesis, 8) + textScore(idea.whyBeatQqq, 22) + textScore(idea.falsifier, 10);
  const missingPenalty = (hasQqqCase ? 0 : 22) + (hasFalsifier ? 0 : 10);
  const sizingSignal = Math.min(Math.max(targetWeight, currentWeight) * 100, 10);
  return Math.round((conviction * 1.1 + STAGE_BONUS[idea.stage] + completeness + sizingSignal - risk * 0.6 - missingPenalty) * 10) / 10;
}

function rankIdeas(ideas: BestIdeaInput[], lane: RankedBestIdea["lane"]): RankedBestIdea[] {
  return ideas.map((idea, index) => {
    const score = scoreBestIdea(idea);
    return {
      ...idea,
      rank: index + 1,
      score,
      lane,
      scoreLabel: `${Math.round(score)}`,
      qqqQuestion: idea.whyBeatQqq?.trim() || "Needs a fresh Hermes QQQ-relative underwrite.",
      qqqLine: inferredQqqLine(idea, score),
      qqqLineReason: null,
      modeledReturn: null,
      missing: missingFields(idea),
      source: "idea-table",
    };
  });
}

function rankSnapshotIdeas(ideas: SnapshotIdeaInput[], lane: RankedBestIdea["lane"], asOf: string): RankedBestIdea[] {
  return ideas.slice(0, 10).map((raw, index) => {
    const ticker = cleanTicker(raw.ticker);
    const score = raw.score ?? raw.conviction ?? 0;
    const idea: BestIdeaInput = {
      id: `${lane}-${index + 1}-${ticker}`,
      ticker,
      symbol: symbolFromTicker(ticker),
      companyName: cleanText(raw.companyName),
      stage: lane === "top-ten" ? "diligence" : "sourcing",
      conviction: raw.conviction ?? null,
      risk: raw.risk ?? null,
      targetWeight: raw.targetWeight ?? null,
      currentWeight: raw.currentWeight ?? null,
      thesis: cleanText(raw.thesis),
      whyBeatQqq: cleanText(raw.whyBeatQqq),
      falsifier: cleanText(raw.falsifier),
      catalyst: null,
      nextAction: cleanText(raw.nextAction),
      persona: cleanText(raw.persona) ?? "hermes-pm",
      theme: cleanText(raw.theme),
      tags: raw.tags ?? ["hermes-ranked"],
      updatedAt: asOf,
    };
    return {
      ...idea,
      rank: index + 1,
      score,
      lane,
      scoreLabel: `${Math.round(score)}`,
      qqqQuestion: idea.whyBeatQqq ?? "Needs a fresh Hermes QQQ-relative underwrite.",
      qqqLine: raw.qqqLine ?? qqqLineFromTags(idea.tags) ?? inferredQqqLine(idea, score),
      qqqLineReason: cleanText(raw.qqqLineReason),
      modeledReturn: raw.modeledReturn ?? null,
      missing: missingFields(idea),
      source: "hermes-snapshot",
    };
  });
}

export function normalizeBestIdeasSnapshot(input: BestIdeasSnapshotInput): NormalizedBestIdeasSnapshot {
  const asOf = input.asOf && !Number.isNaN(Date.parse(input.asOf)) ? new Date(input.asOf).toISOString() : new Date().toISOString();
  return {
    asOf,
    thesis: cleanText(input.thesis),
    topTen: rankSnapshotIdeas(input.topTen, "top-ten", asOf),
    watchlistTen: rankSnapshotIdeas(input.watchlistTen, "watchlist", asOf),
  };
}

export function getQqqLineInSand(dashboard: BestIdeasDashboard): QqqLineInSand {
  const ordered = [...dashboard.topTen, ...dashboard.watchlistTen];
  const above = ordered.filter((idea) => idea.qqqLine === "above");
  const below = ordered.filter((idea) => idea.qqqLine === "below");
  return {
    hurdleLabel: QQQ_LINE_HURDLE_LABEL,
    lastPriceRefresh: dashboard.lastUpdated,
    lineIndex: above.length,
    above,
    below,
    firstBelow: below[0] ?? null,
  };
}

export function snapshotToDashboard(snapshot: NormalizedBestIdeasSnapshot, snapshotId: string | null = null): BestIdeasDashboard {
  return {
    mandate: HERMES_BEST_IDEAS_MANDATE,
    generatedBy: "Hermes",
    benchmark: "QQQ",
    horizonYears: 10,
    lastUpdated: snapshot.asOf,
    sourceMode: "hermes-snapshot",
    snapshotThesis: snapshot.thesis,
    snapshotId,
    topTen: snapshot.topTen,
    watchlistTen: snapshot.watchlistTen,
    totalActive: snapshot.topTen.length + snapshot.watchlistTen.length,
  };
}

function isSnapshotInput(value: unknown): value is BestIdeasSnapshotInput {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return Array.isArray(rec.topTen) && Array.isArray(rec.watchlistTen);
}

export function snapshotMetadataToDashboard(metadata: Record<string, unknown>, snapshotId: string | null = null): BestIdeasDashboard | null {
  const raw = metadata.bestIdeas;
  if (!isSnapshotInput(raw)) return null;
  return snapshotToDashboard(normalizeBestIdeasSnapshot(raw), snapshotId);
}

export function buildBestIdeas(ideas: BestIdeaInput[]): BestIdeasDashboard {
  const active = ideas
    .filter((idea) => idea.stage !== "archive")
    .map((idea) => ({ idea, score: scoreBestIdea(idea) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aUpdated = Date.parse(a.idea.updatedAt);
      const bUpdated = Date.parse(b.idea.updatedAt);
      return (Number.isFinite(bUpdated) ? bUpdated : 0) - (Number.isFinite(aUpdated) ? aUpdated : 0);
    })
    .map((x) => x.idea);

  const topTenRaw = active.slice(0, 10);
  const watchlistRaw = active.slice(10, 20);
  const timestamps = active.map((idea) => Date.parse(idea.updatedAt)).filter(Number.isFinite);
  const lastUpdated = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;

  return {
    mandate: HERMES_BEST_IDEAS_MANDATE,
    generatedBy: "Hermes",
    benchmark: "QQQ",
    horizonYears: 10,
    lastUpdated,
    sourceMode: "idea-table",
    snapshotThesis: null,
    snapshotId: null,
    topTen: rankIdeas(topTenRaw, "top-ten"),
    watchlistTen: rankIdeas(watchlistRaw, "watchlist"),
    totalActive: active.length,
  };
}

export async function getLatestBestIdeasSnapshot(db: Db): Promise<BestIdeasDashboard | null> {
  const rows = unwrap(
    await db
      .from("hermes_notes")
      .select("id, metadata")
      .contains("tags", [BEST_IDEAS_SNAPSHOT_TAG])
      .eq("kind", "agent")
      .order("occurred_at", { ascending: false })
      .limit(1),
    "best ideas snapshot",
  ) as Pick<NoteRow, "id" | "metadata">[];
  const row = rows[0];
  return row ? snapshotMetadataToDashboard(row.metadata ?? {}, row.id) : null;
}

export async function getBestIdeasDashboard(db: Db): Promise<BestIdeasDashboard> {
  const snapshot = await getLatestBestIdeasSnapshot(db);
  if (snapshot) return snapshot;
  const ideas = await getIdeas(db);
  return buildBestIdeas(ideas);
}

function snapshotMarkdown(snapshot: NormalizedBestIdeasSnapshot) {
  const lines = [
    "# Hermes Best Ideas Snapshot",
    "",
    snapshot.thesis ?? HERMES_BEST_IDEAS_MANDATE,
    "",
    "## Top 10",
    ...snapshot.topTen.map((idea) => `${idea.rank}. ${idea.ticker} — ${idea.thesis ?? "Needs thesis"}`),
    "",
    "## Watchlist 10",
    ...snapshot.watchlistTen.map((idea) => `${idea.rank}. ${idea.ticker} — ${idea.thesis ?? "Needs thesis"}`),
  ];
  return lines.join("\n");
}

export function bestIdeasSnapshotNote(input: BestIdeasSnapshotInput, actor = "hermes") {
  const snapshot = normalizeBestIdeasSnapshot(input);
  const tickers = [...snapshot.topTen, ...snapshot.watchlistTen].map((idea) => idea.ticker);
  return {
    kind: "agent" as const,
    title: `Hermes Best Ideas Snapshot — ${snapshot.asOf.slice(0, 10)}`,
    body_md: snapshotMarkdown(snapshot),
    tickers,
    tags: [BEST_IDEAS_SNAPSHOT_TAG, "hermes-ranked", "qqq-10y"],
    persona_slug: "hermes-pm",
    verdict: "WATCH",
    author: actor,
    source_system: "hermes_agent",
    is_pinned: true,
    occurred_at: snapshot.asOf,
    metadata: { bestIdeas: { asOf: snapshot.asOf, thesis: snapshot.thesis, topTen: input.topTen.slice(0, 10), watchlistTen: input.watchlistTen.slice(0, 10) } },
  };
}

import type { BestIdeasDashboard, RankedBestIdea } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import { bareSymbol, clamp, toRecord } from "@/lib/utils";

export const CHALLENGER_HURDLE = 0.15;
const DAY = 86_400_000;
export const CHALLENGER_DISPOSITIONS = ["admit", "first alternate", "watch / price trigger", "owned-position review", "reject"] as const;
export type ChallengerDisposition = typeof CHALLENGER_DISPOSITIONS[number];
export type ChallengerGate = "clear" | "evidence blocked" | "stale model" | "pending refresh";
type Comparison = "above" | "equal" | "below" | "unavailable";

/** Read-only metadata.challenger contract; see docs/challengers.md for units and gates. */
export type ChallengerMetadata = {
  discoveryLane: string;
  expectedIrr: number | null;
  requiredIrr: number | null;
  hurdlePrice: number | null;
  currentPrice: number | null;
  evidenceGrade: "A" | "B" | "C" | "D" | null;
  portfolioFit: number | null;
  modelAsOf: string | null;
  nextEventAt: string | null;
  reviewStatus: string | null;
  admissionDecision: ChallengerDisposition | null;
};
export type ChallengerCandidate = Idea & ChallengerMetadata & {
  gateStatus: ChallengerGate;
  disposition: ChallengerDisposition;
  missing: string[];
  gateReasons: string[];
  topTenComparison: Comparison;
  watchlistComparison: Comparison;
  clearsHurdle: boolean;
  score: number | null;
};
export type ChallengerBoard = {
  asOf: string;
  rankingAsOf: string | null;
  sourceMode: BestIdeasDashboard["sourceMode"];
  incumbentFloors: { topTenTicker: string | null; topTenReturn: number | null; watchlistTicker: string | null; watchlistReturn: number | null };
  candidates: ChallengerCandidate[];
  lanes: { lane: string; count: number }[];
  summary: { total: number; clearsHurdle: number; firstAlternates: number; blocked: number; admitted: number; ownedReviews: number; rejected: number };
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ratio(value: unknown): number | null {
  const percent = typeof value === "string" && value.trim().endsWith("%");
  const number = numeric(percent ? value.trim().slice(0, -1) : value);
  return number === null ? null : percent || Math.abs(number) > 1 ? number / 100 : number;
}

function positive(value: unknown): number | null {
  const number = numeric(value);
  return number !== null && number > 0 ? number : null;
}

function date(value: unknown): string | null {
  const input = text(value);
  if (!input || !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(input)) return null;
  const stamp = Date.parse(input);
  if (!Number.isFinite(stamp)) return null;
  const result = new Date(stamp).toISOString();
  // Date.parse rolls invalid calendar dates (e.g. February 30) into March.
  const calendarDate = input.slice(0, 10);
  if (new Date(`${calendarDate}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDate) return null;
  return result;
}

function parseMetadata(metadata: Record<string, unknown>): ChallengerMetadata {
  const raw = toRecord(metadata.challenger);
  const grade = text(raw.evidenceGrade)?.toUpperCase();
  const fit = ratio(raw.portfolioFit);
  const required = ratio(raw.requiredIrr);
  const decision = text(raw.admissionDecision)?.toLowerCase();
  return {
    discoveryLane: text(raw.discoveryLane)?.toLowerCase() ?? "unclassified",
    expectedIrr: ratio(raw.expectedIrr),
    requiredIrr: required !== null && required > 0 ? Math.max(CHALLENGER_HURDLE, required) : null,
    hurdlePrice: positive(raw.hurdlePrice),
    currentPrice: positive(raw.currentPrice),
    evidenceGrade: grade === "A" || grade === "B" || grade === "C" || grade === "D" ? grade : null,
    portfolioFit: fit !== null && fit >= 0 && fit <= 1 ? fit : null,
    modelAsOf: date(raw.modelAsOf),
    nextEventAt: date(raw.nextEventAt),
    reviewStatus: text(raw.reviewStatus)?.toLowerCase() ?? null,
    admissionDecision: CHALLENGER_DISPOSITIONS.find((entry) => entry === decision) ?? null,
  };
}

function floor(ideas: RankedBestIdea[]) {
  const rows = ideas.map((idea) => ({ ticker: idea.ticker, value: ratio(idea.modeledReturn) }));
  // A partially modeled lane cannot establish its weakest incumbent.
  if (!rows.length || rows.some((row) => row.value === null)) return { ticker: null, value: null };
  return rows.sort((a, b) => a.value! - b.value! || a.ticker.localeCompare(b.ticker))[0]!;
}

function compare(value: number | null, incumbent: number | null): Comparison {
  if (value === null || incumbent === null) return "unavailable";
  return Math.abs(value - incumbent) < 1e-9 ? "equal" : value > incumbent ? "above" : "below";
}

function disposition(candidate: ChallengerMetadata, gate: ChallengerGate, owned: boolean, top: Comparison, watch: Comparison): ChallengerDisposition {
  const explicit = candidate.admissionDecision;
  if (explicit === "reject") return explicit;
  if (owned || explicit === "owned-position review") return "owned-position review";
  if (explicit === "watch / price trigger") return explicit;
  const qualifies = gate === "clear" && candidate.expectedIrr !== null && candidate.requiredIrr !== null
    && candidate.expectedIrr >= candidate.requiredIrr && top === "above" && watch === "above";
  if (qualifies) return explicit === "admit" && candidate.reviewStatus === "pm-approved" ? "admit" : "first alternate";
  if (gate === "clear" && watch === "below" && explicit !== "first alternate") return "reject";
  return "watch / price trigger";
}

/** Pure projection: never changes pipeline stages, ranking membership, or portfolio data. */
export function buildChallengerBoard({ dashboard, ideas, now = new Date().toISOString() }: {
  dashboard: BestIdeasDashboard; ideas: Idea[]; now?: string;
}): ChallengerBoard {
  const asOf = date(now);
  if (!asOf) throw new Error("Challenger Board requires a valid as-of date");
  const stamp = Date.parse(asOf);
  const top = floor(dashboard.topTen);
  const watch = floor(dashboard.watchlistTen);
  const current = new Set([...dashboard.topTen, ...dashboard.watchlistTen].map((idea) => bareSymbol(idea.ticker.trim()).trim()));
  const newest = new Map<string, Idea>();
  // Sort before deduplication so equal update timestamps also resolve deterministically.
  const ordered = [...ideas].sort((a, b) => (Date.parse(date(b.updatedAt) ?? "") || 0) - (Date.parse(date(a.updatedAt) ?? "") || 0) || a.id.localeCompare(b.id) || a.ticker.localeCompare(b.ticker));
  for (const idea of ordered) {
    const symbol = bareSymbol(idea.ticker.trim()).trim();
    if (!symbol || current.has(symbol) || newest.has(symbol)) continue;
    newest.set(symbol, idea);
  }
  const candidates = [...newest.values()].filter((idea) => idea.stage !== "archive").map((idea): ChallengerCandidate => {
    const meta = parseMetadata(idea.metadata);
    const raw = toRecord(idea.metadata.challenger);
    const missing: string[] = [];
    for (const [label, value] of [
      ["expected IRR", meta.expectedIrr], ["required IRR", meta.requiredIrr], ["hurdle price", meta.hurdlePrice],
      ["current price", meta.currentPrice], ["evidence grade", meta.evidenceGrade], ["portfolio fit", meta.portfolioFit],
      ["model as-of", meta.modelAsOf], ["review status", meta.reviewStatus], ["thesis", text(idea.thesis)],
      ["QQQ case", text(idea.whyBeatQqq)], ["falsifier", text(idea.falsifier)],
    ] as const) if (value === null) missing.push(label);
    if (meta.discoveryLane === "unclassified") missing.push("discovery lane");
    if (raw.nextEventAt !== null && meta.nextEventAt === null) missing.push("next event date or explicit none");
    if (raw.admissionDecision != null && meta.admissionDecision === null) missing.push("valid admission decision");
    if (meta.modelAsOf && Date.parse(meta.modelAsOf) > stamp) missing.push("model date must not be in the future");
    const gateReasons = missing.map((field) => `Missing or invalid ${field}`);
    if (meta.evidenceGrade === "C" || meta.evidenceGrade === "D") gateReasons.push("Evidence must reach grade A or B");
    const evidenceBlocked = gateReasons.length > 0;
    const stale = meta.modelAsOf !== null && stamp - Date.parse(meta.modelAsOf) >= 45 * DAY;
    const event = meta.nextEventAt !== null && Date.parse(meta.nextEventAt) - stamp <= 14 * DAY;
    const reviewed = meta.reviewStatus === "reviewed" || meta.reviewStatus === "pm-approved";
    if (stale) gateReasons.push("Model is at least 45 days old");
    if (event) gateReasons.push("Event has passed or is within 14 days; refresh required");
    if (!reviewed) gateReasons.push("Independent review is not complete");
    const gateStatus: ChallengerGate = evidenceBlocked ? "evidence blocked" : stale ? "stale model" : event || !reviewed ? "pending refresh" : "clear";
    const topTenComparison = compare(meta.expectedIrr, top.value);
    const watchlistComparison = compare(meta.expectedIrr, watch.value);
    const clearsHurdle = gateStatus === "clear" && meta.expectedIrr !== null && meta.requiredIrr !== null && meta.expectedIrr >= meta.requiredIrr;
    // A triage score, not a forecast probability. Missing components remain unavailable.
    const score = meta.expectedIrr === null || meta.requiredIrr === null || meta.portfolioFit === null || meta.evidenceGrade === null ? null
      : Math.round((40 * clamp(meta.expectedIrr / meta.requiredIrr, 0, 2) / 2
        + ({ A: 40, B: 30, C: 15, D: 0 }[meta.evidenceGrade]) + 20 * meta.portfolioFit) * 10) / 10;
    return { ...idea, ...meta, ticker: idea.ticker.trim().toUpperCase(), symbol: bareSymbol(idea.ticker.trim()).trim(),
      gateStatus, gateReasons, missing, topTenComparison, watchlistComparison, clearsHurdle, score,
      disposition: disposition(meta, gateStatus, idea.currentWeight !== null && idea.currentWeight !== 0, topTenComparison, watchlistComparison) };
  }).sort((a, b) => CHALLENGER_DISPOSITIONS.indexOf(a.disposition) - CHALLENGER_DISPOSITIONS.indexOf(b.disposition)
    || Number(b.gateStatus === "clear") - Number(a.gateStatus === "clear") || (b.score ?? -1) - (a.score ?? -1) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
  const laneCounts = new Map<string, number>();
  for (const candidate of candidates) laneCounts.set(candidate.discoveryLane, (laneCounts.get(candidate.discoveryLane) ?? 0) + 1);
  return {
    asOf, rankingAsOf: dashboard.lastUpdated, sourceMode: dashboard.sourceMode,
    incumbentFloors: { topTenTicker: top.ticker, topTenReturn: top.value, watchlistTicker: watch.ticker, watchlistReturn: watch.value },
    candidates,
    lanes: [...laneCounts].sort(([a], [b]) => a.localeCompare(b)).map(([lane, count]) => ({ lane, count })),
    summary: { total: candidates.length, clearsHurdle: candidates.filter((x) => x.clearsHurdle).length,
      firstAlternates: candidates.filter((x) => x.disposition === "first alternate").length,
      blocked: candidates.filter((x) => x.gateStatus !== "clear").length,
      admitted: candidates.filter((x) => x.disposition === "admit").length,
      ownedReviews: candidates.filter((x) => x.disposition === "owned-position review").length,
      rejected: candidates.filter((x) => x.disposition === "reject").length },
  };
}

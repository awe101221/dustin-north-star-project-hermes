import { CAPITAL_LINE_HURDLE, CAPITAL_LINE_MAX_AGE_DAYS, type BestIdeasDashboard } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import { bareSymbol, toRecord } from "@/lib/utils";

export { CAPITAL_LINE_HURDLE };
export const AI_REGIME_TOURNAMENT_HURDLE = 0.15;
const DAY = 86_400_000;

export const AI_REGIME_DOMAINS = [
  "direct-ai",
  "compute-network-memory-packaging",
  "power-cooling-grid-data-centers",
  "data-application-saas",
  "security-governance",
  "physical-ai-robotics-autonomy",
  "industrial-defense-manufacturing",
  "space-compute-connectivity-launch-manufacturing-ground",
  "key-source-material-component",
  "second-order-services-adapters",
  "threatened-pools",
] as const;
export type AiRegimeDomain = typeof AI_REGIME_DOMAINS[number];

export const AI_REGIME_EXPOSURE_TYPES = ["direct", "enabler", "hidden-beneficiary", "threatened"] as const;
export type AiRegimeExposureType = typeof AI_REGIME_EXPOSURE_TYPES[number];

export const AI_REGIME_SLEEVE_STATUSES = ["candidate", "monitor", "tournament", "top10", "watchlist10"] as const;
export type AiRegimeSleeveStatus = typeof AI_REGIME_SLEEVE_STATUSES[number];

export type AiRegimeGate = "clear" | "evidence blocked" | "stale model" | "pending refresh";

export type AiRegimeRow = Idea & {
  domains: AiRegimeDomain[];
  exposureType: AiRegimeExposureType | null;
  hiddenBeneficiaryReason: string | null;
  valuationArchetype: string | null;
  themeFit: number | null;
  monetizationStage: string | null;
  evidenceGrade: "A" | "B" | "C" | "D" | null;
  modelAsOf: string | null;
  nextEventAt: string | null;
  reviewStatus: string | null;
  requestedSleeveStatus: AiRegimeSleeveStatus | null;
  sleeveStatus: AiRegimeSleeveStatus;
  sleeveRank: number | null;
  fiveYearExpectedIrr: number | null;
  tenYearExpectedIrr: number | null;
  requiredFiveYearIrr: number;
  requiredTenYearIrr: number;
  hurdlePrice: number | null;
  membershipAuthority: string | null;
  membershipBlockedReason: string | null;
  gateStatus: AiRegimeGate;
  missing: string[];
  gateReasons: string[];
  clearsCapitalLine: boolean;
  clearsTournamentHurdle: boolean;
  qqqIsDefault: boolean;
};

export type AiRegimeModule = {
  asOf: string;
  rankingAsOf: string | null;
  sourceMode: BestIdeasDashboard["sourceMode"];
  hasApprovedRoster: boolean;
  emptyState: "No approved sleeve roster yet" | null;
  qqqIsDefault: boolean;
  topTen: AiRegimeRow[];
  watchlistTen: AiRegimeRow[];
  tournament: null;
  queue: AiRegimeRow[];
  taxonomy: { domain: AiRegimeDomain; count: number }[];
  coreOverlap: string[];
  summary: { candidates: number; monitors: number; blocked: number; approvedTopTen: number; approvedWatchlist: number };
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
  const calendarDate = input.slice(0, 10);
  if (new Date(`${calendarDate}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDate) return null;
  return new Date(stamp).toISOString();
}

function parseDomains(value: unknown): AiRegimeDomain[] {
  if (!Array.isArray(value)) return [];
  const domains = value
    .map((entry) => text(entry)?.toLowerCase() ?? "")
    .filter((entry): entry is AiRegimeDomain => AI_REGIME_DOMAINS.includes(entry as AiRegimeDomain));
  return Array.from(new Set(domains));
}

function parseRow(idea: Idea, nowMs: number): AiRegimeRow | null {
  const raw = toRecord(idea.metadata).aiRegime;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = toRecord(raw);
  const domains = parseDomains(record.domains);
  const exposure = text(record.exposureType)?.toLowerCase() ?? null;
  const exposureType = AI_REGIME_EXPOSURE_TYPES.find((entry) => entry === exposure) ?? null;
  const grade = text(record.evidenceGrade)?.toUpperCase() ?? null;
  const evidenceGrade = grade === "A" || grade === "B" || grade === "C" || grade === "D" ? grade : null;
  const requested = text(record.sleeveStatus)?.toLowerCase() ?? null;
  const requestedSleeveStatus = AI_REGIME_SLEEVE_STATUSES.find((entry) => entry === requested) ?? null;
  const reviewStatus = text(record.reviewStatus)?.toLowerCase() ?? null;
  const membershipAuthority = text(record.membershipAuthority)?.toLowerCase() ?? null;
  const fiveYearExpectedIrr = ratio(record.fiveYearExpectedIrr);
  const tenYearExpectedIrr = ratio(record.tenYearExpectedIrr);
  const requiredFiveYear = ratio(record.requiredFiveYearIrr);
  const requiredTenYear = ratio(record.requiredTenYearIrr);
  const modelAsOf = date(record.modelAsOf);
  const nextEventAt = record.nextEventAt === null ? null : date(record.nextEventAt);
  const thesis = text(record.thesis) ?? text(idea.thesis);
  const hiddenBeneficiaryReason = text(record.hiddenBeneficiaryReason);
  const valuationArchetype = text(record.valuationArchetype);
  const themeFit = ratio(record.themeFit);
  const missing: string[] = [];
  if (!domains.length) missing.push("regime domain");
  if (!exposureType) missing.push("exposure type");
  if (!thesis) missing.push("thesis");
  if (!text(idea.whyBeatQqq)) missing.push("QQQ case");
  if (!text(idea.falsifier)) missing.push("falsifier");
  if (!valuationArchetype) missing.push("valuation archetype");
  if (!evidenceGrade) missing.push("evidence grade");
  if (!modelAsOf) missing.push("model as-of date");
  if (record.nextEventAt !== null && nextEventAt === null) missing.push("next event date or explicit none");
  if (!reviewStatus) missing.push("independent review status");
  if (fiveYearExpectedIrr === null) missing.push("five-year expected IRR");
  if (tenYearExpectedIrr === null) missing.push("ten-year expected IRR");
  if (exposureType === "hidden-beneficiary" && !hiddenBeneficiaryReason) missing.push("hidden-beneficiary reason");
  const modelMs = modelAsOf ? Date.parse(modelAsOf) : NaN;
  const stale = Number.isFinite(modelMs) && (nowMs - modelMs > CAPITAL_LINE_MAX_AGE_DAYS * DAY || modelMs > nowMs);
  const eventMs = nextEventAt ? Date.parse(nextEventAt) : NaN;
  const eventRefresh = Number.isFinite(eventMs) && eventMs - nowMs <= 14 * DAY;
  const evidenceWeak = !evidenceGrade || evidenceGrade === "C" || evidenceGrade === "D";
  const reviewWeak = reviewStatus !== "reviewed" && reviewStatus !== "pm-approved";
  const gateReasons: string[] = [];
  if (missing.length || evidenceWeak || reviewWeak) gateReasons.push("Evidence incomplete, weak, or not independently reviewed.");
  if (stale) gateReasons.push("Model is stale or dated in the future.");
  if (eventRefresh) gateReasons.push("Next event is due, passed, or inside the 14-day refresh window.");
  const gateStatus: AiRegimeGate = missing.length || evidenceWeak || reviewWeak
    ? "evidence blocked"
    : stale
      ? "stale model"
      : eventRefresh
        ? "pending refresh"
        : "clear";
  const clearsCapitalLine = fiveYearExpectedIrr !== null && fiveYearExpectedIrr > CAPITAL_LINE_HURDLE;
  const clearsTournamentHurdle = tenYearExpectedIrr !== null && tenYearExpectedIrr >= AI_REGIME_TOURNAMENT_HURDLE;
  const sleeveStatus: AiRegimeSleeveStatus = requestedSleeveStatus && requestedSleeveStatus !== "top10" && requestedSleeveStatus !== "watchlist10"
    ? requestedSleeveStatus
    : "candidate";
  let membershipBlockedReason: string | null = null;
  if (requestedSleeveStatus === "top10" || requestedSleeveStatus === "watchlist10") {
    membershipBlockedReason = "Sleeve 10 + 10 membership requires a privileged publication after explicit Dustin approval. Idea metadata, including membershipAuthority, cannot authorize roster membership because POST /api/agent/ideas accepts unrestricted JSON.";
  }
  return {
    ...idea,
    domains,
    exposureType,
    hiddenBeneficiaryReason,
    valuationArchetype,
    themeFit: themeFit !== null && themeFit >= 0 && themeFit <= 1 ? themeFit : null,
    monetizationStage: text(record.monetizationStage)?.toLowerCase() ?? null,
    evidenceGrade,
    modelAsOf,
    nextEventAt,
    reviewStatus,
    requestedSleeveStatus,
    sleeveStatus,
    sleeveRank: positive(record.sleeveRank) && Number.isInteger(positive(record.sleeveRank)) ? positive(record.sleeveRank) : null,
    fiveYearExpectedIrr,
    tenYearExpectedIrr,
    requiredFiveYearIrr: requiredFiveYear !== null && requiredFiveYear > CAPITAL_LINE_HURDLE ? requiredFiveYear : CAPITAL_LINE_HURDLE,
    requiredTenYearIrr: requiredTenYear !== null && requiredTenYear > AI_REGIME_TOURNAMENT_HURDLE ? requiredTenYear : AI_REGIME_TOURNAMENT_HURDLE,
    hurdlePrice: positive(record.hurdlePrice),
    membershipAuthority,
    membershipBlockedReason,
    gateStatus,
    missing,
    gateReasons,
    clearsCapitalLine,
    clearsTournamentHurdle,
    qqqIsDefault: gateStatus !== "clear" || !clearsCapitalLine,
  };
}

function compareRows(a: AiRegimeRow, b: AiRegimeRow) {
  const updated = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  if (updated) return updated;
  return a.id.localeCompare(b.id) || a.symbol.localeCompare(b.symbol);
}

function rankRows(rows: AiRegimeRow[]) {
  return [...rows].sort((a, b) => (a.sleeveRank ?? 999) - (b.sleeveRank ?? 999) || a.symbol.localeCompare(b.symbol));
}

export function buildAiRegimeModule({
  dashboard,
  ideas,
  now = new Date().toISOString(),
}: {
  dashboard: BestIdeasDashboard;
  ideas: Idea[];
  now?: string;
}): AiRegimeModule {
  const nowMs = Date.parse(now);
  const core = new Set(
    [...dashboard.topTen, ...dashboard.watchlistTen].map((item) => bareSymbol(item.ticker)).filter(Boolean),
  );
  const parsed = ideas.map((entry) => parseRow(entry, nowMs)).filter((entry): entry is AiRegimeRow => entry !== null);
  parsed.sort(compareRows);
  const seen = new Set<string>();
  const unique: AiRegimeRow[] = [];
  const coreOverlap: string[] = [];
  for (const row of parsed) {
    const symbol = bareSymbol(row.ticker);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    if (core.has(symbol)) {
      coreOverlap.push(symbol);
      continue;
    }
    unique.push(row);
  }
  const topTen = rankRows(unique.filter((row) => row.sleeveStatus === "top10"));
  const watchlistTen = rankRows(unique.filter((row) => row.sleeveStatus === "watchlist10"));
  const queue = unique.filter((row) => row.sleeveStatus !== "top10" && row.sleeveStatus !== "watchlist10");
  const hasApprovedRoster = Boolean(topTen.length || watchlistTen.length);
  const taxonomy = AI_REGIME_DOMAINS.map((domain) => ({
    domain,
    count: unique.filter((row) => row.domains.includes(domain)).length,
  }));
  return {
    asOf: now,
    rankingAsOf: dashboard.lastUpdated,
    sourceMode: dashboard.sourceMode,
    hasApprovedRoster,
    emptyState: hasApprovedRoster ? null : "No approved sleeve roster yet",
    qqqIsDefault: !hasApprovedRoster || unique.every((row) => row.qqqIsDefault),
    topTen,
    watchlistTen,
    tournament: null,
    queue,
    taxonomy,
    coreOverlap,
    summary: {
      candidates: queue.filter((row) => row.sleeveStatus === "candidate").length,
      monitors: queue.filter((row) => row.sleeveStatus === "monitor").length,
      blocked: unique.filter((row) => row.gateStatus !== "clear").length,
      approvedTopTen: topTen.length,
      approvedWatchlist: watchlistTen.length,
    },
  };
}

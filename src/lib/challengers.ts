import { createHash } from "node:crypto";
import type { BestIdeasDashboard, RankedBestIdea } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import { bareSymbol, clamp, toRecord } from "@/lib/utils";

const DAY = 86_400_000;
export const CHALLENGER_DISPOSITIONS = ["admit", "first alternate", "owned-position review", "watch / price trigger", "reject"] as const;
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
  tournamentId: string | null;
  tournamentAsOf: string | null;
  tournamentCompletedAt: string | null;
  tournamentRank: number | null;
  tournamentDisposition: ChallengerDisposition | null;
  tournamentIncumbentTicker: string | null;
  tournamentTerminalLabel: string | null;
  tournamentSummary: string | null;
  tournamentSourceTaskId: string | null;
  tournamentSourceRunId: number | null;
  tournamentSourceCommentId: number | null;
  tournamentExpectedCandidateCount: number | null;
  tournamentOrderedCandidateIdentities: string[] | null;
  tournamentCandidateSetHash: string | null;
  tournamentReviewedContentHash: string | null;
  tournamentManifestHash: string | null;
  tournamentPublicationComplete: boolean;
  tournamentAcceptedReviewTaskId: string | null;
  tournamentAcceptedReviewRunId: number | null;
  tournamentReviewVerdict: string | null;
  tournamentBasis: string | null;
  tournamentExpectedIrr: number | null;
  tournamentRequiredIrr: number | null;
  tournamentCurrentPrice: number | null;
  tournamentHurdlePrice: number | null;
  tournamentEvidenceGrade: "A" | "B" | "C" | "D" | null;
  tournamentModelAsOf: string | null;
  tournamentNextEventAt: string | null;
  priceOnlyExpectedIrr: number | null;
  tournamentFiveYearExpectedIrr: number | null;
  tournamentFiveYearHurdlePrice: number | null;
  tournamentHurdlePriceExpectedTerminalValueConvention: number | null;
  tournamentPortfolioFit: string | null;
  tournamentNextEventStatus: string | null;
  tournamentNextEventEstimated: boolean | null;
  tournamentNextEvidenceTrigger: string | null;
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
export type ChallengerTournament = {
  id: string;
  asOf: string;
  completedAt: string;
  incumbentTicker: string | null;
  terminalLabel: string | null;
  summary: string | null;
  sourceTaskId: string | null;
  sourceRunId: number;
  sourceCommentId: number | null;
  expectedCandidateCount: number;
  manifestHash: string;
  reviewVerdict: string | null;
  candidates: ChallengerCandidate[];
};
export type ChallengerBoard = {
  asOf: string;
  rankingAsOf: string | null;
  sourceMode: BestIdeasDashboard["sourceMode"];
  incumbentFloors: { topTenTicker: string | null; topTenReturn: number | null; watchlistTicker: string | null; watchlistReturn: number | null };
  candidates: ChallengerCandidate[];
  latestTournament: ChallengerTournament | null;
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

function positiveInteger(value: unknown): number | null {
  const number = numeric(value);
  return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

function identityList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const identities = value.map((entry) => text(entry)?.toUpperCase() ?? null);
  if (identities.some((entry) => entry === null || !/^[A-Z][A-Z0-9.-]{0,15}$/.test(entry))) return null;
  return identities as string[];
}

function canonicalJson(value: unknown): string {
  if (value === null) return '["null"]';
  if (Array.isArray(value)) return `["array",[${value.map(canonicalJson).join(",")}]]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort()
      .map((key) => `[${JSON.stringify(key)},${canonicalJson(record[key])}]`).join(",");
    return `["object",[${entries}]]`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot hash a non-finite reviewed number");
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value === 0 ? 0 : value, false);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `["number","${hex}"]`;
  }
  if (typeof value === "string") return `["string",${JSON.stringify(value)}]`;
  if (typeof value === "boolean") return `["boolean",${value}]`;
  throw new Error("Cannot hash an undefined reviewed value");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function hash(value: unknown): string | null {
  const candidate = text(value)?.toLowerCase() ?? null;
  return candidate && /^[0-9a-f]{64}$/.test(candidate) ? candidate : null;
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

function timestamp(value: unknown): string | null {
  const input = text(value);
  return input?.includes("T") ? date(input) : null;
}

function parseMetadata(metadata: Record<string, unknown>): ChallengerMetadata {
  const raw = toRecord(metadata.challenger);
  const tournament = toRecord(raw.tournament);
  const grade = text(raw.evidenceGrade)?.toUpperCase();
  const tournamentGrade = text(tournament.evidenceGrade)?.toUpperCase();
  const fit = ratio(raw.portfolioFit);
  const required = ratio(raw.requiredIrr);
  const decision = text(raw.admissionDecision)?.toLowerCase();
  const tournamentDecision = text(tournament.disposition)?.toLowerCase();
  return {
    discoveryLane: text(raw.discoveryLane)?.toLowerCase() ?? "unclassified",
    expectedIrr: ratio(raw.expectedIrr),
    requiredIrr: required !== null && required > 0 ? required : null,
    hurdlePrice: positive(raw.hurdlePrice),
    currentPrice: positive(raw.currentPrice),
    evidenceGrade: grade === "A" || grade === "B" || grade === "C" || grade === "D" ? grade : null,
    portfolioFit: fit !== null && fit >= 0 && fit <= 1 ? fit : null,
    modelAsOf: date(raw.modelAsOf),
    nextEventAt: date(raw.nextEventAt),
    reviewStatus: text(raw.reviewStatus)?.toLowerCase() ?? null,
    admissionDecision: CHALLENGER_DISPOSITIONS.find((entry) => entry === decision) ?? null,
    tournamentId: text(tournament.id),
    tournamentAsOf: timestamp(tournament.asOf),
    tournamentCompletedAt: timestamp(tournament.completedAt),
    tournamentRank: positiveInteger(tournament.rank),
    tournamentDisposition: CHALLENGER_DISPOSITIONS.find((entry) => entry === tournamentDecision) ?? null,
    tournamentIncumbentTicker: text(tournament.incumbentTicker)?.toUpperCase() ?? null,
    tournamentTerminalLabel: text(tournament.terminalLabel)?.toLowerCase() ?? null,
    tournamentSummary: text(tournament.summary),
    tournamentSourceTaskId: text(tournament.sourceTaskId),
    tournamentSourceRunId: positiveInteger(tournament.sourceRunId),
    tournamentSourceCommentId: positiveInteger(tournament.sourceCommentId),
    tournamentExpectedCandidateCount: positiveInteger(tournament.expectedCandidateCount),
    tournamentOrderedCandidateIdentities: identityList(tournament.orderedCandidateIdentities),
    tournamentCandidateSetHash: hash(tournament.candidateSetHash),
    tournamentReviewedContentHash: hash(tournament.reviewedContentHash),
    tournamentManifestHash: hash(tournament.manifestHash),
    tournamentPublicationComplete: tournament.publicationComplete === true,
    tournamentAcceptedReviewTaskId: text(tournament.acceptedReviewTaskId),
    tournamentAcceptedReviewRunId: positiveInteger(tournament.acceptedReviewRunId),
    tournamentReviewVerdict: text(tournament.reviewVerdict)?.toUpperCase() ?? null,
    tournamentBasis: text(tournament.basis),
    tournamentExpectedIrr: ratio(tournament.expectedIrr),
    tournamentRequiredIrr: ratio(tournament.requiredIrr),
    tournamentCurrentPrice: positive(tournament.currentPrice),
    tournamentHurdlePrice: positive(tournament.hurdlePrice),
    tournamentEvidenceGrade: tournamentGrade === "A" || tournamentGrade === "B" || tournamentGrade === "C" || tournamentGrade === "D" ? tournamentGrade : null,
    tournamentModelAsOf: date(tournament.modelAsOf),
    tournamentNextEventAt: tournament.nextEventAt == null ? null : date(tournament.nextEventAt),
    priceOnlyExpectedIrr: ratio(tournament.priceOnlyExpectedIrr),
    tournamentFiveYearExpectedIrr: ratio(tournament.fiveYearExpectedIrr),
    tournamentFiveYearHurdlePrice: positive(tournament.fiveYearHurdlePrice),
    tournamentHurdlePriceExpectedTerminalValueConvention: positive(tournament.hurdlePriceExpectedTerminalValueConvention),
    tournamentPortfolioFit: text(tournament.portfolioFitAssessment),
    tournamentNextEventStatus: text(tournament.nextEventStatus),
    tournamentNextEventEstimated: typeof tournament.nextEventEstimated === "boolean" ? tournament.nextEventEstimated : null,
    tournamentNextEvidenceTrigger: text(tournament.nextEvidenceTrigger),
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
  const qualifies = gate === "clear" && candidate.expectedIrr !== null && top === "above" && watch === "above";
  if (qualifies) return explicit === "admit" && candidate.reviewStatus === "pm-approved" ? "admit" : "first alternate";
  if (gate === "clear" && watch === "below" && explicit !== "first alternate") return "reject";
  return "watch / price trigger";
}

function reviewedContent(ordered: ChallengerCandidate[], first: ChallengerCandidate) {
  const firstTournament = toRecord(toRecord(first.metadata.challenger).tournament);
  return {
    asOf: firstTournament.asOf,
    candidates: ordered.map((candidate) => {
      const tournament = toRecord(toRecord(candidate.metadata.challenger).tournament);
      return {
        acceptedReviewRunId: tournament.acceptedReviewRunId,
        acceptedReviewTaskId: tournament.acceptedReviewTaskId,
        basis: tournament.basis,
        candidateIdentity: candidate.symbol.toUpperCase(),
        currentPrice: tournament.currentPrice,
        disposition: tournament.disposition,
        evidenceGrade: tournament.evidenceGrade,
        expectedIrr: tournament.expectedIrr,
        fiveYearExpectedIrr: tournament.fiveYearExpectedIrr,
        fiveYearHurdlePrice: tournament.fiveYearHurdlePrice,
        hurdlePrice: tournament.hurdlePrice,
        hurdlePriceExpectedTerminalValueConvention: tournament.hurdlePriceExpectedTerminalValueConvention,
        modelAsOf: tournament.modelAsOf,
        nextEventAt: tournament.nextEventAt,
        nextEventEstimated: tournament.nextEventEstimated,
        nextEventStatus: tournament.nextEventStatus,
        nextEvidenceTrigger: tournament.nextEvidenceTrigger,
        portfolioFitAssessment: tournament.portfolioFitAssessment,
        priceOnlyExpectedIrr: tournament.priceOnlyExpectedIrr,
        rank: tournament.rank,
        requiredIrr: tournament.requiredIrr,
        reviewVerdict: tournament.reviewVerdict,
      };
    }),
    completedAt: firstTournament.completedAt,
    incumbentTicker: firstTournament.incumbentTicker,
    sourceCommentId: firstTournament.sourceCommentId,
    summary: firstTournament.summary,
    terminalLabel: firstTournament.terminalLabel,
  };
}

const FROZEN_CANDIDATE_FIELDS = [
  "acceptedReviewRunId", "acceptedReviewTaskId", "basis", "currentPrice", "disposition", "evidenceGrade",
  "expectedIrr", "fiveYearExpectedIrr", "fiveYearHurdlePrice", "hurdlePrice",
  "hurdlePriceExpectedTerminalValueConvention", "modelAsOf", "nextEventAt", "nextEventEstimated",
  "nextEventStatus", "nextEvidenceTrigger", "portfolioFitAssessment", "priceOnlyExpectedIrr", "rank",
  "requiredIrr", "reviewVerdict",
] as const;

const FROZEN_SHARED_FIELDS = [
  "id", "asOf", "completedAt", "incumbentTicker", "terminalLabel", "summary", "sourceTaskId",
  "sourceRunId", "sourceCommentId", "expectedCandidateCount", "orderedCandidateIdentities",
  "candidateSetHash", "reviewedContentHash", "manifestHash", "publicationComplete",
] as const;

function hasCompleteFrozenCandidate(candidate: ChallengerCandidate): boolean {
  const tournament = toRecord(toRecord(candidate.metadata.challenger).tournament);
  if (!FROZEN_CANDIDATE_FIELDS.every((field) =>
    Object.prototype.hasOwnProperty.call(tournament, field) && tournament[field] !== undefined)
    || !FROZEN_SHARED_FIELDS.every((field) =>
      Object.prototype.hasOwnProperty.call(tournament, field) && tournament[field] !== undefined)) return false;
  const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value)
    && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  const safePositive = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
  const exactHash = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  const nullableFinite = (value: unknown) => value === null || finite(value);
  const nullableText = (value: unknown) => value === null || nonempty(value);
  const identities = tournament.orderedCandidateIdentities;
  if (!nonempty(tournament.id) || tournament.sourceTaskId !== tournament.id
    || typeof tournament.asOf !== "string" || candidate.tournamentAsOf === null
    || typeof tournament.completedAt !== "string" || candidate.tournamentCompletedAt === null
    || !nonempty(tournament.incumbentTicker) || tournament.incumbentTicker !== (tournament.incumbentTicker as string).toUpperCase()
    || !nonempty(tournament.terminalLabel) || tournament.terminalLabel !== (tournament.terminalLabel as string).toLowerCase()
    || !nonempty(tournament.summary) || !safePositive(tournament.sourceRunId)
    || !safePositive(tournament.sourceCommentId) || !safePositive(tournament.expectedCandidateCount)
    || !Array.isArray(identities) || !identities.length
    || identities.some((identity) => typeof identity !== "string" || !/^[A-Z][A-Z0-9.-]{0,15}$/.test(identity))
    || !exactHash(tournament.candidateSetHash) || !exactHash(tournament.reviewedContentHash)
    || !exactHash(tournament.manifestHash) || tournament.publicationComplete !== true
    || !safePositive(tournament.acceptedReviewRunId)
    || !nonempty(tournament.acceptedReviewTaskId) || !nonempty(tournament.basis)
    || !finite(tournament.expectedIrr) || !finite(tournament.requiredIrr) || (tournament.requiredIrr as number) <= 0
    || !finite(tournament.currentPrice) || (tournament.currentPrice as number) <= 0
    || !finite(tournament.hurdlePrice) || (tournament.hurdlePrice as number) <= 0
    || !Number.isSafeInteger(tournament.rank) || (tournament.rank as number) <= 0
    || !CHALLENGER_DISPOSITIONS.includes(tournament.disposition as ChallengerDisposition)
    || !["A", "B", "C", "D"].includes(tournament.evidenceGrade as string)
    || (tournament.reviewVerdict !== "PASS" && tournament.reviewVerdict !== "PASS WITH CAVEATS")
    || typeof tournament.modelAsOf !== "string" || candidate.tournamentModelAsOf === null
    || !nullableFinite(tournament.priceOnlyExpectedIrr) || !nullableFinite(tournament.fiveYearExpectedIrr)
    || !nullableFinite(tournament.fiveYearHurdlePrice)
    || (finite(tournament.fiveYearHurdlePrice) && (tournament.fiveYearHurdlePrice as number) <= 0)
    || !nullableFinite(tournament.hurdlePriceExpectedTerminalValueConvention)
    || (finite(tournament.hurdlePriceExpectedTerminalValueConvention)
      && (tournament.hurdlePriceExpectedTerminalValueConvention as number) <= 0)
    || !nullableText(tournament.portfolioFitAssessment) || !nullableText(tournament.nextEventStatus)
    || !nullableText(tournament.nextEvidenceTrigger)
    || (tournament.nextEventEstimated !== null && typeof tournament.nextEventEstimated !== "boolean")) return false;
  return tournament.nextEventAt === null
    || (typeof tournament.nextEventAt === "string" && candidate.tournamentNextEventAt !== null);
}

function latestTournament(candidates: ChallengerCandidate[]): ChallengerTournament | null {
  const groups = new Map<string, ChallengerCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.tournamentId || !candidate.tournamentAsOf || !candidate.tournamentCompletedAt
      || candidate.tournamentRank === null || !candidate.tournamentDisposition) continue;
    groups.set(candidate.tournamentId, [...(groups.get(candidate.tournamentId) ?? []), candidate]);
  }
  const validGroups = [...groups.entries()].filter(([id, rows]) => {
    const ordered = [...rows].sort((a, b) => a.tournamentRank! - b.tournamentRank! || a.symbol.localeCompare(b.symbol));
    const first = ordered[0];
    if (!first || !first.tournamentIncumbentTicker || !first.tournamentTerminalLabel || !first.tournamentSummary
      || first.tournamentSourceTaskId !== id || first.tournamentSourceRunId === null
      || first.tournamentSourceCommentId === null || first.tournamentExpectedCandidateCount === null
      || !first.tournamentOrderedCandidateIdentities || !first.tournamentCandidateSetHash
      || !first.tournamentReviewedContentHash || !first.tournamentManifestHash || !first.tournamentPublicationComplete) return false;
    const identities = ordered.map((candidate) => candidate.symbol.toUpperCase());
    if (ordered.length !== first.tournamentExpectedCandidateCount
      || new Set(identities).size !== identities.length
      || JSON.stringify(identities) !== JSON.stringify(first.tournamentOrderedCandidateIdentities)
      || sha256(identities) !== first.tournamentCandidateSetHash) return false;
    const manifest = {
      candidateSetHash: first.tournamentCandidateSetHash,
      expectedCandidateCount: first.tournamentExpectedCandidateCount,
      orderedCandidateIdentities: first.tournamentOrderedCandidateIdentities,
      reviewedContentHash: first.tournamentReviewedContentHash,
      sourceRunId: first.tournamentSourceRunId,
      sourceTaskId: first.tournamentSourceTaskId,
    };
    if (sha256(manifest) !== first.tournamentManifestHash) return false;
    const acceptedReviews = new Set<string>();
    const acceptedRuns = new Set<number>();
    const firstRawTournament = toRecord(toRecord(first.metadata.challenger).tournament);
    for (const [index, candidate] of ordered.entries()) {
      if (!hasCompleteFrozenCandidate(candidate)
        || candidate.tournamentRank !== index + 1 || candidate.symbol.toUpperCase() !== identities[index]) return false;
      const rawTournament = toRecord(toRecord(candidate.metadata.challenger).tournament);
      if (FROZEN_SHARED_FIELDS.some((field) =>
        canonicalJson(rawTournament[field]) !== canonicalJson(firstRawTournament[field]))) return false;
      if (candidate.tournamentSourceTaskId !== id || candidate.tournamentSourceRunId === null
        || candidate.tournamentSourceCommentId === null || candidate.tournamentExpectedCandidateCount === null
        || !candidate.tournamentOrderedCandidateIdentities || !candidate.tournamentCandidateSetHash
        || !candidate.tournamentReviewedContentHash || !candidate.tournamentManifestHash || !candidate.tournamentPublicationComplete
        || !candidate.tournamentAcceptedReviewTaskId || candidate.tournamentAcceptedReviewRunId === null
        || (candidate.tournamentReviewVerdict !== "PASS" && candidate.tournamentReviewVerdict !== "PASS WITH CAVEATS")
        || !candidate.tournamentBasis || candidate.tournamentExpectedIrr === null
        || candidate.tournamentRequiredIrr === null || candidate.tournamentCurrentPrice === null
        || candidate.tournamentHurdlePrice === null || candidate.tournamentEvidenceGrade === null
        || candidate.tournamentModelAsOf === null || candidate.tournamentDisposition === "admit") return false;
      if (acceptedReviews.has(candidate.tournamentAcceptedReviewTaskId)
        || acceptedRuns.has(candidate.tournamentAcceptedReviewRunId)) return false;
      acceptedReviews.add(candidate.tournamentAcceptedReviewTaskId);
      acceptedRuns.add(candidate.tournamentAcceptedReviewRunId);
      if (candidate.tournamentAsOf !== first.tournamentAsOf
        || candidate.tournamentCompletedAt !== first.tournamentCompletedAt
        || candidate.tournamentIncumbentTicker !== first.tournamentIncumbentTicker
        || candidate.tournamentTerminalLabel !== first.tournamentTerminalLabel
        || candidate.tournamentSummary !== first.tournamentSummary
        || candidate.tournamentSourceTaskId !== first.tournamentSourceTaskId
        || candidate.tournamentSourceRunId !== first.tournamentSourceRunId
        || candidate.tournamentSourceCommentId !== first.tournamentSourceCommentId
        || candidate.tournamentExpectedCandidateCount !== first.tournamentExpectedCandidateCount
        || JSON.stringify(candidate.tournamentOrderedCandidateIdentities) !== JSON.stringify(first.tournamentOrderedCandidateIdentities)
        || candidate.tournamentCandidateSetHash !== first.tournamentCandidateSetHash
        || candidate.tournamentReviewedContentHash !== first.tournamentReviewedContentHash
        || candidate.tournamentManifestHash !== first.tournamentManifestHash) return false;
    }
    if (sha256(reviewedContent(ordered, first)) !== first.tournamentReviewedContentHash) return false;
    return true;
  });
  const latest = validGroups.sort(([leftId, left], [rightId, right]) =>
    Date.parse(right[0]!.tournamentCompletedAt!) - Date.parse(left[0]!.tournamentCompletedAt!)
    || Date.parse(right[0]!.tournamentAsOf!) - Date.parse(left[0]!.tournamentAsOf!)
    || rightId.localeCompare(leftId))[0];
  if (!latest) return null;
  const [id, rows] = latest;
  const ordered = [...rows].sort((a, b) => a.tournamentRank! - b.tournamentRank! || a.symbol.localeCompare(b.symbol));
  const first = ordered[0]!;
  return {
    id,
    asOf: first.tournamentAsOf!,
    completedAt: first.tournamentCompletedAt!,
    incumbentTicker: first.tournamentIncumbentTicker,
    terminalLabel: first.tournamentTerminalLabel,
    summary: first.tournamentSummary,
    sourceTaskId: first.tournamentSourceTaskId,
    sourceRunId: first.tournamentSourceRunId!,
    sourceCommentId: first.tournamentSourceCommentId,
    expectedCandidateCount: first.tournamentExpectedCandidateCount!,
    manifestHash: first.tournamentManifestHash!,
    reviewVerdict: ordered.some((candidate) => candidate.tournamentReviewVerdict === "PASS WITH CAVEATS") ? "PASS WITH CAVEATS" : "PASS",
    candidates: ordered,
  };
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
    if (!symbol || newest.has(symbol)) continue;
    newest.set(symbol, idea);
  }
  const allCandidates = [...newest.values()].filter((idea) => idea.stage !== "archive").map((idea): ChallengerCandidate => {
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
  const candidates = allCandidates.filter((candidate) => !current.has(candidate.symbol));
  const laneCounts = new Map<string, number>();
  for (const candidate of candidates) laneCounts.set(candidate.discoveryLane, (laneCounts.get(candidate.discoveryLane) ?? 0) + 1);
  return {
    asOf, rankingAsOf: dashboard.lastUpdated, sourceMode: dashboard.sourceMode,
    incumbentFloors: { topTenTicker: top.ticker, topTenReturn: top.value, watchlistTicker: watch.ticker, watchlistReturn: watch.value },
    candidates,
    latestTournament: latestTournament(allCandidates),
    lanes: [...laneCounts].sort(([a], [b]) => a.localeCompare(b)).map(([lane, count]) => ({ lane, count })),
    summary: { total: candidates.length, clearsHurdle: candidates.filter((x) => x.clearsHurdle).length,
      firstAlternates: candidates.filter((x) => x.disposition === "first alternate").length,
      blocked: candidates.filter((x) => x.gateStatus !== "clear").length,
      admitted: candidates.filter((x) => x.disposition === "admit").length,
      ownedReviews: candidates.filter((x) => x.disposition === "owned-position review").length,
      rejected: candidates.filter((x) => x.disposition === "reject").length },
  };
}

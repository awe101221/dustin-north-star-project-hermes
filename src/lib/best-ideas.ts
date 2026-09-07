import { getIdeas, type Idea } from "@/lib/db/pipeline";
import type { Db } from "@/lib/db/query";
import type { IdeaStage } from "@/lib/db/types";

export const HERMES_BEST_IDEAS_MANDATE =
  "Hermes-ranked Top 10 and Watchlist 10: the app exists to surface Dustin North Star Project Hermes's best current ideas to beat QQQ over 10 years.";

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
  missing: string[];
};

export type BestIdeasDashboard = {
  mandate: string;
  generatedBy: "Hermes";
  benchmark: "QQQ";
  horizonYears: 10;
  lastUpdated: string | null;
  topTen: RankedBestIdea[];
  watchlistTen: RankedBestIdea[];
  totalActive: number;
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

function missingFields(idea: BestIdeaInput) {
  const missing: string[] = [];
  if (!idea.thesis?.trim()) missing.push("thesis");
  if (!idea.whyBeatQqq?.trim()) missing.push("QQQ case");
  if (!idea.falsifier?.trim()) missing.push("falsifier");
  if (idea.conviction === null) missing.push("conviction");
  if (idea.risk === null) missing.push("risk");
  return missing;
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
      missing: missingFields(idea),
    };
  });
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
    topTen: rankIdeas(topTenRaw, "top-ten"),
    watchlistTen: rankIdeas(watchlistRaw, "watchlist"),
    totalActive: active.length,
  };
}

export async function getBestIdeasDashboard(db: Db): Promise<BestIdeasDashboard> {
  const ideas = await getIdeas(db);
  return buildBestIdeas(ideas);
}

import type { BestIdeasSnapshotInput } from "./best-ideas";
export function assertLadderRanking(input: BestIdeasSnapshotInput) {
  const ranked = [...input.topTen.map((i, n) => ({ ...i, rank: n + 1, lane: "top-ten" })),
    ...input.watchlistTen.map((i, n) => ({ ...i, rank: n + 1, lane: "watchlist" }))];
  const ladders = input.forecastLadders ?? [];
  if (ladders.length !== ranked.length || new Set(ladders.map((f) => f.ticker)).size !== ranked.length ||
    new Set(ladders.map((f) => f.run_id)).size !== 1) throw new Error("One forecast ladder check per ranked company and one shared refresh run required");
  for (const item of ranked) {
    const ladder = ladders.find((f) => f.ticker === item.ticker.split(":").at(-1));
    if (!ladder || ladder.ranking.rank !== item.rank || ladder.ranking.lane !== item.lane || ladder.ranking.qqq_decision !== item.qqqLine) {
      throw new Error("Forecast ranking must match the published Best Ideas decision");
    }
  }
}

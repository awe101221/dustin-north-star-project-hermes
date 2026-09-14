import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";
import type { Idea } from "@/lib/db/pipeline";
import { buildChallengerBoard } from "@/lib/challengers";
import { ChallengerBoardView } from "./challenger-board-view";

const idea: Idea = {
  id: "idea-adbe",
  ticker: "NAS:ADBE",
  symbol: "ADBE",
  companyName: "Adobe",
  stage: "diligence",
  sortOrder: 0,
  conviction: 78,
  risk: 42,
  targetWeight: null,
  currentWeight: null,
  thesis: "A durable creative platform at a reset valuation with AI monetization optionality.",
  whyBeatQqq: "Owner earnings can compound faster than QQQ from a lower starting multiple.",
  falsifier: "QQQ is better if AI weakens pricing power or owner earnings fail to grow.",
  catalyst: "Paid AI adoption and margin durability create an estimate inflection.",
  nextAction: "Complete the independent review chain.",
  persona: "hermes-pm",
  memoId: null,
  theme: "application-software",
  tags: ["quality-drawdown"],
  source: "screen",
  sourceRef: { url: "https://example.com/adbe" },
  owner: "hermes",
  archivedReason: null,
  metadata: { challenger: { discoveryLane: "quality-drawdown", expectedIrr: 18, requiredIrr: 15, hurdlePrice: 410, currentPrice: 480, evidenceGrade: "B", portfolioFit: 70, modelAsOf: "2026-09-10T00:00:00Z", nextEventAt: "2026-10-20T00:00:00Z", reviewStatus: "reviewed" } },
  stageChangedAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

function board() {
  const dashboard = snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: "2026-09-10T00:00:00Z",
    topTen: [{ ticker: "META", modeledReturn: 0.16, score: 84 }],
    watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 72 }],
  }));
  return buildChallengerBoard({ dashboard, ideas: [idea], now: "2026-09-14T00:00:00Z" });
}

describe("Challenger Board view", () => {
  it("shows the hurdle, incumbent comparisons, evidence gate, and workflow links", () => {
    const markup = renderToStaticMarkup(<ChallengerBoardView board={board()} />);
    expect(markup).toContain("10 + 10 Challenger Board");
    expect(markup).toContain("15% admission hurdle");
    expect(markup).toContain("QQQ remains the default");
    expect(markup).toContain("Weakest Top 10");
    expect(markup).toContain("Weakest Watchlist 10");
    expect(markup).toContain("Evidence grade B");
    expect(markup).toContain('href="/companies/NAS%3AADBE"');
    expect(markup).toContain('href="/pipeline?idea=idea-adbe"');
    expect(markup).toContain('href="/quant"');
  });

  it("keeps dense underwriting details behind a mobile disclosure", () => {
    const markup = renderToStaticMarkup(<ChallengerBoardView board={board()} />);
    expect(markup).toContain("Underwriting gates");
    expect(markup).toContain("sm:hidden");
    expect(markup).toContain("hidden sm:grid");
  });
});

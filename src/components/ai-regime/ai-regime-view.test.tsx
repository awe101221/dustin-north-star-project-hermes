import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";
import { buildAiRegimeModule } from "@/lib/ai-regime";
import type { Idea } from "@/lib/db/pipeline";
import { AiRegimeView } from "./ai-regime-view";

const idea: Idea = {
  id: "idea-ok",
  ticker: "NAS:OK",
  symbol: "OK",
  companyName: "Okay Robotics",
  stage: "diligence",
  sortOrder: 0,
  conviction: 70,
  risk: 40,
  targetWeight: null,
  currentWeight: null,
  thesis: "Physical AI exposure with evidence-weighted transition economics.",
  whyBeatQqq: "Unit economics can beat QQQ if adoption compounds.",
  falsifier: "QQQ is better if capex and dilution consume the option value.",
  catalyst: "Backlog conversion.",
  nextAction: "Independent review.",
  persona: "ai-regime-analyst",
  memoId: null,
  theme: "ai-regime",
  tags: ["ai-regime"],
  source: "screen",
  sourceRef: { url: "https://example.com/ok" },
  owner: "hermes",
  archivedReason: null,
  metadata: {
    aiRegime: {
      domains: ["physical-ai-robotics-autonomy"],
      exposureType: "hidden-beneficiary",
      thesis: "Tooling beneficiary of physical AI adoption.",
      hiddenBeneficiaryReason: "Sells enabling components, not the robot brand.",
      valuationArchetype: "core-plus-transition-plus-option",
      themeFit: 0.7,
      monetizationStage: "early-revenue",
      evidenceGrade: "B",
      modelAsOf: "2026-09-10T00:00:00Z",
      nextEventAt: "2026-10-15T00:00:00Z",
      reviewStatus: "pm-approved",
      sleeveStatus: "top10",
      sleeveRank: 1,
      fiveYearExpectedIrr: 0.19,
      tenYearExpectedIrr: 0.17,
      requiredFiveYearIrr: 0.12,
      requiredTenYearIrr: 0.15,
      hurdlePrice: 40,
      membershipAuthority: "dustin-approved",
    },
  },
  stageChangedAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

function render(ideas: Idea[] = []) {
  const dashboard = snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: "2026-09-10T00:00:00Z",
    topTen: [{ ticker: "NAS:NVDA", modeledReturn: 0.16, score: 90 }],
    watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 71 }],
  }));
  return renderToStaticMarkup(
    <AiRegimeView module={buildAiRegimeModule({ dashboard, ideas, now: "2026-09-14T00:00:00Z" })} />,
  );
}

describe("AI Regime view", () => {
  it("shows methodology and an explicit empty roster when nothing is approved", () => {
    const markup = render([]);
    expect(markup).toContain("AI Regime");
    expect(markup).toContain("No approved sleeve roster yet");
    expect(markup).toContain("Beat QQQ over 10 years");
    expect(markup).toContain("not a trade recommendation");
    expect(markup).toContain("core/base business value");
    expect(markup).toContain("hidden beneficiaries");
    expect(markup).toContain("15%");
    expect(markup).toContain("12%");
    expect(markup).not.toContain("NVDA");
  });

  it("renders an approved sleeve name only after Dustin authority", () => {
    const markup = render([idea]);
    expect(markup).toContain("OK");
    expect(markup).toContain("Okay Robotics");
    expect(markup).not.toContain("No approved sleeve roster yet");
  });

  it("renders evidence, freshness, and monitoring state without inventing a tournament", () => {
    const markup = render([]);
    expect(markup).toContain("Evidence / freshness / monitoring");
    expect(markup).toContain("45-day model freshness");
    expect(markup).toContain("14-day event refresh");
    expect(markup).toContain("Thematic Challenger Tournament");
    expect(markup).toContain("No sealed AI Regime tournament is published");
    expect(markup).toContain("Candidate / research queue");
  });
});

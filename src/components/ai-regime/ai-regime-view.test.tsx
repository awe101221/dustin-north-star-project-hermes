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
      requiredTournamentFiveYearIrr: 0.15,
      hurdlePrice: 40,
      membershipAuthority: "dustin-approved",
      returnBasis: "five-year-price-only",
      qqqComparisonAsOf: "2026-09-10T00:00:00Z",
      probabilityWeighting: "bear-base-bull",
      dividendsIncluded: false,
      valuationContract: {
        coreBaseValue: true,
        transitionEconomics: true,
        probabilityDiscountedOptionValue: true,
        reverseExpectations: true,
        capexFinancingDilutionDownside: true,
      },
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
    expect(markup).toContain("12%");
    expect(markup).toContain("15%");
    expect(markup).toContain("no IRR floor");
    expect(markup).toContain("10-year outputs are historical context only");
    expect(markup).not.toContain("NVDA");
  });

  it("keeps the empty roster when idea metadata forges Dustin approval", () => {
    const markup = render([idea]);
    expect(markup).toContain("No approved sleeve roster yet");
    expect(markup).toContain("OK");
    expect(markup).toContain("metadata complete · unreviewed");
    expect(markup).toContain("evidence blocked");
    expect(markup).not.toContain(">clear<");
    expect(markup).toContain("Metadata evidence");
    expect(markup).toContain("Model as of");
    expect(markup).toContain("Next event");
    expect(markup).toContain("Valuation archetype");
    expect(markup).toContain("5y asserted price-only IRR");
    expect(markup).toContain("Effective Capital Line");
    expect(markup).toContain("Effective tournament hurdle");
    expect(markup).toContain("Why own instead of QQQ?");
    expect(markup).toContain("Falsifier / downside");
    expect(markup).toContain("Next review trigger");
  });

  it("labels untrusted tournament claims as tournament candidates", () => {
    const tournamentCandidate = {
      ...idea,
      metadata: {
        aiRegime: {
          ...(idea.metadata.aiRegime as Record<string, unknown>),
          sleeveStatus: "tournament",
        },
      },
    };
    const markup = render([tournamentCandidate]);
    expect(markup).toContain("tournament candidate");
    expect(markup).not.toContain(">tournament<");
  });

  it("renders a reviewed watch name without a sleeve roster write", () => {
    const dashboard = snapshotToDashboard(normalizeBestIdeasSnapshot({
      asOf: "2026-09-10T00:00:00Z",
      topTen: [{ ticker: "NAS:NVDA", modeledReturn: 0.16, score: 90 }],
      watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 71 }],
    }));
    const markup = renderToStaticMarkup(
      <AiRegimeView module={buildAiRegimeModule({
        dashboard,
        ideas: [],
        now: "2026-09-23T17:00:00Z",
        watchPublications: [{
          ticker: "NYS:MOD",
          symbol: "MOD",
          companyName: "Modine Manufacturing",
          asOf: "2026-09-23T16:00:00Z",
          reviewTaskId: "t_321efb88",
          pmTaskId: "t_e926006f",
          contentHash: "716hash716hash716",
          reviewVerdict: "PASS WITH CAVEATS",
          rosterWriteApproved: false,
          thesis: "RemainCo is parked until separation financials exist.",
          parkedReason: "No separation financials.",
        }],
      })} />,
    );
    expect(markup).toContain("MOD");
    expect(markup).toContain("Reviewed watch only");
    expect(markup).toContain("No approved sleeve roster yet");
    expect(markup).not.toContain("NVDA");
  });

  it("renders a reviewed 12% name on the ranked sleeve list", () => {
    const dashboard = snapshotToDashboard(normalizeBestIdeasSnapshot({
      asOf: "2026-09-10T00:00:00Z",
      topTen: [{ ticker: "NAS:NVDA", modeledReturn: 0.16, score: 90 }],
      watchlistTen: [{ ticker: "CRM", modeledReturn: 0.12, score: 71 }],
    }));
    const markup = renderToStaticMarkup(
      <AiRegimeView module={buildAiRegimeModule({
        dashboard,
        ideas: [],
        now: "2026-09-23T17:00:00Z",
        rosterPublications: [{
          ticker: "NAS:SPSC",
          symbol: "SPSC",
          companyName: "SPS Commerce",
          asOf: "2026-09-18",
          reviewTaskId: "t_50482783",
          pmTaskId: "t_f62c640d",
          contentHash: "be874f671974c5e49fe6f7a05d1b797fc7cd6862d4d1e7daf161e850b7a37446",
          reviewVerdict: "PASS WITH CAVEATS",
          fiveYearExpectedIrr: 0.143657935359372,
          thesis: "Certified five-year price-only expected IRR is 14.366%.",
        }],
      })} />,
    );
    expect(markup).toContain("SPSC");
    expect(markup).toContain("14.366%");
    expect(markup).toContain("not Capital Line");
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

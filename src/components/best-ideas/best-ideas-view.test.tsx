import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BestIdeasView } from "./best-ideas-view";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";

describe("Best Ideas Capital Line", () => {
  it("reconciles the 12% research gate with the 15% admission hurdle without implying trade authorization", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T14:00:00.000Z"));
    const dashboard = snapshotToDashboard(normalizeBestIdeasSnapshot({
      asOf: "2026-09-16T12:00:00Z",
      thesis: "The 10 + 10 is a ranked candidate set, not automatically a capital list.",
      topTen: [
        {
          ticker: "MELI",
          thesis: "Modeled compounder.",
          whyBeatQqq: "Expected return clears the QQQ hurdle.",
          falsifier: "Growth misses.",
          conviction: 85,
          risk: 45,
          qqqLine: "above",
          modeledReturn: 0.27,
          qqqLineReason: "Price-rebased modeled return strictly clears 12%.",
        },
        {
          ticker: "TSM",
          thesis: "Excellent company at a full price.",
          whyBeatQqq: "Can beat QQQ in the bull case.",
          falsifier: "Multiple compresses.",
          conviction: 70,
          risk: 55,
          qqqLine: "above",
          modeledReturn: 0.10,
          qqqLineReason: "10% modeled return remains below 12%.",
        },
      ],
      watchlistTen: [{
        ticker: "VRT",
        thesis: "Promising but not fully modeled.",
        whyBeatQqq: "AI infrastructure demand may compound.",
        falsifier: "Valuation absorbs the upside.",
        conviction: 65,
        risk: 60,
        qqqLine: "above",
        modeledReturn: null,
      }],
    }));

    const markup = renderToStaticMarkup(<BestIdeasView dashboard={dashboard} />);
    expect(markup).toContain("Capital Line");
    expect(markup).toContain("Clears Capital Line · eligible for incremental research capital (1)");
    expect(markup).toContain("Ranked only · does not clear Capital Line (2)");
    expect(markup).toContain("The 10 + 10 ranks the best current options; it is not automatically a buy list.");
    expect(markup).toContain("12% modeled 5-year return is the Capital Line research gate");
    expect(markup).toContain("15% is the separate challenger admission hurdle");
    expect(markup).toContain("neither is trade authorization or proof of the 10-year objective");
    expect(markup).toContain("Model &amp; price baseline");
    expect(markup).toContain("Ranking &amp; price refresh");
    expect(markup).not.toContain("capital worthy");
    expect(markup).toContain("ranked only");
    vi.useRealTimers();
  });
});

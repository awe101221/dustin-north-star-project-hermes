import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BestIdeasView } from "./best-ideas-view";
import { normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";

describe("Best Ideas Capital Line", () => {
  it("keeps 12% entry separate from the 15% Capital Line and does not treat either as a trade", () => {
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
          modeledReturn: 0.14,
          qqqLineReason: "14% clears 12% entry and misses 15%.",
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
    expect(markup).toContain("Clears 15% · on the Capital Line (1)");
    expect(markup).not.toContain("Ranked only · does not clear Capital Line");
    expect(markup).toContain("A name enters the ranked 10 + 10 above 12%");
    expect(markup).toContain("The Capital Line lists only names that clear 15%");
    expect(markup).toContain("not the door");
    expect(markup).toContain("Neither rank nor Capital Line is trade authorization");
    expect(markup).toContain("on Capital Line");
    expect(markup).toContain("ranked · below Capital Line");
    expect(markup).toContain("below 12% entry");
    expect(markup).toContain("Model &amp; price baseline");
    expect(markup).toContain("Ranking &amp; price refresh");
    expect(markup).not.toContain("capital worthy");
    vi.useRealTimers();
  });
});

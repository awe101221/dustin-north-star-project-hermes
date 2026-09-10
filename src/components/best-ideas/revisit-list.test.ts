import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildRevisitIdeas, normalizeBestIdeasSnapshot, snapshotToDashboard } from "@/lib/best-ideas";
import type { StreamItem } from "@/lib/db/research";
import { RevisitList } from "./revisit-list";

vi.mock("./revisit-review-button", () => ({ RevisitReviewButton: () => null }));

function dashboard() {
  const old = snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: "2026-09-01T00:00:00Z", topTen: [{ ticker: "MU", thesis: "Prior thesis", modeledReturn: 0.18 }], watchlistTen: [],
  }), "old-snapshot");
  const current = snapshotToDashboard(normalizeBestIdeasSnapshot({
    asOf: "2026-09-02T00:00:00Z", topTen: [{ ticker: "META" }], watchlistTen: [],
  }));
  return { ...current, revisit: buildRevisitIdeas([current, old]) };
}

describe("Revisit section", () => {
  it("labels historical ranking data and highlights research after exit", () => {
    const markup = renderToStaticMarkup(RevisitList({ dashboard: dashboard(), canWrite: false, research: {
      MU: { unavailable: false, item: { id: "new-memo", title: "Updated earnings evidence", occurredAt: "2026-09-03T00:00:00Z" } as StreamItem },
    } }));
    expect(markup).toContain("Former Top 10 · #1");
    expect(markup).toContain("historical estimate");
    expect(markup).toContain("New research since exit");
    expect(markup).toContain('href="/research/new-memo"');
    expect(markup).toContain('href="/research/old-snapshot"');
    expect(markup).toContain('href="/companies/MU"');
  });

  it("does not claim fresh research when the latest item predates exit", () => {
    const markup = renderToStaticMarkup(RevisitList({ dashboard: dashboard(), canWrite: false, research: {
      MU: { unavailable: false, item: { id: "old-memo", title: "Prior earnings", occurredAt: "2026-09-01T00:00:00Z" } as StreamItem },
    } }));
    expect(markup).not.toContain("New research since exit");
    expect(markup).toContain("No newer research since exit");
  });

  it("distinguishes failed history and research reads from empty states", () => {
    const failedResearch = renderToStaticMarkup(RevisitList({ dashboard: dashboard(), canWrite: false, research: { MU: { item: null, unavailable: true } } }));
    expect(failedResearch).toContain("Research updates unavailable");
    expect(failedResearch).not.toContain("No research recorded yet");
    const failedHistory = renderToStaticMarkup(RevisitList({ dashboard: { ...dashboard(), revisit: [], revisitError: "History unavailable" }, canWrite: false, research: {} }));
    expect(failedHistory).toContain('role="alert"');
    expect(failedHistory).not.toContain("No former selections yet");
  });
});

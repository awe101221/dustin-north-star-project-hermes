import { describe, expect, it } from "vitest";
import {
  LEARNINGS_TAG,
  buildLearningArchive,
  learningSnapshotNote,
  normalizeLearningSnapshot,
  snapshotMetadataToLearningSnapshot,
} from "./learnings";

describe("Hermes investing philosophy learnings", () => {
  it("normalizes a learning snapshot into current philosophy and archive entries", () => {
    const snapshot = normalizeLearningSnapshot({
      asOf: "2026-09-07T17:10:00.000Z",
      summary: "Risk-adjusted QQQ hurdle got stricter after reviewing the Top 10.",
      principles: ["Every idea must beat QQQ on opportunity cost", "Falsifiers outrank narrative"],
      changes: [
        {
          title: "Penalize missing risk scores",
          learning: "A conviction score without an explicit risk estimate lets attractive stories rank too highly.",
          implication: "Hermes should push incomplete ideas down until risk is underwritten.",
          source: "Best Ideas scoring review",
          tickers: ["AMKR", "GEV"],
        },
      ],
    });

    expect(snapshot.asOf).toBe("2026-09-07T17:10:00.000Z");
    expect(snapshot.principles).toHaveLength(2);
    expect(snapshot.changes[0]?.rank).toBe(1);
    expect(snapshot.changes[0]?.tickers).toEqual(["AMKR", "GEV"]);
  });

  it("extracts latest current philosophy plus reverse-chronological archive from notes", () => {
    const rows = [
      {
        id: "older",
        title: "Older learning",
        body_md: "older",
        occurred_at: "2026-09-06T12:00:00.000Z",
        created_at: "2026-09-06T12:00:00.000Z",
        metadata: {
          learningSnapshot: {
            asOf: "2026-09-06T12:00:00.000Z",
            summary: "Older summary",
            principles: ["Old principle"],
            changes: [{ title: "Old", learning: "Old lesson", implication: "Old implication" }],
          },
        },
      },
      {
        id: "newer",
        title: "Newer learning",
        body_md: "newer",
        occurred_at: "2026-09-07T12:00:00.000Z",
        created_at: "2026-09-07T12:00:00.000Z",
        metadata: {
          learningSnapshot: {
            asOf: "2026-09-07T12:00:00.000Z",
            summary: "Newer summary",
            principles: ["New principle"],
            changes: [{ title: "New", learning: "New lesson", implication: "New implication" }],
          },
        },
      },
    ];

    const archive = buildLearningArchive(rows);
    expect(archive.current?.id).toBe("newer");
    expect(archive.current?.summary).toBe("Newer summary");
    expect(archive.entries.map((entry) => entry.id)).toEqual(["newer", "older"]);
    expect(archive.principles).toEqual(["New principle"]);
  });

  it("creates a pinned Hermes note payload that can be written through the existing notes table", () => {
    const note = learningSnapshotNote(
      {
        asOf: "2026-09-07T17:10:00.000Z",
        summary: "Hermes learned to demand stronger QQQ opportunity-cost evidence.",
        principles: ["QQQ is the default until active ownership earns its spot"],
        changes: [{ title: "Opportunity cost first", learning: "Benchmark-relative framing changed the rank order.", implication: "Start each underwrite with the QQQ alternative." }],
      },
      "hermes",
    );

    expect(note.kind).toBe("agent");
    expect(note.tags).toContain(LEARNINGS_TAG);
    expect(note.is_pinned).toBe(true);
    expect(note.metadata.learningSnapshot).toBeTruthy();
    expect(note.body_md).toContain("# Hermes Investing Philosophy Learning");
  });

  it("rejects malformed metadata instead of inventing a philosophy", () => {
    expect(snapshotMetadataToLearningSnapshot({})).toBeNull();
    expect(snapshotMetadataToLearningSnapshot({ learningSnapshot: { principles: [] } })).toBeNull();
  });
});

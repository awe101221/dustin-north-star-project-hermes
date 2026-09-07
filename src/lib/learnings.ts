import { unwrap, type Db } from "@/lib/db/query";
import type { NoteRow } from "@/lib/db/types";

export const LEARNINGS_TAG = "hermes-investing-philosophy-learning";

export type LearningChangeInput = {
  title: string;
  learning: string;
  implication: string;
  source?: string | null;
  tickers?: string[];
};

export type LearningSnapshotInput = {
  asOf?: string | null;
  summary: string;
  principles: string[];
  changes: LearningChangeInput[];
};

export type LearningChange = Required<Pick<LearningChangeInput, "title" | "learning" | "implication">> & {
  rank: number;
  source: string | null;
  tickers: string[];
};

export type LearningSnapshot = {
  asOf: string;
  summary: string;
  principles: string[];
  changes: LearningChange[];
};

export type LearningArchiveEntry = LearningSnapshot & {
  id: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
};

export type LearningArchive = {
  current: LearningArchiveEntry | null;
  principles: string[];
  entries: LearningArchiveEntry[];
};

type LearningNoteRow = Pick<NoteRow, "id" | "title" | "body_md" | "occurred_at" | "created_at" | "metadata">;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDate(value: string | null | undefined) {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

export function normalizeLearningSnapshot(input: LearningSnapshotInput): LearningSnapshot {
  return {
    asOf: cleanDate(input.asOf),
    summary: clean(input.summary),
    principles: input.principles.map((x) => x.trim()).filter(Boolean).slice(0, 12),
    changes: input.changes.slice(0, 20).map((change, index) => ({
      rank: index + 1,
      title: change.title.trim(),
      learning: change.learning.trim(),
      implication: change.implication.trim(),
      source: change.source?.trim() || null,
      tickers: (change.tickers ?? []).map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 20),
    })).filter((change) => change.title && change.learning && change.implication),
  };
}

function isLearningSnapshotInput(value: unknown): value is LearningSnapshotInput {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.summary === "string" && Array.isArray(rec.principles) && Array.isArray(rec.changes);
}

export function snapshotMetadataToLearningSnapshot(metadata: Record<string, unknown>): LearningSnapshot | null {
  const raw = metadata.learningSnapshot;
  if (!isLearningSnapshotInput(raw)) return null;
  const normalized = normalizeLearningSnapshot(raw);
  return normalized.summary && normalized.principles.length ? normalized : null;
}

function rowToEntry(row: LearningNoteRow): LearningArchiveEntry | null {
  const snapshot = snapshotMetadataToLearningSnapshot(row.metadata ?? {});
  if (!snapshot) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body_md,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    ...snapshot,
  };
}

export function buildLearningArchive(rows: LearningNoteRow[]): LearningArchive {
  const entries = rows
    .map(rowToEntry)
    .filter((entry): entry is LearningArchiveEntry => Boolean(entry))
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf));
  const current = entries[0] ?? null;
  return { current, principles: current?.principles ?? [], entries };
}

function learningMarkdown(snapshot: LearningSnapshot) {
  return [
    "# Hermes Investing Philosophy Learning",
    "",
    snapshot.summary,
    "",
    "## Current principles",
    ...snapshot.principles.map((principle, index) => `${index + 1}. ${principle}`),
    "",
    "## New/updated learnings",
    ...snapshot.changes.map((change) => [
      `${change.rank}. ${change.title}`,
      `   - Learning: ${change.learning}`,
      `   - Implication for Top 10 + Watchlist: ${change.implication}`,
      change.source ? `   - Source: ${change.source}` : null,
      change.tickers.length ? `   - Tickers: ${change.tickers.join(", ")}` : null,
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

export function learningSnapshotNote(input: LearningSnapshotInput, actor = "hermes") {
  const snapshot = normalizeLearningSnapshot(input);
  const tickers = Array.from(new Set(snapshot.changes.flatMap((change) => change.tickers)));
  return {
    kind: "agent" as const,
    title: `Hermes Investing Philosophy Learning — ${snapshot.asOf.slice(0, 10)}`,
    body_md: learningMarkdown(snapshot),
    tickers,
    tags: [LEARNINGS_TAG, "investing-philosophy", "qqq-10y", "top-10-watchlist"],
    persona_slug: "hermes-pm",
    verdict: "WATCH",
    author: actor,
    source_system: "hermes_agent",
    is_pinned: true,
    occurred_at: snapshot.asOf,
    metadata: { learningSnapshot: snapshot },
  };
}

export async function getLearningArchive(db: Db): Promise<LearningArchive> {
  const rows = unwrap(
    await db
      .from("hermes_notes")
      .select("id, title, body_md, occurred_at, created_at, metadata")
      .contains("tags", [LEARNINGS_TAG])
      .eq("kind", "agent")
      .order("occurred_at", { ascending: false })
      .limit(120),
    "learning archive",
  ) as LearningNoteRow[];
  return buildLearningArchive(rows);
}

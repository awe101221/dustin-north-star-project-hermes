import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { learningSnapshotNote, normalizeLearningSnapshot, type LearningSnapshotInput } from "@/lib/learnings";
import { unwrap } from "@/lib/db/query";
import { logActivity } from "@/lib/server/handlers";

export async function publishLearningSnapshot(db: SupabaseClient, input: LearningSnapshotInput, actor: string) {
  const note = learningSnapshotNote(input, actor);
  const rows = unwrap(await db.from("hermes_notes").insert(note).select("id, occurred_at, metadata").limit(1), "learning snapshot insert") as Array<{ id: string; occurred_at: string; metadata: Record<string, unknown> }>;
  const row = rows[0];
  await logActivity(db, {
    kind: "learning.snapshot",
    title: "Hermes updated investing philosophy learnings",
    detail: input.summary,
    actor,
    ref_table: "hermes_notes",
    ref_id: row?.id,
    payload: { principles: input.principles.length, changes: input.changes.length },
  });
  return { note: row, snapshot: normalizeLearningSnapshot(input) };
}

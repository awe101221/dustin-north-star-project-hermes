import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestIdeasSnapshotNote, normalizeBestIdeasSnapshot, type BestIdeasSnapshotInput } from "@/lib/best-ideas";
import { unwrap } from "@/lib/db/query";
import { logActivity } from "@/lib/server/handlers";

export async function publishBestIdeasSnapshot(db: SupabaseClient, input: BestIdeasSnapshotInput, actor: string) {
  const note = bestIdeasSnapshotNote(input, actor);
  const rows = unwrap(await db.from("hermes_notes").insert(note).select("id, occurred_at, metadata").limit(1), "best ideas snapshot insert") as Array<{ id: string; occurred_at: string; metadata: Record<string, unknown> }>;
  const row = rows[0];
  await logActivity(db, {
    kind: "best_ideas.snapshot",
    title: "Hermes refreshed Best Ideas Top 10 + Watchlist 10",
    detail: input.thesis ?? null,
    actor,
    ref_table: "hermes_notes",
    ref_id: row?.id,
    payload: { topTen: input.topTen.length, watchlistTen: input.watchlistTen.length },
  });
  return { note: row, snapshot: normalizeBestIdeasSnapshot(input) };
}

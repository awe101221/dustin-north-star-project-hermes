import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestIdeasSnapshotNote, normalizeBestIdeasSnapshot, type BestIdeasSnapshotInput } from "@/lib/best-ideas";
import { unwrap } from "@/lib/db/query";
import { logActivity } from "@/lib/server/handlers";
import { registerForecastLadder } from "@/lib/server/forecast-ladders";
import { assertLadderRanking } from "@/lib/forecast-ranking";

export async function publishBestIdeasSnapshot(db: SupabaseClient, input: BestIdeasSnapshotInput, actor: string) {
  if (input.forecastLadders) {
    assertLadderRanking(input);
    // Idempotent registrations precede publication. A failed publication can be
    // retried with the same run/ticker payload without duplicating forecasts.
    for (const ladder of input.forecastLadders) await registerForecastLadder(db, ladder);
  }
  const note = bestIdeasSnapshotNote(input, actor);
  type PublishedNote = { id: string; occurred_at: string; metadata: Record<string, unknown> };
  const row = input.forecastLadders
    ? (unwrap(await db.rpc("hermes_publish_learning_snapshot", { p_run_id: input.forecastLadders[0]!.run_id, p_note: note }), "learning snapshot publication") as { note: PublishedNote }).note
    : (unwrap(await db.from("hermes_notes").insert(note).select("id, occurred_at, metadata").limit(1), "best ideas snapshot insert") as PublishedNote[])[0];
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

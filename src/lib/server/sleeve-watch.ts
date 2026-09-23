import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sleeveWatchInputFromRow } from "@/lib/ai-regime";

const COLUMNS = "ticker,symbol,company_name,as_of,review_task_id,pm_task_id,content_hash,review_verdict,roster_write_approved,thesis,parked_reason";

export async function loadSleeveWatchPublications(db: SupabaseClient): Promise<unknown[]> {
  try {
    const { data, error } = await db
      .from("hermes_sleeve_watch_publications")
      .select(COLUMNS)
      .order("as_of", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => sleeveWatchInputFromRow(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

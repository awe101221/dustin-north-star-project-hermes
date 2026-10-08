import "server-only";
import { getLatestQqqRankingRelease } from "@/lib/db/qqq-rankings";
import type { Db } from "@/lib/db/query";
import { decodeRankingRelease } from "@/lib/ranking-release";
import { underwritingReadClient } from "@/lib/supabase/server";

export { loadReviewedRankings } from "@/lib/ranking-release";

/** Session-checked service-role reads for pages. Authenticated agent handlers
 * may supply their server client after withAgent has checked its token. */
export async function readLiveRankings(now: string, authorizedAgentDb?: Db) {
  const db = authorizedAgentDb ?? await underwritingReadClient();
  if (!db) throw new Error("Live ranking storage is not configured");
  const row = await getLatestQqqRankingRelease(db, { now });
  if (!row) return { publications: [], securities: [], releaseHash: null };
  return { ...decodeRankingRelease(row, now), releaseHash: row.release_hash };
}

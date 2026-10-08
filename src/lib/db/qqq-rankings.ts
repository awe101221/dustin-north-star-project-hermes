import { unwrap, type Db } from "./query";
import type { QqqRankingReleaseRow } from "./types";

const columns = "release_hash,as_of,approved_at,publications,securities,authorities";

/** Atomic releases keep both sleeves and their identity/authority records in
 * the same generation. Future approvals cannot activate through this query. */
export async function getLatestQqqRankingRelease(db: Db, { now }: { now: string }): Promise<QqqRankingReleaseRow | null> {
  const result = await db.from("hermes_qqq_ranking_releases").select(columns)
    .lte("as_of", now).lte("approved_at", now)
    .order("as_of", { ascending: false }).order("approved_at", { ascending: false })
    .limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (result.error) unwrap(result, "live QQQ ranking release");
  return result.data as QqqRankingReleaseRow | null;
}

export async function getQqqRankingRelease(db: Db, hash: string): Promise<QqqRankingReleaseRow | null> {
  const result = await db.from("hermes_qqq_ranking_releases").select(columns)
    .eq("release_hash", hash).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (result.error) unwrap(result, "QQQ ranking release readback");
  return result.data as QqqRankingReleaseRow | null;
}

/** Privileged CLI only. Service-role grants allow SELECT/INSERT, not edits.
 * An uncertain/concurrent insert is resolved by its immutable content hash. */
export async function appendQqqRankingRelease(db: Db, row: QqqRankingReleaseRow): Promise<QqqRankingReleaseRow> {
  const existing = await getQqqRankingRelease(db, row.release_hash);
  if (existing) return existing;
  const result = await db.from("hermes_qqq_ranking_releases").insert(row).select(columns).single();
  if (result.error?.code === "23505") {
    const raced = await getQqqRankingRelease(db, row.release_hash);
    if (raced) return raced;
  }
  return unwrap(result, "append approved QQQ ranking release") as QqqRankingReleaseRow;
}

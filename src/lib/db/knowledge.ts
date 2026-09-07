import { unwrap, type Db } from "./query";
import type { ActivityRow, KnowledgeRow } from "./types";

export type KnowledgeDoc = KnowledgeRow;

export async function getKnowledgeIndex(db: Db, opts: { category?: string; persona?: string } = {}): Promise<Array<Omit<KnowledgeDoc, "body_md">>> {
  let q = db
    .from("hermes_knowledge")
    .select("id, slug, title, category, persona_slug, summary, source_repo, source_path, content_sha256, tags, is_active, display_order, created_at, updated_at")
    .eq("is_active", true)
    .order("category")
    .order("display_order")
    .order("title")
    .limit(500);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.persona) q = q.eq("persona_slug", opts.persona);
  return unwrap(await q, "knowledge index") as Array<Omit<KnowledgeDoc, "body_md">>;
}

export async function getKnowledgeDoc(db: Db, slug: string): Promise<KnowledgeDoc | null> {
  const rows = unwrap(await db.from("hermes_knowledge").select("*").eq("slug", slug).limit(1), "knowledge doc") as KnowledgeDoc[];
  return rows[0] ?? null;
}

export async function getActivity(db: Db, opts: { limit?: number; ticker?: string; kinds?: string[] } = {}): Promise<ActivityRow[]> {
  let q = db.from("hermes_activity").select("*").order("occurred_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.ticker) q = q.ilike("ticker", opts.ticker);
  if (opts.kinds?.length) q = q.in("kind", opts.kinds);
  return unwrap(await q, "activity") as ActivityRow[];
}

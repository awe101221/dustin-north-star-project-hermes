import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { noteCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getNotes } from "@/lib/db/research";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async ({ request, db }) => {
  const sp = request.nextUrl.searchParams;
  return json({ notes: await getNotes(db, { ticker: sp.get("ticker") ?? undefined, ideaId: sp.get("idea") ?? undefined, kind: sp.get("kind") ?? undefined, limit: Number(sp.get("limit") ?? 100) }) });
});

export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, noteCreate);
  if (!body.ok) return body.res;
  const inserted = unwrap(await db.from("hermes_notes").insert(body.data).select("*").limit(1), "note insert") as Array<Record<string, unknown>>;
  return json({ note: inserted[0] }, { status: 201 });
});

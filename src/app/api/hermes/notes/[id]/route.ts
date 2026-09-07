import { fail, json, parseBody, withAdmin } from "@/lib/server/handlers";
import { notePatch } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export const PATCH = withAdmin<{ id: string }>(async ({ request, params, db }) => {
  const body = await parseBody(request, notePatch);
  if (!body.ok) return body.res;
  const updated = unwrap(await db.from("hermes_notes").update(body.data).eq("id", params.id).select("*").limit(1), "note update") as Array<Record<string, unknown>>;
  if (!updated[0]) return fail("Note not found.", 404);
  return json({ note: updated[0] });
});

export const DELETE = withAdmin<{ id: string }>(async ({ params, db }) => {
  unwrap(await db.from("hermes_notes").delete().eq("id", params.id), "note delete");
  return json({ ok: true });
});

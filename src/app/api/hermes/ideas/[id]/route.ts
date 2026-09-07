import { fail, json, parseBody, withAdmin } from "@/lib/server/handlers";
import { ideaPatch } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getIdeaEvents } from "@/lib/db/pipeline";

export const dynamic = "force-dynamic";

export const GET = withAdmin<{ id: string }>(async ({ params, db }) => {
  const rows = unwrap(await db.from("hermes_ideas").select("*").eq("id", params.id).limit(1), "idea") as Array<Record<string, unknown>>;
  if (!rows[0]) return fail("Idea not found.", 404);
  return json({ idea: rows[0], events: await getIdeaEvents(db, params.id) });
});

export const PATCH = withAdmin<{ id: string }>(async ({ request, params, db }) => {
  const body = await parseBody(request, ideaPatch);
  if (!body.ok) return body.res;
  const updated = unwrap(await db.from("hermes_ideas").update(body.data).eq("id", params.id).select("*").limit(1), "idea update") as Array<Record<string, unknown>>;
  if (!updated[0]) return fail("Idea not found.", 404);
  return json({ idea: updated[0] });
});

export const DELETE = withAdmin<{ id: string }>(async ({ params, db }) => {
  unwrap(await db.from("hermes_ideas").delete().eq("id", params.id), "idea delete");
  return json({ ok: true });
});

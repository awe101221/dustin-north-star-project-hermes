import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { ideaReorder } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

/** Batch stage/order update after a drag — one round trip per drop. */
export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, ideaReorder);
  if (!body.ok) return body.res;
  for (const move of body.data.moves) {
    unwrap(await db.from("hermes_ideas").update({ stage: move.stage, sort_order: move.sort_order, owner: body.data.actor }).eq("id", move.id), "reorder");
  }
  return json({ ok: true, moved: body.data.moves.length });
});

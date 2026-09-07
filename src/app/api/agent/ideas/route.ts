import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { ideaCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

/** Upsert by ticker: update the active card when one exists, otherwise create it. Agents never move cards to `live` (that is a human, sizing decision). */
export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, ideaCreate);
  if (!body.ok) return body.res;
  const data = { ...body.data, source: body.data.source === "manual" ? "agent" : body.data.source, owner: body.data.owner === "dustin" ? "agent" : body.data.owner };
  if (data.stage === "live") data.stage = "diligence";
  const existing = unwrap(await db.from("hermes_ideas").select("id, stage").ilike("ticker", data.ticker).neq("stage", "archive").limit(1), "idea lookup") as Array<{ id: string; stage: string }>;
  if (existing[0]) {
    const { stage: _stage, ...patch } = data;
    const updated = unwrap(await db.from("hermes_ideas").update(patch).eq("id", existing[0].id).select("*").limit(1), "idea update") as Array<Record<string, unknown>>;
    return json({ idea: updated[0], created: false });
  }
  const maxOrder = unwrap(await db.from("hermes_ideas").select("sort_order").eq("stage", data.stage).order("sort_order", { ascending: false }).limit(1), "max order") as Array<{ sort_order: number }>;
  const inserted = unwrap(await db.from("hermes_ideas").insert({ ...data, sort_order: (maxOrder[0]?.sort_order ?? 0) + 1000 }).select("*").limit(1), "idea insert") as Array<Record<string, unknown>>;
  return json({ idea: inserted[0], created: true }, { status: 201 });
});

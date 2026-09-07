import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { noteCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

/** Agents write markdown notes; author defaults to the agent name in the body. */
export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, noteCreate);
  if (!body.ok) return body.res;
  const data = { ...body.data, kind: body.data.kind === "note" ? "agent" : body.data.kind, author: body.data.author === "dustin" ? "agent" : body.data.author, source_system: body.data.source_system === "hermes_app" ? "agent_api" : body.data.source_system };
  const inserted = unwrap(await db.from("hermes_notes").insert(data).select("id, title, kind, tickers, occurred_at").limit(1), "note insert") as Array<Record<string, unknown>>;
  return json({ note: inserted[0] }, { status: 201 });
});

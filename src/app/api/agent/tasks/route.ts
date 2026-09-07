import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { agentTaskCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getAgentTasks } from "@/lib/db/quant";

export const dynamic = "force-dynamic";

/** GET /api/agent/tasks?status=open — list; POST — agents can queue follow-up work for other agents. */
export const GET = withAgent(async ({ request, db }) => json({ tasks: await getAgentTasks(db, { status: request.nextUrl.searchParams.get("status") ?? "open", limit: 100 }) }));

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, agentTaskCreate);
  if (!body.ok) return body.res;
  const inserted = unwrap(await db.from("hermes_agent_tasks").insert({ ...body.data, created_by: body.data.created_by === "dustin" ? "agent" : body.data.created_by }).select("*").limit(1), "task insert") as Array<Record<string, unknown>>;
  return json({ task: inserted[0] }, { status: 201 });
});

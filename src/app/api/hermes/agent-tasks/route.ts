import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { agentTaskCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getAgentTasks } from "@/lib/db/quant";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async ({ request, db }) => json({ tasks: await getAgentTasks(db, { status: request.nextUrl.searchParams.get("status") ?? undefined }) }));

export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, agentTaskCreate);
  if (!body.ok) return body.res;
  const inserted = unwrap(await db.from("hermes_agent_tasks").insert(body.data).select("*").limit(1), "task insert") as Array<Record<string, unknown>>;
  return json({ task: inserted[0] }, { status: 201 });
});

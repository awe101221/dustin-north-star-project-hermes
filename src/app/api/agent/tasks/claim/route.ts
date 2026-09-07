import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { agentClaim } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

/** Atomically claim the highest-priority open task (SKIP LOCKED in the RPC). Returns {task: null} when the queue is empty. */
export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, agentClaim);
  if (!body.ok) return body.res;
  const rows = unwrap(await db.rpc("hermes_claim_agent_task", { p_agent: body.data.agent, p_task_types: body.data.task_types ?? null }), "claim") as Array<Record<string, unknown>>;
  return json({ task: rows[0] ?? null });
});

import { fail, json, parseBody, withAdmin } from "@/lib/server/handlers";
import { agentTaskPatch } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export const PATCH = withAdmin<{ id: string }>(async ({ request, params, db }) => {
  const body = await parseBody(request, agentTaskPatch);
  if (!body.ok) return body.res;
  const patch: Record<string, unknown> = { ...body.data };
  if (body.data.status === "open") Object.assign(patch, { assigned_agent: null, claimed_at: null, completed_at: null });
  if (body.data.status === "done" || body.data.status === "failed" || body.data.status === "cancelled") patch.completed_at = new Date().toISOString();
  const updated = unwrap(await db.from("hermes_agent_tasks").update(patch).eq("id", params.id).select("*").limit(1), "task update") as Array<Record<string, unknown>>;
  if (!updated[0]) return fail("Task not found.", 404);
  return json({ task: updated[0] });
});

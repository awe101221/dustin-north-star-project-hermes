import { fail, json, logActivity, parseBody, withAgent } from "@/lib/server/handlers";
import { agentComplete } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export const POST = withAgent<{ id: string }>(async ({ request, params, db }) => {
  const body = await parseBody(request, agentComplete);
  if (!body.ok) return body.res;
  const updated = unwrap(
    await db
      .from("hermes_agent_tasks")
      .update({ status: body.data.status, result: { ...body.data.result, summary: body.data.summary ?? null }, result_ref: body.data.result_ref, completed_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("*")
      .limit(1),
    "task complete",
  ) as Array<{ id: string; title: string; ticker: string | null; assigned_agent: string | null; task_type: string }>;
  const task = updated[0];
  if (!task) return fail("Task not found.", 404);
  await logActivity(db, {
    kind: `task.${body.data.status}`,
    title: `${task.assigned_agent ?? "agent"} ${body.data.status === "done" ? "completed" : "failed"}: ${task.title}`,
    detail: body.data.summary ?? null,
    ticker: task.ticker,
    ref_table: "hermes_agent_tasks",
    ref_id: task.id,
    actor: task.assigned_agent ?? "agent",
    payload: { task_type: task.task_type, result_ref: body.data.result_ref },
  });
  return json({ task });
});

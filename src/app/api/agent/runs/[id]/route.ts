import { fail, json, parseBody, withAgent } from "@/lib/server/handlers";
import { agentRunCompletionWindow, agentRunPatch, runIdParams } from "@/lib/server/schemas";
import { DbError, unwrap } from "@/lib/db/query";
import { domainDbErrorResponse } from "@/lib/server/domain-errors";

export const dynamic = "force-dynamic";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
const jsonPatchFields = new Set(["output_ref", "metrics", "metadata"]);
const patchableRunFields = ["status", "completed_at", "error", "output_ref", "metrics", "metadata"] as const;

function jsonSemanticallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => jsonSemanticallyEqual(value, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && jsonSemanticallyEqual(leftObject[key], rightObject[key]));
}

function isExactTerminalReplay(
  persisted: Record<string, unknown>,
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  if (typeof persisted.status !== "string" || !terminalStatuses.has(persisted.status)) return false;
  return patchableRunFields.every((field) => {
    const requested = patch[field];
    const expected = requested === undefined ? before[field] : requested;
    const current = persisted[field];
    if (field === "completed_at") {
      if (expected === null || current === null) return expected === current;
      return typeof expected === "string"
        && typeof current === "string"
        && Number.isFinite(Date.parse(expected))
        && Date.parse(expected) === Date.parse(current);
    }
    return jsonPatchFields.has(field)
      ? jsonSemanticallyEqual(current, expected)
      : Object.is(current, expected);
  });
}

export const PATCH = withAgent<{ id: string }>(async ({ request, params, db }) => {
  const parsedParams = runIdParams.safeParse(params);
  if (!parsedParams.success) return fail("Invalid run id.", 400, parsedParams.error.issues);
  const body = await parseBody(request, agentRunPatch);
  if (!body.ok) return body.res;
  try {
    // Establish exact-id existence before the update. A later empty RETURNING
    // result can then only be a suppressed no-op or a concurrent terminal
    // transition, never a row inserted after an update that matched nothing.
    const currentResult = await db.from("hermes_agent_runs").select("*").eq("id", parsedParams.data.id).maybeSingle();
    if (!currentResult.data && !currentResult.error) return fail("Agent run not found.", 404);
    const current = unwrap(currentResult, "agent run lifecycle lookup") as Record<string, unknown>;
    if (body.data.completed_at != null) {
      const completion = agentRunCompletionWindow.safeParse({
        started_at: current.started_at,
        completed_at: body.data.completed_at,
      });
      if (!completion.success) return fail("Validation failed.", 422, completion.error.issues);
    }
    const rows = unwrap(await db.from("hermes_agent_runs").update(body.data).eq("id", parsedParams.data.id).select("*").limit(1), "agent run update") as Array<Record<string, unknown>>;
    if (rows[0]) return json({ run: rows[0] });

    // The terminal append-closure trigger returns NULL for an exact physical
    // no-op, so UPDATE ... RETURNING is empty. Terminal rows cannot subsequently
    // change or be deleted, and the exact-id preflight above prevents a
    // post-update insert from being mistaken for a successful retry.
    const persistedResult = await db.from("hermes_agent_runs").select("*").eq("id", parsedParams.data.id).maybeSingle();
    if (!persistedResult.data && !persistedResult.error) return fail("Agent run not found.", 404);
    const persisted = unwrap(persistedResult, "agent run replay readback") as Record<string, unknown>;
    if (isExactTerminalReplay(persisted, current, body.data as Record<string, unknown>)) return json({ run: persisted });
    return fail("Agent run lifecycle conflict.", 409);
  } catch (e) {
    if (e instanceof DbError && e.code === "55000") return fail("Agent run lifecycle conflict.", 409, e.code);
    if (e instanceof DbError && e.code === "23514") return fail("Invalid agent run lifecycle transition.", 422, e.code);
    const response = domainDbErrorResponse(e, "Agent run update");
    if (response) return response;
    throw e;
  }
});

import { json, parseBody, parseQuery, withAgent } from "@/lib/server/handlers";
import { agentRunCreate, agentRunListQuery } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { domainDbErrorResponse } from "@/lib/server/domain-errors";

export const dynamic = "force-dynamic";

export const GET = withAgent(async ({ request, db }) => {
  const parsed = parseQuery(request.nextUrl.searchParams, agentRunListQuery);
  if (!parsed.ok) return parsed.res;
  const { limit, offset, ticker, workflow } = parsed.data;
  let query = db.from("hermes_agent_runs").select("*").order("started_at", { ascending: false }).order("id", { ascending: false });
  if (ticker) query = query.eq("ticker", ticker);
  if (workflow) query = query.eq("workflow_id", workflow);
  const rows = unwrap(await query.range(offset, offset + limit), "agent runs") as Array<Record<string, unknown>>;
  const runs = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return json({
    runs,
    pagination: { limit, offset, returned: runs.length, has_more: hasMore, next_offset: hasMore ? offset + limit : null },
  });
});

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, agentRunCreate);
  if (!body.ok) return body.res;
  try {
    const rows = unwrap(await db.from("hermes_agent_runs").insert(body.data).select("*").limit(1), "agent run insert") as Array<Record<string, unknown>>;
    return json({ run: rows[0] }, { status: 201 });
  } catch (error) {
    const response = domainDbErrorResponse(error, "Agent run");
    if (response) return response;
    throw error;
  }
});

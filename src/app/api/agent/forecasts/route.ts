import { fail, json, parseBody, parseQuery, withAgent } from "@/lib/server/handlers";
import { forecastCreate, forecastListQuery } from "@/lib/server/schemas";
import { DbError, unwrap } from "@/lib/db/query";
import { domainDbErrorResponse } from "@/lib/server/domain-errors";

export const dynamic = "force-dynamic";

export const GET = withAgent(async ({ request, db }) => {
  const parsed = parseQuery(request.nextUrl.searchParams, forecastListQuery);
  if (!parsed.ok) return parsed.res;
  const { limit, offset, ticker, status } = parsed.data;
  let query = db.from("hermes_forecast_evaluations").select("*").order("as_of", { ascending: false }).order("forecast_id", { ascending: false });
  if (ticker) query = query.eq("ticker", ticker);
  if (status) query = query.eq("status", status);
  const rows = unwrap(await query.range(offset, offset + limit), "forecast evaluations") as Array<Record<string, unknown>>;
  const forecasts = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return json({
    forecasts,
    pagination: { limit, offset, returned: forecasts.length, has_more: hasMore, next_offset: hasMore ? offset + limit : null },
  });
});

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, forecastCreate);
  if (!body.ok) return body.res;
  const runResult = await db.from("hermes_agent_runs").select("status").eq("id", body.data.agent_run_id).maybeSingle();
  if (!runResult.data && !runResult.error) return fail("Agent run was not found.", 404);
  const run = unwrap(runResult, "forecast agent run lookup") as { status: string };
  if (!["queued", "running"].includes(run.status)) {
    return fail("Only queued or running agent runs can register forecasts.", 409);
  }
  try {
    const rows = unwrap(await db.from("hermes_forecasts").insert(body.data).select("*").limit(1), "forecast insert") as Array<Record<string, unknown>>;
    return json({ forecast: rows[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof DbError && e.code === "55000") {
      return fail("Only queued or running agent runs can register forecasts.", 409);
    }
    if (e instanceof DbError && e.code === "P0002") return fail("Agent run was not found.", 404);
    const response = domainDbErrorResponse(e, "Forecast registration");
    if (response) return response;
    throw e;
  }
});

import { json, fail, parseBody, withAgent } from "@/lib/server/handlers";
import { ladderReviewCreate, type ForecastLadderInput } from "@/lib/forecast-ladder";
import { unwrap } from "@/lib/db/query";
export const POST = withAgent(async ({ db, request }) => {
  const parsed = await parseBody(request, ladderReviewCreate);
  if (!parsed.ok) return parsed.res;
  const f = unwrap(await db.from("hermes_ladder_evaluations").select("payload,outcome_id").eq("id", parsed.data.forecast_id).single(), "review forecast") as { payload: ForecastLadderInput; outcome_id: string | null };
  if (!f.outcome_id) return fail("Only graded forecasts can receive an outcome review", 422);
  if (parsed.data.failed_assumption_ids.some((id) => !f.payload.assumptions.some((a) => a.id === id))) return fail("Unknown assumption identity", 422);
  return json(unwrap(await db.rpc("hermes_review_ladder", { p_input: parsed.data }), "forecast review"));
});

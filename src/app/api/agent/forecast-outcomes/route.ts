import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { forecastOutcomeCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { domainDbErrorResponse } from "@/lib/server/domain-errors";

export const dynamic = "force-dynamic";

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, forecastOutcomeCreate);
  if (!body.ok) return body.res;
  try {
    const outcome = unwrap(await db.rpc("hermes_grade_forecast_outcome", {
      p_forecast_id: body.data.forecast_id,
      p_observed_at: body.data.observed_at,
      p_actual_value: body.data.actual_value,
      p_qqq_value: body.data.qqq_value ?? null,
      p_outcome_occurred: body.data.outcome_occurred ?? null,
      p_evidence_url: body.data.evidence_url,
      p_notes: body.data.notes ?? null,
      p_metadata: body.data.metadata,
    }), "forecast outcome grade");
    return json({ outcome }, { status: 201 });
  } catch (error) {
    const response = domainDbErrorResponse(error, "Forecast outcome");
    if (response) return response;
    throw error;
  }
});

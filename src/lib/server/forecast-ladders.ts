import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forecastLadderCreate, type ForecastLadderInput } from "@/lib/forecast-ladder";
import { unwrap } from "@/lib/db/query";

export async function registerForecastLadder(db: SupabaseClient, input: ForecastLadderInput) {
  return unwrap(await db.rpc("hermes_register_forecast_ladder", { p_input: forecastLadderCreate.parse(input) }), "forecast ladder registration");
}

import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { forecastLadderCreate } from "@/lib/forecast-ladder";
import { registerForecastLadder } from "@/lib/server/forecast-ladders";
import { getForecastLearning } from "@/lib/db/forecast-ladders";
export const dynamic = "force-dynamic";
export const GET = withAdmin(async ({ db, request }) => json(await getForecastLearning(db, request.nextUrl.searchParams.get("ticker") ?? undefined)));
export const POST = withAdmin(async ({ db, request }) => {
  const parsed = await parseBody(request, forecastLadderCreate);
  if (!parsed.ok) return parsed.res;
  return json(await registerForecastLadder(db, parsed.data));
});

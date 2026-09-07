import { json, withAgent } from "@/lib/server/handlers";
import { getMandate } from "@/lib/db/northstar";
import { getOpenRecommendations, getRecentAlerts } from "@/lib/db/portfolio";
import { getIdeas } from "@/lib/db/pipeline";

export const dynamic = "force-dynamic";

/** The standing brief for any agent: mission, rules, open recommendations, armed triggers, pipeline snapshot. */
export const GET = withAgent(async ({ db }) => {
  const [mandate, recs, alerts, ideas] = await Promise.all([getMandate(db), getOpenRecommendations(db), getRecentAlerts(db, 40), getIdeas(db)]);
  return json({
    mandate,
    open_recommendations: recs,
    alerts,
    pipeline: ideas.map((i) => ({ id: i.id, ticker: i.ticker, stage: i.stage, conviction: i.conviction, next_action: i.nextAction, persona: i.persona })),
  });
});

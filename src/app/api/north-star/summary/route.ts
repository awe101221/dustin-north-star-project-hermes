import { NextResponse } from "next/server";
import { DEFAULT_MANDATE, getMandate, getNorthStarStats } from "@/lib/db/northstar";
import { getOpenRecommendations, getRecentAlerts } from "@/lib/db/portfolio";
import { serverReadClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Everything the always-on North Star strip and drawer need, in one call. */
export async function GET() {
  const db = serverReadClient();
  if (!db) return NextResponse.json({ configured: false, mandate: DEFAULT_MANDATE });
  try {
    const [stats, mandate, recs, alerts] = await Promise.all([getNorthStarStats(db), getMandate(db), getOpenRecommendations(db), getRecentAlerts(db, 40)]);
    const lastRolling = [...stats.daily.rolling].reverse().find((r) => r.sharpe60 !== null);
    return NextResponse.json(
      {
        configured: true,
        asOf: stats.asOf,
        nav: stats.nav,
        ytdTwr: stats.ytdTwr,
        qqqYtd: stats.qqqYtd,
        ytdAlphaPp: stats.ytdAlphaPp,
        cumulativeAlpha: stats.cumulativeAlpha,
        sinceDate: stats.sinceDate,
        sharpe60: lastRolling?.sharpe60 ?? null,
        sortino60: lastRolling?.sortino60 ?? null,
        beta: stats.daily.beta,
        hitRate: stats.daily.hitRate,
        mandate,
        openRecommendations: recs.length,
        approachingTriggers: alerts.filter((a) => a.type.includes("approaching")).length,
      },
      { headers: { "cache-control": "private, max-age=30" } },
    );
  } catch (e) {
    return NextResponse.json({ configured: false, mandate: DEFAULT_MANDATE, error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}

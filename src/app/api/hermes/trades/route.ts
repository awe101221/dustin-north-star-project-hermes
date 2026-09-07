import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { tradeCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getTrades } from "@/lib/db/portfolio";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async ({ request, db }) => {
  const sp = request.nextUrl.searchParams;
  return json({ trades: await getTrades(db, { symbol: sp.get("symbol") ?? undefined, sleeveId: sp.get("sleeve") ?? undefined, limit: Number(sp.get("limit") ?? 200) }) });
});

export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, tradeCreate);
  if (!body.ok) return body.res;
  const data = body.data;
  const notional = data.notional_usd ?? (data.quantity !== null && data.quantity !== undefined && data.price !== null && data.price !== undefined ? data.quantity * data.price : null);
  const inserted = unwrap(await db.from("hermes_trades").insert({ ...data, notional_usd: notional }).select("*").limit(1), "trade insert") as Array<Record<string, unknown>>;
  return json({ trade: inserted[0] }, { status: 201 });
});

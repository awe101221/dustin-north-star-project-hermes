import { json, withAdmin } from "@/lib/server/handlers";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export const DELETE = withAdmin<{ id: string }>(async ({ params, db }) => {
  unwrap(await db.from("hermes_trades").delete().eq("id", params.id), "trade delete");
  return json({ ok: true });
});

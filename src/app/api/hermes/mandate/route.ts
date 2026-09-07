import { json, logActivity, parseBody, withAdmin } from "@/lib/server/handlers";
import { mandatePut } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getMandate } from "@/lib/db/northstar";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async ({ db }) => json({ mandate: await getMandate(db) }));

/** Replace the mandate; every save bumps the version so history is auditable in hermes_activity. */
export const PUT = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, mandatePut);
  if (!body.ok) return body.res;
  const current = unwrap(await db.from("hermes_mandate").select("version").eq("id", "north-star").limit(1), "mandate version") as Array<{ version: number }>;
  const version = (current[0]?.version ?? 0) + 1;
  const saved = unwrap(await db.from("hermes_mandate").upsert({ id: "north-star", version, ...body.data }, { onConflict: "id" }).select("*").limit(1), "mandate save") as Array<Record<string, unknown>>;
  await logActivity(db, { kind: "mandate.updated", title: `North Star mandate v${version} saved`, ref_table: "hermes_mandate", ref_id: "north-star", payload: { version } });
  return json({ mandate: saved[0] });
});

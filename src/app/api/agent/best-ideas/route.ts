import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { bestIdeasSnapshotCreate } from "@/lib/server/schemas";
import { publishBestIdeasSnapshot } from "@/lib/server/best-ideas";

export const dynamic = "force-dynamic";

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, bestIdeasSnapshotCreate);
  if (!body.ok) return body.res;
  const { actor, ...snapshot } = body.data;
  const result = await publishBestIdeasSnapshot(db, snapshot, actor);
  return json({ ok: true, ...result }, { status: 201 });
});

import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { learningSnapshotCreate } from "@/lib/server/schemas";
import { publishLearningSnapshot } from "@/lib/server/learnings";

export const dynamic = "force-dynamic";

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, learningSnapshotCreate);
  if (!body.ok) return body.res;
  const { actor, ...snapshot } = body.data;
  const result = await publishLearningSnapshot(db, snapshot, actor);
  return json({ ok: true, ...result }, { status: 201 });
});

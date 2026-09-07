import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { learningSnapshotCreate } from "@/lib/server/schemas";
import { publishLearningSnapshot } from "@/lib/server/learnings";

export const dynamic = "force-dynamic";

export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, learningSnapshotCreate);
  if (!body.ok) return body.res;
  const { actor, ...snapshot } = body.data;
  const result = await publishLearningSnapshot(db, snapshot, actor);
  return json({ ok: true, ...result }, { status: 201 });
});

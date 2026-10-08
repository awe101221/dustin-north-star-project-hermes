import { fail, parseBody, withAgent } from "@/lib/server/handlers";
import { bestIdeasSnapshotCreate } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/** Legacy input is still validated; the retired publisher performs no writes. */
export const POST = withAgent(async ({ request }) => {
  const body = await parseBody(request, bestIdeasSnapshotCreate);
  if (!body.ok) return body.res;
  return fail("10+10 ranking publication is retired. Use the independently reviewed Top 50 workflow in docs/workflows/top-50-rankings.md.", 410);
});

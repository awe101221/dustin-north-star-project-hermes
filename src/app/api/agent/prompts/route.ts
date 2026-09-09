import { json, parseBody, parseQuery, withAgent } from "@/lib/server/handlers";
import { promptListQuery, promptVersionCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { domainDbErrorResponse } from "@/lib/server/domain-errors";

export const dynamic = "force-dynamic";

export const GET = withAgent(async ({ request, db }) => {
  const parsed = parseQuery(request.nextUrl.searchParams, promptListQuery);
  if (!parsed.ok) return parsed.res;
  const { limit, offset } = parsed.data;
  const rows = unwrap(await db.from("hermes_prompt_versions").select("*").order("released_at", { ascending: false }).order("prompt_id").order("version").range(offset, offset + limit), "prompt versions") as Array<Record<string, unknown>>;
  const prompts = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return json({
    prompts,
    pagination: { limit, offset, returned: prompts.length, has_more: hasMore, next_offset: hasMore ? offset + limit : null },
  });
});

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, promptVersionCreate);
  if (!body.ok) return body.res;
  try {
    const rows = unwrap(await db.from("hermes_prompt_versions").insert(body.data).select("*").limit(1), "prompt version insert") as Array<Record<string, unknown>>;
    return json({ prompt: rows[0] }, { status: 201 });
  } catch (error) {
    const response = domainDbErrorResponse(error, "Prompt version");
    if (response) return response;
    throw error;
  }
});

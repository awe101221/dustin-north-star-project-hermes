import { fail, json, parseBody, withAdmin } from "@/lib/server/handlers";
import { ideaCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getIdeas } from "@/lib/db/pipeline";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async ({ request, db }) => {
  const includeArchived = request.nextUrl.searchParams.get("archived") === "1";
  return json({ ideas: await getIdeas(db, { includeArchived }) });
});

export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, ideaCreate);
  if (!body.ok) return body.res;
  const { data } = body;

  // One active card per ticker: if it exists, return it instead of failing.
  const existing = unwrap(await db.from("hermes_ideas").select("*").ilike("ticker", data.ticker).neq("stage", "archive").limit(1), "idea lookup") as Array<{ id: string }>;
  if (existing[0]) return fail(`An active idea for ${data.ticker} already exists.`, 409, { id: existing[0].id });

  const maxOrder = unwrap(await db.from("hermes_ideas").select("sort_order").eq("stage", data.stage).order("sort_order", { ascending: false }).limit(1), "max order") as Array<{ sort_order: number }>;
  const inserted = unwrap(
    await db
      .from("hermes_ideas")
      .insert({ ...data, sort_order: (maxOrder[0]?.sort_order ?? 0) + 1000 })
      .select("*")
      .limit(1),
    "idea insert",
  ) as Array<Record<string, unknown>>;
  return json({ idea: inserted[0] }, { status: 201 });
});

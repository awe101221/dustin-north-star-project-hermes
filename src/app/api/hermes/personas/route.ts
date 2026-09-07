import { fail, json, logActivity, parseBody, withAdmin } from "@/lib/server/handlers";
import { personaCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";

export const dynamic = "force-dynamic";

/**
 * Create a new analyst persona. Personas live in the legacy analyst_personas
 * table so every existing worker (queue runner, rankings, memo triggers)
 * recognises them immediately — the persona architecture is extended, not
 * forked.
 */
export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, personaCreate);
  if (!body.ok) return body.res;
  const { headline, persona_prompt, metadata, ...rest } = body.data;
  const existing = unwrap(await db.from("analyst_personas").select("slug").eq("slug", rest.slug).limit(1), "persona lookup") as Array<{ slug: string }>;
  if (existing[0]) return fail(`Persona ${rest.slug} already exists.`, 409);
  const row = {
    ...rest,
    metadata: {
      ...metadata,
      headline: headline ?? null,
      persona_prompt: persona_prompt ?? null,
      output_route: `/personas/${rest.slug}`,
      created_by: "hermes_app",
      framework_version_history: [{ from: null, to: rest.framework_version, reason: "created in Hermes", bumped_at: new Date().toISOString() }],
    },
  };
  const inserted = unwrap(await db.from("analyst_personas").insert(row).select("*").limit(1), "persona insert") as Array<Record<string, unknown>>;
  await logActivity(db, { kind: "persona.created", title: `Persona ${rest.display_name} created`, ref_table: "analyst_personas", ref_id: rest.slug });
  return json({ persona: inserted[0] }, { status: 201 });
});

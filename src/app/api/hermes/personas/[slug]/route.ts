import { fail, json, logActivity, parseBody, withAdmin } from "@/lib/server/handlers";
import { personaPatch } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { toRecord } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Edit a persona. Prompt/headline live in metadata; a framework bump is recorded in metadata.framework_version_history. */
export const PATCH = withAdmin<{ slug: string }>(async ({ request, params, db }) => {
  const body = await parseBody(request, personaPatch);
  if (!body.ok) return body.res;
  const current = unwrap(await db.from("analyst_personas").select("*").eq("slug", params.slug).limit(1), "persona") as Array<Record<string, unknown>>;
  if (!current[0]) return fail("Persona not found.", 404);
  const meta = toRecord(current[0].metadata);
  const { headline, persona_prompt, metadata, ...rest } = body.data;
  const history = Array.isArray(meta.framework_version_history) ? [...(meta.framework_version_history as unknown[])] : [];
  if (rest.framework_version && rest.framework_version !== current[0].framework_version) {
    history.push({ from: current[0].framework_version, to: rest.framework_version, reason: "edited in Hermes", bumped_at: new Date().toISOString() });
  }
  const nextMeta = {
    ...meta,
    ...(metadata ?? {}),
    ...(headline !== undefined ? { headline } : {}),
    ...(persona_prompt !== undefined ? { persona_prompt } : {}),
    framework_version_history: history,
  };
  const updated = unwrap(await db.from("analyst_personas").update({ ...rest, metadata: nextMeta }).eq("slug", params.slug).select("*").limit(1), "persona update") as Array<Record<string, unknown>>;
  await logActivity(db, { kind: "persona.updated", title: `Persona ${params.slug} updated`, ref_table: "analyst_personas", ref_id: params.slug, payload: { fields: Object.keys(body.data) } });
  return json({ persona: updated[0] });
});

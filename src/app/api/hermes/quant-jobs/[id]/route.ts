import { fail, json, parseBody, withAdmin } from "@/lib/server/handlers";
import { quantJobPatch } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getQuantJob } from "@/lib/db/quant";
import { runQuantJob } from "@/lib/quant/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withAdmin<{ id: string }>(async ({ params, db }) => {
  const job = await getQuantJob(db, params.id);
  return job ? json({ job }) : fail("Job not found.", 404);
});

export const PATCH = withAdmin<{ id: string }>(async ({ request, params, db }) => {
  const body = await parseBody(request, quantJobPatch);
  if (!body.ok) return body.res;
  const updated = unwrap(await db.from("hermes_quant_jobs").update(body.data).eq("id", params.id).select("*").limit(1), "job update") as Array<Record<string, unknown>>;
  if (!updated[0]) return fail("Job not found.", 404);
  return json({ job: updated[0] });
});

/** POST = (re)run the job with the Hermes engine. */
export const POST = withAdmin<{ id: string }>(async ({ params, db }) => {
  const job = await getQuantJob(db, params.id);
  if (!job) return fail("Job not found.", 404);
  return json({ job: await runQuantJob(db, job) });
});

export const DELETE = withAdmin<{ id: string }>(async ({ params, db }) => {
  unwrap(await db.from("hermes_quant_jobs").delete().eq("id", params.id), "job delete");
  return json({ ok: true });
});

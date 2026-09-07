import { fail, json, parseBody, withAgent } from "@/lib/server/handlers";
import { quantJobCreate, quantJobPatch } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { runQuantJob } from "@/lib/quant/runner";
import type { QuantJobRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST: create (and optionally run with the built-in engine). PATCH ?id=: agents store their own results. */
export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, quantJobCreate);
  if (!body.ok) return body.res;
  const { run, ...data } = body.data;
  const inserted = unwrap(await db.from("hermes_quant_jobs").insert({ ...data, requested_by: data.requested_by === "dustin" ? "agent" : data.requested_by }).select("*").limit(1), "job insert") as QuantJobRow[];
  const job = inserted[0]!;
  return json({ job: run ? await runQuantJob(db, job) : job }, { status: 201 });
});

export const PATCH = withAgent(async ({ request, db }) => {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("id query param required.");
  const body = await parseBody(request, quantJobPatch);
  if (!body.ok) return body.res;
  const patch: Record<string, unknown> = { ...body.data };
  if (body.data.status === "done" || body.data.status === "error") patch.finished_at = new Date().toISOString();
  const updated = unwrap(await db.from("hermes_quant_jobs").update(patch).eq("id", id).select("*").limit(1), "job update") as QuantJobRow[];
  if (!updated[0]) return fail("Job not found.", 404);
  return json({ job: updated[0] });
});

import { json, parseBody, withAdmin } from "@/lib/server/handlers";
import { quantJobCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { getQuantJobs } from "@/lib/db/quant";
import { runQuantJob } from "@/lib/quant/runner";
import type { QuantJobRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withAdmin(async ({ request, db }) => {
  const kind = request.nextUrl.searchParams.get("kind") as QuantJobRow["kind"] | null;
  return json({ jobs: await getQuantJobs(db, kind ?? undefined) });
});

/** Create a job; with run=true it is executed inline and stored with its result. */
export const POST = withAdmin(async ({ request, db }) => {
  const body = await parseBody(request, quantJobCreate);
  if (!body.ok) return body.res;
  const { run, ...data } = body.data;
  const inserted = unwrap(await db.from("hermes_quant_jobs").insert({ ...data, status: run ? "queued" : data.status }).select("*").limit(1), "job insert") as QuantJobRow[];
  const job = inserted[0]!;
  if (!run) return json({ job }, { status: 201 });
  const result = await runQuantJob(db, job);
  return json({ job: result }, { status: 201 });
});

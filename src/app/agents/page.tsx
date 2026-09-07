import type { Metadata } from "next";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getAgentTasks, getQuantJobs } from "@/lib/db/quant";
import { unwrap } from "@/lib/db/query";
import { agentToken, isWriteConfigured } from "@/lib/env";
import { safeLoad } from "@/lib/server/safe";
import { AgentConsole, type Automation } from "@/components/agents/agent-console";

export const metadata: Metadata = { title: "Agents & Jobs" };
export const dynamic = "force-dynamic";

function hoursSince(iso: string | null | undefined) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : (Date.now() - t) / 3600000;
}

export default async function AgentsPage() {
  const db = serverReadClient();
  const header = (
    <PageHeader
      eyebrow="Agent control hooks"
      title="Agents, jobs & automations"
      description="The task queue AI agents claim from, the quant jobs they run, and the legacy Awe Capital automations Hermes reads from. Agents authenticate with HERMES_AGENT_TOKEN and write through the same validated API the UI uses."
    />
  );
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(async () => {
    const [tasks, jobs, digests, guru, f13, filings, refreshes, queue] = await Promise.all([
      getAgentTasks(db, { limit: 200 }),
      getQuantJobs(db, undefined, 30),
      db.from("master_digests").select("as_of").order("as_of", { ascending: false }).limit(1).then((r) => unwrap(r, "digests") as Array<{ as_of: string }>),
      db.from("guru_activity_snapshots").select("fetched_at, status, records_loaded").order("fetched_at", { ascending: false }).limit(1).then((r) => unwrap(r, "guru") as Array<{ fetched_at: string; status: string; records_loaded: number }>),
      db.from("tracked_13f_runs").select("completed_at, status, holdings_count").order("completed_at", { ascending: false }).limit(1).then((r) => unwrap(r, "13f") as Array<{ completed_at: string; status: string; holdings_count: number }>),
      db.from("company_filing_enrichment_runs").select("completed_at, status, inserted_count").order("completed_at", { ascending: false }).limit(1).then((r) => unwrap(r, "filings") as Array<{ completed_at: string; status: string; inserted_count: number }>),
      db.from("analyst_memo_refreshes").select("refreshed_at").order("refreshed_at", { ascending: false }).limit(1).then((r) => unwrap(r, "refresh") as Array<{ refreshed_at: string }>),
      db.from("research_queue").select("status").in("status", ["pending", "processing", "error"]).limit(2000).then((r) => unwrap(r, "queue") as Array<{ status: string }>),
    ]);
    const automations: Automation[] = [
      { name: "Master refresh (scores, recs, digest)", cadence: "daily 11:30 UTC (legacy cron)", lastRun: digests[0]?.as_of ?? null, staleHours: hoursSince(digests[0]?.as_of), detail: "master_digests" },
      { name: "Memo refresh (re-price memos vs quotes)", cadence: "daily", lastRun: refreshes[0]?.refreshed_at ?? null, staleHours: hoursSince(refreshes[0]?.refreshed_at), detail: "analyst_memo_refreshes" },
      { name: "Guru activity snapshot", cadence: "weekly Mon 11:00 UTC", lastRun: guru[0]?.fetched_at ?? null, staleHours: hoursSince(guru[0]?.fetched_at), detail: `${guru[0]?.status ?? ""} · ${guru[0]?.records_loaded ?? 0} records` },
      { name: "Tracked 13F sync", cadence: "daily 10:30 UTC", lastRun: f13[0]?.completed_at ?? null, staleHours: hoursSince(f13[0]?.completed_at), detail: `${f13[0]?.status ?? ""} · ${f13[0]?.holdings_count ?? 0} holdings` },
      { name: "Company filings enrichment", cadence: "4× daily", lastRun: filings[0]?.completed_at ?? null, staleHours: hoursSince(filings[0]?.completed_at), detail: `${filings[0]?.status ?? ""} · +${filings[0]?.inserted_count ?? 0}` },
      { name: "Research queue (underwrite workers)", cadence: "continuous", lastRun: null, staleHours: null, detail: `pending ${queue.filter((q) => q.status === "pending").length} · processing ${queue.filter((q) => q.status === "processing").length} · error ${queue.filter((q) => q.status === "error").length}` },
    ];
    return { tasks, jobs, automations };
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  return (
    <>
      {header}
      <AgentConsole tasks={result.data.tasks} jobs={result.data.jobs} automations={result.data.automations} config={{ write: isWriteConfigured(), agentApi: Boolean(agentToken()) }} />
    </>
  );
}

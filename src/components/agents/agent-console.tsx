"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, queryKeys } from "@/lib/api";
import { getBrowserClient } from "@/lib/supabase/public";
import { getAgentTasks } from "@/lib/db/quant";
import type { AgentTaskRow, QuantJobRow } from "@/lib/db/types";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerLink } from "@/components/ticker-link";

export type Automation = { name: string; cadence: string; lastRun: string | null; staleHours: number | null; detail: string };

const TASK_TYPES = ["underwrite", "refresh_memo", "screen", "backtest", "review", "theme", "custom"];

export function AgentConsole({ tasks, jobs, automations, config }: { tasks: AgentTaskRow[]; jobs: QuantJobRow[]; automations: Automation[]; config: { write: boolean; agentApi: boolean } }) {
  const queryClient = useQueryClient();
  const live = useQuery({
    queryKey: queryKeys.agentTasks,
    queryFn: async () => {
      const client = getBrowserClient();
      if (!client) return tasks;
      return getAgentTasks(client, { limit: 200 });
    },
    initialData: tasks,
  });
  useRealtime(["hermes_agent_tasks", "hermes_quant_jobs"], [queryKeys.agentTasks, queryKeys.quantJobs()]);
  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/api/hermes/agent-tasks/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.agentTasks }),
    onError: (e) => toast.error(e.message),
  });
  const rows = live.data ?? tasks;
  const [filter, setFilter] = React.useState<string>("active");
  const shown = rows.filter((t) => (filter === "active" ? ["open", "claimed"].includes(t.status) : filter === "all" ? true : t.status === filter));

  return (
    <Tabs defaultValue="tasks">
      <TabsList>
        <TabsTrigger value="tasks">Task queue · {rows.filter((t) => t.status === "open").length} open</TabsTrigger>
        <TabsTrigger value="automations">Automations</TabsTrigger>
        <TabsTrigger value="api">Agent API</TabsTrigger>
      </TabsList>

      <TabsContent value="tasks" className="space-y-3">
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="active">Open + claimed</option><option value="open">Open</option><option value="claimed">Claimed</option><option value="done">Done</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="all">All</option></Select>
          <span className="text-[11.5px] text-muted">{shown.length} tasks</span>
          <span className="flex-1" />
          <NewTaskDialog disabled={!config.write} />
        </div>
        <div className="space-y-1.5">
          {shown.map((t) => (
            <details key={t.id} className="panel px-4 py-2.5">
              <summary className="flex items-center gap-2 cursor-pointer text-[12.5px]">
                <span className={cn("num text-[10.5px] w-6 text-center rounded bg-surface-3", t.priority >= 70 && "text-gold")}>{t.priority}</span>
                <Badge variant="muted">{t.task_type}</Badge>
                <span className="font-medium text-foreground truncate">{t.title}</span>
                {t.ticker ? <TickerLink ticker={t.ticker} /> : null}
                <Badge variant={toneFor(t.status)}>{t.status}</Badge>
                {t.assigned_agent ? <span className="text-[11px] text-muted">→ {t.assigned_agent}</span> : null}
                <span className="ml-auto text-[10.5px] text-muted num">{fmtRelative(t.created_at)}</span>
                {config.write && ["open", "claimed"].includes(t.status) ? <Button size="xs" variant="ghost" onClick={(e) => { e.preventDefault(); patch.mutate({ id: t.id, status: "cancelled" }); }}><XCircle /> cancel</Button> : null}
                {config.write && ["failed", "cancelled", "claimed"].includes(t.status) ? <Button size="xs" variant="ghost" onClick={(e) => { e.preventDefault(); patch.mutate({ id: t.id, status: "open" }); }}><RotateCcw /> reopen</Button> : null}
              </summary>
              <div className="mt-2 text-[12px] text-foreground-secondary whitespace-pre-wrap">{t.instructions}</div>
              <div className="mt-2 text-[11px] text-muted num">created {fmtDateTime(t.created_at)} by {t.created_by}{t.claimed_at ? ` · claimed ${fmtDateTime(t.claimed_at)}` : ""}{t.completed_at ? ` · completed ${fmtDateTime(t.completed_at)}` : ""}</div>
              {t.result || Object.keys(t.result_ref ?? {}).length ? <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-surface-2 p-3 text-[11px] num">{JSON.stringify({ result: t.result, result_ref: t.result_ref }, null, 2)}</pre> : null}
            </details>
          ))}
          {shown.length === 0 ? <p className="text-[12px] text-muted">No tasks in this view.</p> : null}
        </div>
        <Card>
          <CardHeader><div><CardTitle>Recent quant jobs</CardTitle><CardDescription>Screens and backtests, from the UI or from agents.</CardDescription></div></CardHeader>
          <CardContent>
            {jobs.slice(0, 10).map((j) => (
              <div key={j.id} className="flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[12px]"><Badge variant="muted">{j.kind}</Badge><span className="text-foreground truncate">{j.name}</span><Badge variant={toneFor(j.status)}>{j.status}</Badge><span className="text-muted truncate flex-1">{j.result_summary ?? j.error}</span><span className="text-[10.5px] text-muted num">{fmtRelative(j.created_at)}</span></div>
            ))}
            {jobs.length === 0 ? <p className="text-[12px] text-muted">No jobs yet.</p> : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="automations">
        <Card>
          <CardHeader><div><CardTitle>Legacy Awe Capital automations Hermes depends on</CardTitle><CardDescription>These still run on the awe-capital Vercel project. Hermes reads their outputs; nothing here re-implements them (see README → Data pipelines).</CardDescription></div></CardHeader>
          <CardContent>
            <table className="w-full text-[12px]">
              <thead><tr className="text-left"><th className="eyebrow py-1">Automation</th><th className="eyebrow py-1">Cadence</th><th className="eyebrow py-1">Last run</th><th className="eyebrow py-1">Detail</th></tr></thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.name} className="border-t border-border">
                    <td className="py-1.5 text-foreground">{a.name}</td>
                    <td className="py-1.5 text-muted">{a.cadence}</td>
                    <td className={cn("py-1.5 num", a.staleHours === null ? "text-muted" : a.staleHours > 72 ? "text-warn" : "text-foreground-secondary")}>{a.lastRun ? fmtDateTime(a.lastRun) : "—"}</td>
                    <td className="py-1.5 text-muted">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="api">
        <Card>
          <CardHeader><div><CardTitle>Agent API</CardTitle><CardDescription>Bearer token: HERMES_AGENT_TOKEN — {config.agentApi ? <span className="text-pos">configured</span> : <span className="text-warn">not set (API disabled)</span>}. Full reference in README → Agent integration.</CardDescription></div></CardHeader>
          <CardContent>
            <pre className="rounded-md border border-border bg-surface-2 p-3 text-[11px] num overflow-auto">{`# claim the next open task (optionally filtered by type)
curl -X POST $HERMES_URL/api/agent/tasks/claim \\
  -H "Authorization: Bearer $HERMES_AGENT_TOKEN" -H "content-type: application/json" \\
  -d '{"agent":"claude-code","task_types":["underwrite","refresh_memo"]}'

# read everything Hermes knows about a ticker
curl $HERMES_URL/api/agent/context?ticker=NAS:MU -H "Authorization: Bearer $HERMES_AGENT_TOKEN"

# write a note / upsert a pipeline idea / complete the task
curl -X POST $HERMES_URL/api/agent/notes  -H "Authorization: Bearer $HERMES_AGENT_TOKEN" -d '{"title":"…","body_md":"…","tickers":["NAS:MU"],"kind":"agent"}'
curl -X POST $HERMES_URL/api/agent/ideas  -H "Authorization: Bearer $HERMES_AGENT_TOKEN" -d '{"ticker":"NAS:MU","stage":"diligence","thesis":"…"}'
curl -X POST $HERMES_URL/api/agent/tasks/<id>/complete -H "Authorization: Bearer $HERMES_AGENT_TOKEN" -d '{"status":"done","result_ref":{"table":"analyst_memos","id":"…"}}'`}</pre>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function NewTaskDialog({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ task_type: "underwrite", title: "", ticker: "", priority: "50", instructions: "" });
  const create = useMutation({
    mutationFn: () => api("/api/hermes/agent-tasks", { method: "POST", json: { ...form, priority: Number(form.priority), ticker: form.ticker || null, instructions: form.instructions || null } }),
    onSuccess: () => { toast.success("Task queued"); setOpen(false); setForm({ task_type: "underwrite", title: "", ticker: "", priority: "50", instructions: "" }); void queryClient.invalidateQueries({ queryKey: queryKeys.agentTasks }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}><Plus /> New task</Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Queue an agent task</DialogTitle><DialogDescription>Any agent with the token can claim it; the result lands back here with pointers to what was written.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><Select value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} className="w-full">{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></div>
          <div><Label>Priority 0–100</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
          <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></div>
          <div><Label>Ticker (optional)</Label><Input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} className="num" /></div>
          <div className="col-span-2"><Label>Instructions</Label><Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="min-h-[120px]" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={!form.title || create.isPending}>Queue</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

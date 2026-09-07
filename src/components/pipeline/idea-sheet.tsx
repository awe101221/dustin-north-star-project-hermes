"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, queryKeys } from "@/lib/api";
import { getBrowserClient } from "@/lib/supabase/public";
import { getIdeaEvents, STAGE_META, type Idea } from "@/lib/db/pipeline";
import { getNotes } from "@/lib/db/research";
import { IDEA_STAGES, type IdeaStage } from "@/lib/db/types";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TickerLink } from "@/components/ticker-link";

type Form = {
  stage: IdeaStage;
  conviction: string;
  risk_score: string;
  target_weight_pct: string;
  thesis: string;
  why_beat_qqq: string;
  falsifier: string;
  catalyst: string;
  next_action: string;
  persona_slug: string;
  tags: string;
  archived_reason: string;
};

function toForm(i: Idea): Form {
  return {
    stage: i.stage,
    conviction: i.conviction ? String(i.conviction) : "",
    risk_score: i.risk ? String(i.risk) : "",
    target_weight_pct: i.targetWeight !== null ? String(i.targetWeight * 100) : "",
    thesis: i.thesis ?? "",
    why_beat_qqq: i.whyBeatQqq ?? "",
    falsifier: i.falsifier ?? "",
    catalyst: i.catalyst ?? "",
    next_action: i.nextAction ?? "",
    persona_slug: i.persona ?? "",
    tags: i.tags.join(", "),
    archived_reason: i.archivedReason ?? "",
  };
}

/** Keyed by idea id so form state resets cleanly when a different card opens. */
export function IdeaSheet({ idea, personas, canWrite, onClose }: { idea: Idea | null; personas: Array<{ slug: string; name: string }>; canWrite: boolean; onClose: () => void }) {
  if (!idea) return <Dialog open={false} />;
  return <IdeaSheetBody key={idea.id} idea={idea} personas={personas} canWrite={canWrite} onClose={onClose} />;
}

function IdeaSheetBody({ idea, personas, canWrite, onClose }: { idea: Idea; personas: Array<{ slug: string; name: string }>; canWrite: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<Form>(() => toForm(idea));
  const [quickNote, setQuickNote] = React.useState("");

  const events = useQuery({
    queryKey: queryKeys.ideaEvents(idea.id),
    queryFn: async () => {
      const client = getBrowserClient();
      if (!client) return [];
      return getIdeaEvents(client, idea.id);
    },
  });
  const notes = useQuery({
    queryKey: queryKeys.notes(`idea:${idea.id}`),
    queryFn: async () => {
      const client = getBrowserClient();
      if (!client) return [];
      return getNotes(client, { ideaId: idea.id, limit: 20 });
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/api/hermes/ideas/${idea.id}`, {
        method: "PATCH",
        json: {
          stage: form.stage,
          conviction: form.conviction ? Number(form.conviction) : null,
          risk_score: form.risk_score ? Number(form.risk_score) : null,
          target_weight_pct: form.target_weight_pct ? Number(form.target_weight_pct) / 100 : null,
          thesis: form.thesis || null,
          why_beat_qqq: form.why_beat_qqq || null,
          falsifier: form.falsifier || null,
          catalyst: form.catalyst || null,
          next_action: form.next_action || null,
          persona_slug: form.persona_slug || null,
          tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
          archived_reason: form.archived_reason || null,
        },
      }),
    onSuccess: () => {
      toast.success("Idea saved");
      void queryClient.invalidateQueries({ queryKey: queryKeys.ideas });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ideaEvents(idea.id) });
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/hermes/ideas/${idea.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Idea deleted");
      onClose();
      void queryClient.invalidateQueries({ queryKey: queryKeys.ideas });
    },
    onError: (e) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: () =>
      api("/api/hermes/notes", {
        method: "POST",
        json: { kind: "note", title: `${idea.symbol}: ${quickNote.slice(0, 60)}`, body_md: quickNote, tickers: [idea.ticker], idea_id: idea.id, tags: ["pipeline"], persona_slug: idea.persona },
      }),
    onSuccess: () => {
      setQuickNote("");
      toast.success("Note added");
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes(`idea:${idea.id}`) });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent width="max-w-2xl">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <div className="flex items-center gap-2">
                <TickerLink ticker={idea.ticker} showExchange className="text-[18px]" />
                <Badge variant={toneFor(idea.stage)}>{STAGE_META[idea.stage].label}</Badge>
              </div>
              <DialogTitle className="text-[14px] font-medium text-foreground-secondary mt-0.5">{idea.companyName ?? idea.ticker}</DialogTitle>
              <DialogDescription className="mt-0.5">
                source {idea.source} · owner {idea.owner} · in stage since {fmtDateTime(idea.stageChangedAt)}
                {idea.currentWeight ? <span className="sensitive"> · held {fmtPct(idea.currentWeight, 2)}</span> : null}
              </DialogDescription>
            </div>
            <div className="flex gap-1.5">
              <Button asChild variant="secondary" size="sm"><Link href={`/companies/${encodeURIComponent(idea.ticker)}`}><ExternalLink /> Company</Link></Button>
              {idea.memoId ? <Button asChild variant="secondary" size="sm"><Link href={`/research/${idea.memoId}`}><FileText /> Memo</Link></Button> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><Label>Stage</Label><Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as IdeaStage })} className="w-full" disabled={!canWrite}>{IDEA_STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}</Select></div>
            <div><Label>Conviction 1–5</Label><Input type="number" min={1} max={5} value={form.conviction} onChange={(e) => setForm({ ...form, conviction: e.target.value })} disabled={!canWrite} /></div>
            <div><Label>Risk 1–5</Label><Input type="number" min={1} max={5} value={form.risk_score} onChange={(e) => setForm({ ...form, risk_score: e.target.value })} disabled={!canWrite} /></div>
            <div><Label>Target weight %</Label><Input type="number" step="0.25" value={form.target_weight_pct} onChange={(e) => setForm({ ...form, target_weight_pct: e.target.value })} disabled={!canWrite} /></div>
            <div className="col-span-2"><Label>Lens</Label><Select value={form.persona_slug} onChange={(e) => setForm({ ...form, persona_slug: e.target.value })} className="w-full" disabled={!canWrite}><option value="">—</option>{personas.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</Select></div>
            <div className="col-span-2"><Label>Tags</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} disabled={!canWrite} /></div>
          </div>
          <div><Label>Thesis</Label><Textarea value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} disabled={!canWrite} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Why this beats QQQ</Label><Textarea value={form.why_beat_qqq} onChange={(e) => setForm({ ...form, why_beat_qqq: e.target.value })} disabled={!canWrite} className="min-h-[70px]" /></div>
            <div><Label>Falsifier</Label><Textarea value={form.falsifier} onChange={(e) => setForm({ ...form, falsifier: e.target.value })} disabled={!canWrite} className="min-h-[70px]" /></div>
            <div><Label>Catalyst</Label><Textarea value={form.catalyst} onChange={(e) => setForm({ ...form, catalyst: e.target.value })} disabled={!canWrite} className="min-h-[60px]" /></div>
            <div><Label>Next action</Label><Textarea value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} disabled={!canWrite} className="min-h-[60px]" /></div>
          </div>
          {form.stage === "archive" ? <div><Label>Archive reason</Label><Input value={form.archived_reason} onChange={(e) => setForm({ ...form, archived_reason: e.target.value })} disabled={!canWrite} /></div> : null}
          <div className="flex items-center gap-2">
            <Button onClick={() => save.mutate()} disabled={!canWrite || save.isPending}><Save /> {save.isPending ? "Saving…" : "Save"}</Button>
            <Button asChild variant="secondary"><Link href={`/research/new?ticker=${encodeURIComponent(idea.ticker)}&idea=${idea.id}`}>Write full note</Link></Button>
            <span className="flex-1" />
            <Button variant="destructive" size="sm" onClick={() => { if (confirm("Delete this idea and its events?")) remove.mutate(); }} disabled={!canWrite}><Trash2 /> Delete</Button>
          </div>

          <div>
            <p className="eyebrow mb-2">Notes</p>
            <div className="flex gap-2">
              <Input value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="Quick note (markdown ok)…" disabled={!canWrite} onKeyDown={(e) => { if (e.key === "Enter" && quickNote.trim()) addNote.mutate(); }} />
              <Button variant="secondary" onClick={() => addNote.mutate()} disabled={!quickNote.trim() || !canWrite}>Add</Button>
            </div>
            <div className="mt-2 space-y-1">
              {(notes.data ?? []).map((n) => (
                <Link key={n.id} href={`/research/${n.id}`} className="block panel-2 px-3 py-2 text-[12px] hover:border-border-strong">
                  <div className="flex items-center gap-2"><span className="font-medium text-foreground truncate">{n.title}</span><Badge variant="muted">{n.kind}</Badge><span className="ml-auto text-[10.5px] text-muted">{fmtDateTime(n.occurredAt)}</span></div>
                  <p className="text-muted line-clamp-2 mt-0.5">{n.body.replace(/[#*_>`]/g, "").slice(0, 200)}</p>
                </Link>
              ))}
              {notes.data && notes.data.length === 0 ? <p className="text-[11.5px] text-muted">No notes on this card yet.</p> : null}
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">History</p>
            <div className="space-y-1">
              {(events.data ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-[11.5px] text-muted">
                  <span className="num text-muted-2 w-[100px]">{fmtDateTime(e.createdAt)}</span>
                  <Badge variant="muted">{e.type.replace(/_/g, " ")}</Badge>
                  {e.from || e.to ? <span>{e.from ?? "—"} → {e.to ?? "—"}</span> : null}
                  <span className="ml-auto">{e.actor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}

export function NewIdeaDialog({ open, onOpenChange, personas, onCreated, defaultTicker }: { open: boolean; onOpenChange: (o: boolean) => void; personas: Array<{ slug: string; name: string }>; onCreated: (id: string) => void; defaultTicker?: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({ ticker: defaultTicker ?? "", company_name: "", stage: "sourcing" as IdeaStage, thesis: "", persona_slug: "", tags: "" });
  const create = useMutation({
    mutationFn: () =>
      api<{ idea: { id: string } }>("/api/hermes/ideas", {
        method: "POST",
        json: { ...form, company_name: form.company_name || null, thesis: form.thesis || null, persona_slug: form.persona_slug || null, tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), source: "manual" },
      }),
    onSuccess: (res) => {
      toast.success("Idea created");
      onOpenChange(false);
      setForm({ ticker: "", company_name: "", stage: "sourcing", thesis: "", persona_slug: "", tags: "" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ideas });
      onCreated(res.idea.id);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New idea</DialogTitle>
          <DialogDescription>One active card per ticker. Use the canonical exchange-prefixed ticker when you know it (NAS:MU).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Ticker</Label><Input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} placeholder="NAS:MU" autoFocus /></div>
          <div><Label>Stage</Label><Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as IdeaStage })} className="w-full">{IDEA_STAGES.filter((s) => s !== "archive").map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}</Select></div>
          <div className="col-span-2"><Label>Company</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div><Label>Lens</Label><Select value={form.persona_slug} onChange={(e) => setForm({ ...form, persona_slug: e.target.value })} className="w-full"><option value="">—</option>{personas.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</Select></div>
          <div><Label>Tags</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="ai-bottleneck, screen" /></div>
          <div className="col-span-2"><Label>Thesis (one paragraph)</Label><Textarea value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.ticker || create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

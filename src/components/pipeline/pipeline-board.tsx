"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api, queryKeys } from "@/lib/api";
import { getBrowserClient } from "@/lib/supabase/public";
import { getIdeas, STAGE_META, type Idea } from "@/lib/db/pipeline";
import { IDEA_STAGES, type IdeaStage } from "@/lib/db/types";
import { fmtPct, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { IdeaSheet, NewIdeaDialog } from "@/components/pipeline/idea-sheet";
import { personaLabel } from "@/components/ticker-link";

type Columns = Record<IdeaStage, Idea[]>;

function groupIdeas(ideas: Idea[]): Columns {
  const cols: Columns = { sourcing: [], diligence: [], live: [], monitor: [], archive: [] };
  for (const i of ideas) cols[i.stage].push(i);
  for (const s of IDEA_STAGES) cols[s].sort((a, b) => a.sortOrder - b.sortOrder);
  return cols;
}

export function PipelineBoard({ initial, personas, canWrite, openIdeaId, openNew }: { initial: Idea[]; personas: Array<{ slug: string; name: string }>; canWrite: boolean; openIdeaId?: string; openNew?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.ideas,
    queryFn: async () => {
      const client = getBrowserClient();
      if (!client) return initial;
      return getIdeas(client, { includeArchived: true });
    },
    initialData: initial,
  });
  useRealtime(["hermes_ideas"], [queryKeys.ideas]);

  const [columns, setColumns] = React.useState<Columns>(() => groupIdeas(initial));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const [persona, setPersona] = React.useState("");
  const [showArchive, setShowArchive] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(openIdeaId ?? null);
  const [newOpen, setNewOpen] = React.useState(Boolean(openNew));

  // Derive local board state from the latest server data (unless a drag is in
  // flight) — the "adjust state during render" pattern, no effect needed.
  const [syncedData, setSyncedData] = React.useState(query.data);
  if (query.data !== syncedData && activeId === null) {
    setSyncedData(query.data);
    if (query.data) setColumns(groupIdeas(query.data));
  }
  const [prevOpenIdeaId, setPrevOpenIdeaId] = React.useState(openIdeaId);
  if (openIdeaId !== prevOpenIdeaId) {
    setPrevOpenIdeaId(openIdeaId);
    setSelected(openIdeaId ?? null);
  }

  const reorder = useMutation({
    mutationFn: (moves: Array<{ id: string; stage: IdeaStage; sort_order: number }>) => api("/api/hermes/ideas/reorder", { method: "POST", json: { moves } }),
    onError: (e) => {
      toast.error(`Move failed: ${e.message}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ideas });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.ideas }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function findStage(id: string): IdeaStage | null {
    if (IDEA_STAGES.includes(id as IdeaStage)) return id as IdeaStage;
    for (const s of IDEA_STAGES) if (columns[s].some((i) => i.id === id)) return s;
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findStage(String(active.id));
    const to = findStage(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const item = prev[from].find((i) => i.id === active.id);
      if (!item) return prev;
      const fromList = prev[from].filter((i) => i.id !== active.id);
      const overIndex = prev[to].findIndex((i) => i.id === over.id);
      const toList = [...prev[to]];
      toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, { ...item, stage: to });
      return { ...prev, [from]: fromList, [to]: toList };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const stage = findStage(String(active.id));
    if (!stage) return;
    setColumns((prev) => {
      const list = prev[stage];
      const oldIndex = list.findIndex((i) => i.id === active.id);
      const newIndex = list.findIndex((i) => i.id === over.id);
      const next = oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex ? arrayMove(list, oldIndex, newIndex) : list;
      // Renumber the column so every card carries a clean, monotonic sort_order.
      const moves = next.map((i, idx) => ({ id: i.id, stage, sort_order: (idx + 1) * 1000 }));
      const changed = moves.filter((m) => {
        const orig = initial.find((i) => i.id === m.id) ?? query.data?.find((i) => i.id === m.id);
        return !orig || orig.stage !== m.stage || orig.sortOrder !== m.sort_order;
      });
      if (changed.length && canWrite) reorder.mutate(changed);
      if (changed.length && !canWrite) toast.error("Read-only: set SUPABASE_SERVICE_ROLE_KEY to move cards.");
      return { ...prev, [stage]: next.map((i, idx) => ({ ...i, sortOrder: (idx + 1) * 1000 })) };
    });
  }

  const activeIdea = activeId ? IDEA_STAGES.flatMap((s) => columns[s]).find((i) => i.id === activeId) : null;
  const selectedIdea = selected ? IDEA_STAGES.flatMap((s) => columns[s]).find((i) => i.id === selected) ?? null : null;
  const needle = filter.trim().toLowerCase();
  const visible = (list: Idea[]) => list.filter((i) => (!needle || `${i.ticker} ${i.companyName ?? ""} ${i.tags.join(" ")} ${i.thesis ?? ""}`.toLowerCase().includes(needle)) && (!persona || i.persona === persona));
  const stages = showArchive ? IDEA_STAGES : IDEA_STAGES.filter((s) => s !== "archive");

  function select(id: string | null) {
    setSelected(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("idea", id);
    else params.delete("idea");
    params.delete("new");
    router.replace(`/pipeline${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-3.5 text-muted" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter cards…" className="pl-7 w-56" />
        </div>
        <Select value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">All lenses</option>
          {personas.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-[11.5px] text-muted"><Archive className="size-3.5" /> archive <Switch checked={showArchive} onCheckedChange={setShowArchive} /></label>
        <span className="text-[11.5px] text-muted">{IDEA_STAGES.filter((s) => s !== "archive").reduce((n, s) => n + columns[s].length, 0)} active cards</span>
        <span className="flex-1" />
        <Button size="sm" onClick={() => setNewOpen(true)} disabled={!canWrite}><Plus /> New idea</Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="max-w-full overflow-x-auto pb-3">
          <div className={cn("grid gap-3", showArchive ? "grid-cols-5" : "grid-cols-4")} style={{ minWidth: showArchive ? 1180 : 960 }}>
            {stages.map((stage) => (
              <Column key={stage} stage={stage} ideas={visible(columns[stage])} total={columns[stage].length} onSelect={select} />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
          {activeIdea ? <div className="drag-overlay rounded-md"><IdeaCard idea={activeIdea} overlay /></div> : null}
        </DragOverlay>
      </DndContext>

      <IdeaSheet idea={selectedIdea} personas={personas} canWrite={canWrite} onClose={() => select(null)} />
      <NewIdeaDialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) select(null); }} personas={personas} onCreated={(id) => select(id)} />
    </>
  );
}

function Column({ stage, ideas, total, onSelect }: { stage: IdeaStage; ideas: Idea[]; total: number; onSelect: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];
  const weight = ideas.reduce((n, i) => n + (i.currentWeight ?? 0), 0);
  return (
    <div ref={setNodeRef} className={cn("panel flex flex-col min-h-[520px] transition-colors", isOver && "border-gold/50 bg-gold-soft/30")}>
      <div className="px-3 py-2.5 hairline-b">
        <div className="flex items-center gap-2">
          <Badge variant={toneFor(stage)}>{meta.label}</Badge>
          <span className="num text-[11px] text-muted">{ideas.length}{ideas.length !== total ? `/${total}` : ""}</span>
          {stage === "live" && weight > 0 ? <span className="ml-auto num text-[11px] text-muted sensitive">{fmtPct(weight, 1)} NAV</span> : null}
        </div>
        <p className="mt-1 text-[10.5px] text-muted-2 leading-4">{meta.hint}</p>
      </div>
      <SortableContext items={ideas.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-1.5 p-2 overflow-y-auto max-h-[calc(100dvh-280px)]">
          {ideas.map((idea) => <SortableCard key={idea.id} idea={idea} onSelect={onSelect} />)}
          {ideas.length === 0 ? <p className="px-2 py-6 text-center text-[11px] text-muted-2">Drop here</p> : null}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ idea, onSelect }: { idea: Idea; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idea.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn(isDragging && "opacity-30")} onClick={() => onSelect(idea.id)}>
      <IdeaCard idea={idea} />
    </div>
  );
}

function Dots({ value, max = 5, color }: { value: number | null; max?: number; color: string }) {
  return (
    <span className="inline-flex gap-[2px]" aria-label={`${value ?? 0} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="inline-block size-[6px] rounded-full" style={{ background: value !== null && i < value ? color : "var(--surface-3)" }} />
      ))}
    </span>
  );
}

export function IdeaCard({ idea, overlay }: { idea: Idea; overlay?: boolean }) {
  return (
    <div className={cn("panel-2 px-2.5 py-2 cursor-grab active:cursor-grabbing select-none hover:border-border-strong transition-colors", overlay && "bg-overlay w-[230px]")}>
      <div className="flex items-center gap-1.5">
        <span className="num text-[12.5px] font-semibold text-foreground">{idea.symbol}</span>
        <span className="text-[11px] text-muted truncate flex-1">{idea.companyName}</span>
        {idea.currentWeight ? <span className="num text-[10.5px] text-gold sensitive">{fmtPct(idea.currentWeight, 1)}</span> : null}
      </div>
      {idea.thesis ? <p className="mt-1 text-[11px] text-foreground-secondary line-clamp-2 leading-4">{idea.thesis}</p> : null}
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
        <span title="conviction"><Dots value={idea.conviction} color="var(--gold)" /></span>
        <span title="risk"><Dots value={idea.risk} color="var(--neg)" /></span>
        {idea.persona ? <span className="truncate">{personaLabel(idea.persona)}</span> : null}
        <span className="ml-auto whitespace-nowrap">{fmtRelative(idea.stageChangedAt)}</span>
      </div>
      {idea.nextAction ? <p className="mt-1 text-[10.5px] text-cyan truncate">→ {idea.nextAction}</p> : null}
      {idea.tags.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {idea.tags.slice(0, 3).map((t) => <span key={t} className="rounded-[3px] bg-surface-3 px-1 text-[9.5px] text-muted">{t}</span>)}
        </div>
      ) : null}
    </div>
  );
}

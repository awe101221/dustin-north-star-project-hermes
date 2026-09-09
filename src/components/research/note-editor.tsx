"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Eye, PenLine, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Note } from "@/lib/db/research";
import { NOTE_KINDS } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { Kbd } from "@/components/ui/misc";

const TEMPLATE = `## Thesis

- FACT: …
- INFERENCE: …

## Why this beats QQQ

## What would make me wrong (falsifier)

## Next action
`;

export function NoteEditor({
  note,
  defaults,
  personas,
  canWrite,
}: {
  note?: Note;
  defaults?: Partial<{ ticker: string; kind: string; ideaId: string; memoId: string; title: string }>;
  personas: Array<{ slug: string; name: string }>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(note?.title ?? defaults?.title ?? "");
  const [kind, setKind] = React.useState(note?.kind ?? defaults?.kind ?? "note");
  const [tickers, setTickers] = React.useState((note?.tickers ?? (defaults?.ticker ? [defaults.ticker] : [])).join(", "));
  const [tags, setTags] = React.useState((note?.tags ?? []).join(", "));
  const [persona, setPersona] = React.useState(note?.persona ?? "");
  const [verdict, setVerdict] = React.useState(note?.verdict ?? "");
  const [conviction, setConviction] = React.useState<string>(note?.conviction ? String(note.conviction) : "");
  const [body, setBody] = React.useState(note?.body ?? (defaults?.kind === "journal" ? `## ${new Date().toISOString().slice(0, 10)}\n\n` : TEMPLATE));
  const [view, setView] = React.useState<"split" | "write" | "preview">("split");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const payload = () => ({
    title: title.trim(),
    kind,
    body_md: body,
    tickers: tickers.split(/[,\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean),
    tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    persona_slug: persona || null,
    verdict: verdict || null,
    conviction: conviction ? Number(conviction) : null,
    idea_id: note?.ideaId ?? defaults?.ideaId ?? null,
    linked_memo_id: note?.linkedMemoId ?? defaults?.memoId ?? null,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (note) return api<{ note: { id: string } }>(`/api/hermes/notes/${note.id}`, { method: "PATCH", json: payload() });
      return api<{ note: { id: string } }>("/api/hermes/notes", { method: "POST", json: payload() });
    },
    onSuccess: (res) => {
      toast.success(note ? "Note saved" : "Note created");
      router.push(`/research/${res.note.id}`);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/hermes/notes/${note!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Note deleted");
      router.push("/research");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (title.trim() && canWrite) save.mutate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [title, canWrite, save]);

  function insert(snippet: string) {
    const el = textareaRef.current;
    if (!el) return setBody((b) => b + snippet);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + snippet.length;
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div className="col-span-2 md:col-span-3"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. MU — HBM cycle check after Q4" autoFocus /></div>
        <div><Label>Kind</Label><Select value={kind} onChange={(e) => setKind(e.target.value as Note["kind"])} className="w-full">{NOTE_KINDS.map((k) => <option key={k}>{k}</option>)}</Select></div>
        <div><Label>Persona lens</Label><Select value={persona} onChange={(e) => setPersona(e.target.value)} className="w-full"><option value="">—</option>{personas.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</Select></div>
        <div><Label>Verdict</Label><Select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="w-full"><option value="">—</option>{["BUY", "BUY-MORE", "MAINTAIN", "WATCH", "TRIM", "EXIT", "PASS", "AVOID"].map((v) => <option key={v}>{v}</option>)}</Select></div>
        <div className="col-span-2"><Label>Tickers</Label><Input value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="NAS:MU, TSM" /></div>
        <div className="col-span-2"><Label>Tags</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ai-bottleneck, earnings, thesis-check" /></div>
        <div><Label>Conviction 1–5</Label><Input type="number" min={1} max={5} value={conviction} onChange={(e) => setConviction(e.target.value)} /></div>
        <div className="col-span-2 flex flex-wrap items-end gap-1 md:col-span-1 md:flex-nowrap">
          <Button variant={view === "write" ? "secondary" : "ghost"} size="sm" onClick={() => setView("write")}><PenLine /> Write</Button>
          <Button variant={view === "split" ? "secondary" : "ghost"} size="sm" onClick={() => setView("split")}>Split</Button>
          <Button variant={view === "preview" ? "secondary" : "ghost"} size="sm" onClick={() => setView("preview")}><Eye /> Preview</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        <span className="eyebrow mr-1">Insert</span>
        {[
          ["## Thesis\n", "H2"],
          ["- FACT: ", "Fact"],
          ["- INFERENCE: ", "Inference"],
          ["- JUDGMENT: ", "Judgment"],
          ["| Metric | Value | Source |\n|---|---|---|\n| | | |\n", "Table"],
          ["> ", "Quote"],
          ["- [ ] ", "Task"],
        ].map(([snippet, label]) => (
          <button key={label} type="button" onClick={() => insert(snippet!)} className="rounded-[4px] border border-border bg-surface-2 px-1.5 py-[2px] hover:text-foreground">
            {label}
          </button>
        ))}
        <span className="ml-auto">Save <Kbd>⌘S</Kbd></span>
      </div>

      <div className={cn("grid gap-3", view === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
        {view !== "preview" ? (
          <Textarea ref={textareaRef} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[520px] num text-[12.5px] leading-6" spellCheck />
        ) : null}
        {view !== "write" ? (
          <div className="panel p-5 min-h-[520px] overflow-auto">
            <Markdown>{body || "*Nothing yet.*"}</Markdown>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending || !canWrite} title={!canWrite ? "Writes need SUPABASE_SERVICE_ROLE_KEY" : undefined}>
          <Save /> {save.isPending ? "Saving…" : note ? "Save changes" : "Create note"}
        </Button>
        {note && canWrite ? (
          <Button variant="destructive" onClick={() => { if (confirm("Delete this note?")) remove.mutate(); }}><Trash2 /> Delete</Button>
        ) : null}
        <span className="text-[11px] text-muted num">{body.length.toLocaleString()} chars</span>
      </div>
    </div>
  );
}

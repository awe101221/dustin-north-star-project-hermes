"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Persona } from "@/lib/db/personas";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";

export function PersonaEditor({ persona, canWrite }: { persona: Persona; canWrite: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    display_name: persona.name,
    headline: persona.headline ?? "",
    framework_name: persona.frameworkName,
    framework_version: persona.frameworkVersion,
    description: persona.description,
    persona_prompt: persona.personaPrompt ?? "",
    is_active: persona.isActive,
  });
  const dirty = JSON.stringify(form) !== JSON.stringify({
    display_name: persona.name,
    headline: persona.headline ?? "",
    framework_name: persona.frameworkName,
    framework_version: persona.frameworkVersion,
    description: persona.description,
    persona_prompt: persona.personaPrompt ?? "",
    is_active: persona.isActive,
  });

  const save = useMutation({
    mutationFn: () => api(`/api/hermes/personas/${persona.slug}`, { method: "PATCH", json: { ...form, headline: form.headline || null, persona_prompt: form.persona_prompt || null } }),
    onSuccess: () => {
      toast.success("Persona saved");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Framework & prompt</CardTitle>
          <CardDescription>Edits write to analyst_personas. Bumping the framework version appends to the version history.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[11.5px] text-muted">
            active <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} disabled={!canWrite} />
          </label>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || !canWrite || save.isPending}><Save /> {save.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} disabled={!canWrite} /></div>
          <div><Label>Headline</Label><Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} disabled={!canWrite} /></div>
          <div><Label>Framework name</Label><Input value={form.framework_name} onChange={(e) => setForm({ ...form, framework_name: e.target.value })} disabled={!canWrite} /></div>
          <div><Label>Framework version</Label><Input value={form.framework_version} onChange={(e) => setForm({ ...form, framework_version: e.target.value })} disabled={!canWrite} className="num" /></div>
        </div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canWrite} className="min-h-[70px]" /></div>
        <div>
          <Label>Persona prompt (the lens every memo reasons through)</Label>
          <Textarea value={form.persona_prompt} onChange={(e) => setForm({ ...form, persona_prompt: e.target.value })} disabled={!canWrite} className="min-h-[420px] num text-[12px] leading-5" />
        </div>
        {!canWrite ? <p className="text-[11px] text-warn">Read-only: set SUPABASE_SERVICE_ROLE_KEY to edit personas.</p> : null}
      </CardContent>
    </Card>
  );
}

export function NewPersonaDialog({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ display_name: "", slug: "", headline: "", framework_name: "", framework_version: "hermes-v1", description: "", persona_prompt: "" });
  const create = useMutation({
    mutationFn: () => api<{ persona: { slug: string } }>("/api/hermes/personas", { method: "POST", json: { ...form, headline: form.headline || null, persona_prompt: form.persona_prompt || null } }),
    onSuccess: (res) => {
      toast.success("Persona created");
      setOpen(false);
      router.push(`/personas/${res.persona.slug}`);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!canWrite} title={!canWrite ? "Writes need SUPABASE_SERVICE_ROLE_KEY" : undefined}><Plus /> New persona</Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New analyst persona</DialogTitle>
          <DialogDescription>A new lens for underwriting. Workers pick it up by slug; give it a crisp philosophy and gates.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value, slug: form.slug || slugify(e.target.value) })} placeholder="e.g. Nick Sleep" /></div>
          <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className="num" placeholder="nick-sleep" /></div>
          <div><Label>Framework name</Label><Input value={form.framework_name} onChange={(e) => setForm({ ...form, framework_name: e.target.value })} placeholder="Scale economies shared" /></div>
          <div><Label>Framework version</Label><Input value={form.framework_version} onChange={(e) => setForm({ ...form, framework_version: e.target.value })} className="num" /></div>
          <div className="col-span-2"><Label>Headline</Label><Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="one line on what this lens rewards" /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-span-2"><Label>Persona prompt</Label><Textarea value={form.persona_prompt} onChange={(e) => setForm({ ...form, persona_prompt: e.target.value })} className="min-h-[200px] num text-[12px]" placeholder="You are reasoning as … CORE PHILOSOPHY: … WHAT TO LOOK FOR: … WHAT TO PENALIZE: … POSITION SIZING: … OUTPUT POSTURE: …" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.display_name || !form.slug || create.isPending}>{create.isPending ? "Creating…" : "Create persona"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

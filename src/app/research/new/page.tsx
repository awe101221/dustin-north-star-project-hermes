import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NoteEditor } from "@/components/research/note-editor";
import { serverReadClient } from "@/lib/supabase/server";
import { getPersonas } from "@/lib/db/personas";
import { isWriteConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "New note" };
export const dynamic = "force-dynamic";

export default async function NewNotePage({ searchParams }: { searchParams: Promise<{ ticker?: string; kind?: string; idea?: string; memo?: string; title?: string }> }) {
  const sp = await searchParams;
  const db = serverReadClient();
  const personas = db ? await getPersonas(db, false).catch(() => []) : [];
  return (
    <>
      <PageHeader eyebrow="Research" title="New note" description="Markdown-first. Separate facts, inferences and judgments; name the falsifier. Notes are searchable, taggable and linkable to tickers, ideas and memos." />
      <NoteEditor
        defaults={{ ticker: sp.ticker?.toUpperCase(), kind: sp.kind, ideaId: sp.idea, memoId: sp.memo, title: sp.title }}
        personas={personas.map((p) => ({ slug: p.slug, name: p.name }))}
        canWrite={isWriteConfigured()}
      />
    </>
  );
}

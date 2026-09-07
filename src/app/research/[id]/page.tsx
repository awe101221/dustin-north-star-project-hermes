import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { safeLoad } from "@/lib/server/safe";
import { getMemo, getMemoHistory, getNote } from "@/lib/db/research";
import { getPersonas } from "@/lib/db/personas";
import { getIdeaForTicker } from "@/lib/db/pipeline";
import { isWriteConfigured } from "@/lib/env";
import { MemoView } from "@/components/research/memo-view";
import { NoteEditor } from "@/components/research/note-editor";
import { Markdown } from "@/components/markdown";
import { Badge, toneFor } from "@/components/ui/badge";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { TickerLink, PersonaChip } from "@/components/ticker-link";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Research ${id.slice(0, 8)}` };
}

export default async function ResearchDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const db = serverReadClient();
  if (!db) return <NotConfigured />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const memoLoad = await safeLoad(async () => {
    const memo = await getMemo(db, id);
    if (!memo) return null;
    const [history, idea] = await Promise.all([getMemoHistory(db, memo.persona, memo.ticker), getIdeaForTicker(db, memo.ticker).catch(() => null)]);
    return { memo, history, idea };
  });
  if (!memoLoad.ok) {
    return (
      <>
        <PageHeader eyebrow="Research" title="Memo" />
        <ErrorPanel title="Memo failed to load" detail={memoLoad.error} />
      </>
    );
  }
  if (memoLoad.data) {
    const { memo, history, idea } = memoLoad.data;
    return <MemoView memo={memo} history={history} idea={idea ? { id: idea.id, stage: idea.stage } : null} canWrite={isWriteConfigured()} />;
  }

  const noteLoad = await safeLoad(() => getNote(db, id));
  if (!noteLoad.ok) {
    return (
      <>
        <PageHeader eyebrow="Research" title="Note" />
        <ErrorPanel title="Note failed to load" detail={noteLoad.error} />
      </>
    );
  }
  const note = noteLoad.data;
  if (!note) notFound();
  const personas = await getPersonas(db, false).catch(() => []);

  if (edit === "1") {
    return (
      <>
        <PageHeader eyebrow="Research · note" title={`Edit: ${note.title}`} />
        <NoteEditor note={note} personas={personas.map((p) => ({ slug: p.slug, name: p.name }))} canWrite={isWriteConfigured()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Research · ${note.kind}`}
        title={note.title}
        meta={
          <>
            <span>{fmtDateTime(note.occurredAt)}</span>
            <span>·</span>
            <span>by {note.author} via {note.sourceSystem}</span>
            {note.updatedAt !== note.createdAt ? <span>· edited {fmtDate(note.updatedAt)}</span> : null}
          </>
        }
        actions={
          <>
            <Link href={`/research/${note.id}?edit=1`} className="text-[12px] text-cyan hover:underline">Edit</Link>
            <Link href={`/research/new?kind=${note.kind}${note.tickers[0] ? `&ticker=${note.tickers[0]}` : ""}`} className="text-[12px] text-cyan hover:underline">New like this</Link>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {note.tickers.map((t) => <TickerLink key={t} ticker={t} showExchange />)}
        <PersonaChip slug={note.persona} />
        {note.verdict ? <Badge variant={toneFor(note.verdict)}>{note.verdict}</Badge> : null}
        {note.conviction ? <Badge variant="gold">conviction {note.conviction}/5</Badge> : null}
        {note.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
        {note.linkedMemoId ? <Link href={`/research/${note.linkedMemoId}`} className="text-[11px] text-cyan hover:underline">linked memo →</Link> : null}
        {note.ideaId ? <Link href={`/pipeline?idea=${note.ideaId}`} className="text-[11px] text-cyan hover:underline">pipeline card →</Link> : null}
      </div>
      <div className="panel p-6">
        <Markdown>{note.body}</Markdown>
      </div>
    </>
  );
}

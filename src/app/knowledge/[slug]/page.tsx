import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { safeLoad } from "@/lib/server/safe";
import { getKnowledgeDoc } from "@/lib/db/knowledge";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { personaLabel } from "@/components/ticker-link";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Knowledge · ${slug}` };
}

export default async function KnowledgeDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = serverReadClient();
  if (!db) return <NotConfigured />;
  const loaded = await safeLoad(() => getKnowledgeDoc(db, slug));
  if (!loaded.ok) {
    return (
      <>
        <PageHeader eyebrow="Knowledge" title={slug} />
        <ErrorPanel title="Knowledge doc failed to load" detail={loaded.error} />
      </>
    );
  }
  const doc = loaded.data;
  if (!doc) notFound();
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/knowledge?category=${doc.category}`} className="hover:text-foreground">← knowledge · {doc.category}</Link>}
        title={doc.title}
        description={doc.summary}
        meta={
          <>
            {doc.persona_slug ? <Link href={`/personas/${doc.persona_slug}`}><Badge variant="gold">{personaLabel(doc.persona_slug)}</Badge></Link> : null}
            {doc.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
            <span className="num min-w-0 max-w-full break-all">{doc.source_repo}{doc.source_path ? ` · ${doc.source_path}` : ""}</span>
            <span>· updated {fmtDate(doc.updated_at, "long")}</span>
            <span className="num">· sha {doc.content_sha256?.slice(0, 10)}</span>
          </>
        }
      />
      <div className="panel p-6">
        <Markdown>{doc.body_md}</Markdown>
      </div>
    </>
  );
}

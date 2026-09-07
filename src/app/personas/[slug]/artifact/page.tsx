import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { safeLoad } from "@/lib/server/safe";
import { getArtifact } from "@/lib/db/personas";
import { Markdown } from "@/components/markdown";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Artifact" };
export const dynamic = "force-dynamic";

export default async function ArtifactPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string }> }) {
  const { slug } = await params;
  const { key } = await searchParams;
  const db = serverReadClient();
  if (!db) return <NotConfigured />;
  if (!key) notFound();
  const loaded = await safeLoad(() => getArtifact(db, key));
  if (!loaded.ok) {
    return (
      <>
        <PageHeader eyebrow="Personas" title={slug} />
        <ErrorPanel title="Artifact failed to load" detail={loaded.error} />
      </>
    );
  }
  const artifact = loaded.data;
  if (!artifact || artifact.persona !== slug) notFound();
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/personas/${slug}`} className="hover:text-foreground">← {slug}</Link>}
        title={artifact.title}
        meta={
          <>
            <Badge variant="muted">{artifact.type.replace(/_/g, " ")}</Badge>
            <span>{artifact.format}</span>
            <span>· updated {fmtDate(artifact.updatedAt, "long")}</span>
            {artifact.sourcePath ? <span className="num">· {artifact.sourcePath}</span> : null}
            <span className="num">· {artifact.content.length.toLocaleString()} chars</span>
          </>
        }
      />
      <div className="panel p-6">
        {artifact.format === "markdown" ? <Markdown>{artifact.content}</Markdown> : <pre className="whitespace-pre-wrap text-[12px] num text-foreground-secondary">{artifact.content}</pre>}
      </div>
    </>
  );
}

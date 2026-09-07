import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { getPersonas, getPromptTemplates } from "@/lib/db/personas";
import { safeLoad } from "@/lib/server/safe";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { NewPersonaDialog } from "@/components/personas/persona-editor";
import { isWriteConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Analyst personas" };
export const dynamic = "force-dynamic";

export default async function PersonasPage() {
  const db = serverReadClient();
  const header = (
    <PageHeader
      eyebrow="Analyst Engine"
      title="Persona architecture"
      description="Each persona is a reasoning lens with its own framework version, gates and prompt. Memos, rankings and the master conviction blend all key off analyst_personas, so a new persona here is immediately usable by every worker."
      actions={<NewPersonaDialog canWrite={isWriteConfigured()} />}
    />
  );
  if (!db) return <>{header}<NotConfigured /></>;
  const result = await safeLoad(async () => {
    const [personas, templates] = await Promise.all([getPersonas(db, true), getPromptTemplates(db).catch(() => [])]);
    return { personas, templates };
  });
  if (!result.ok) return <>{header}<ErrorPanel detail={result.error} /></>;
  const { personas, templates } = result.data;
  return (
    <>
      {header}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {personas.map((p) => (
          <Link key={p.slug} href={`/personas/${p.slug}`} className="panel p-4 hover:border-border-strong transition-colors block">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-foreground">{p.name}</p>
                <p className="text-[11.5px] text-gold mt-0.5">{p.headline ?? p.frameworkName}</p>
              </div>
              <Badge variant={p.isActive ? "pos" : "muted"}>{p.isActive ? "active" : "inactive"}</Badge>
            </div>
            <p className="mt-2 text-[12px] text-foreground-secondary line-clamp-3">{p.description}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div><p className="eyebrow">Memos</p><p className="num text-foreground mt-0.5">{fmtNum(p.memoCount)}</p></div>
              <div><p className="eyebrow">Tickers</p><p className="num text-foreground mt-0.5">{fmtNum(p.tickerCount)}</p></div>
              <div><p className="eyebrow">Blend</p><p className="num text-foreground mt-0.5">{p.blendWeight !== null ? fmtPct(p.blendWeight, 0) : "—"}</p></div>
            </div>
            <p className="mt-3 text-[10.5px] text-muted num truncate">{p.frameworkVersion} · last memo {fmtDate(p.lastMemoAt)} · {p.artifactCount} artifacts</p>
          </Link>
        ))}
      </div>
      {templates.length ? (
        <div className="mt-6">
          <p className="eyebrow mb-2">Shared prompt templates ({templates.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {templates.map((t) => (
              <details key={t.id} className="panel-2 px-3 py-2">
                <summary className="cursor-pointer text-[12px] text-foreground flex items-center gap-2">
                  <span className="font-medium">{t.kind.replace(/_/g, " ")}</span>
                  <Badge variant="muted">{t.channel}</Badge>
                  <span className="ml-auto num text-[10.5px] text-muted">v{t.version}</span>
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-foreground-secondary num">{t.prompt}</pre>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

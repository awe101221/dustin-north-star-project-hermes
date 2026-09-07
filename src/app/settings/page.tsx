import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/db/query";
import { HERMES_PROJECT_REF, accessPassword, agentToken, guruFocusApiKey, isReadConfigured, isWriteConfigured, priceProvider, publicSupabaseUrl } from "@/lib/env";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KV } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { SettingsActions } from "@/components/settings/settings-actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const FRESHNESS: Array<{ label: string; table: string; column: string; count?: boolean }> = [
  { label: "IBKR positions", table: "ibkr_positions", column: "report_date" },
  { label: "IBKR NAV history", table: "ibkr_nav_history", column: "snapshot_date" },
  { label: "Mission benchmark", table: "mission_benchmark", column: "as_of" },
  { label: "Analyst memos", table: "analyst_memos", column: "analyzed_at", count: true },
  { label: "Memo refreshes", table: "analyst_memo_refreshes", column: "refreshed_at" },
  { label: "Top rankings", table: "analyst_top_rankings", column: "as_of" },
  { label: "Master scores", table: "master_scores", column: "as_of" },
  { label: "Company filings", table: "company_filings", column: "filing_date", count: true },
  { label: "13F activity", table: "tracked_13f_activity", column: "report_date", count: true },
  { label: "Hermes ideas", table: "hermes_ideas", column: "updated_at", count: true },
  { label: "Hermes notes", table: "hermes_notes", column: "updated_at", count: true },
  { label: "Hermes knowledge", table: "hermes_knowledge", column: "updated_at", count: true },
  { label: "Hermes performance points", table: "hermes_performance_points", column: "observation_date", count: true },
  { label: "Hermes trades", table: "hermes_trades", column: "trade_time", count: true },
];

export default async function SettingsPage() {
  const db = serverReadClient();
  const freshness = db
    ? await Promise.all(
        FRESHNESS.map(async (f) => {
          try {
            const latest = unwrap(await db.from(f.table).select(f.column).order(f.column, { ascending: false }).limit(1), f.table) as unknown as Array<Record<string, string>>;
            let count: number | null = null;
            if (f.count) {
              const { count: c } = await db.from(f.table).select("*", { count: "exact", head: true });
              count = c ?? null;
            }
            return { ...f, latest: latest[0]?.[f.column] ?? null, count, error: null as string | null };
          } catch (e) {
            return { ...f, latest: null, count: null, error: e instanceof Error ? e.message : String(e) };
          }
        }),
      )
    : [];

  return (
    <>
      <PageHeader eyebrow="System" title="Settings & diagnostics" description="Connection status, environment, data freshness. Secrets are never displayed; only whether they are set." />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><div><CardTitle>Connections</CardTitle><CardDescription>Live database: Awe Capital INVESTING-BRAIN-AG. The reference DB is only ever touched by one-time import scripts.</CardDescription></div></CardHeader>
          <CardContent>
            <KV k="Supabase project" v={<span className="num">{HERMES_PROJECT_REF}</span>} />
            <KV k="URL" v={<span className="num">{publicSupabaseUrl()}</span>} />
            <KV k="Read (publishable key)" v={<Badge variant={isReadConfigured() ? "pos" : "neg"}>{isReadConfigured() ? "configured" : "missing"}</Badge>} />
            <KV k="Write (service role, server only)" v={<Badge variant={isWriteConfigured() ? "pos" : "warn"}>{isWriteConfigured() ? "configured" : "read-only"}</Badge>} />
            <KV k="Password gate" v={<Badge variant={accessPassword() ? "pos" : "warn"}>{accessPassword() ? "on" : "off (open)"}</Badge>} />
            <KV k="Agent API token" v={<Badge variant={agentToken() ? "pos" : "muted"}>{agentToken() ? "set" : "disabled"}</Badge>} />
            <KV k="GuruFocus key" v={<Badge variant={guruFocusApiKey() ? "pos" : "muted"}>{guruFocusApiKey() ? "set" : "not set"}</Badge>} />
            <KV k="Price provider" v={priceProvider()} />
            <div className="mt-4"><SettingsActions gate={Boolean(accessPassword())} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Data freshness</CardTitle><CardDescription>Latest observation per source table.</CardDescription></div></CardHeader>
          <CardContent>
            {freshness.length === 0 ? <p className="text-[12px] text-muted">Not connected.</p> : null}
            {freshness.map((f) => (
              <KV key={f.table} k={<span>{f.label} <span className="num text-muted-2">{f.table}</span></span>} v={f.error ? <span className="text-neg">{f.error.slice(0, 60)}</span> : <span>{f.latest ? fmtDateTime(f.latest) : "—"}{f.count !== null ? <span className="text-muted"> · {fmtNum(f.count)} rows</span> : null}</span>} />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

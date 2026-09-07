import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, NotConfigured, ErrorPanel } from "@/components/page-header";
import { serverReadClient } from "@/lib/supabase/server";
import { safeLoad } from "@/lib/server/safe";
import { getCompany, getFilings, getThemesForTicker } from "@/lib/db/company";
import { getMemoSummariesForTicker, getNotes } from "@/lib/db/research";
import { getUniverseForTicker, getGuruSignalForSymbol, getHoldersForSymbol } from "@/lib/db/quant";
import { getLatestPositions, positionForTicker, getTrades } from "@/lib/db/portfolio";
import { getIdeaForTicker } from "@/lib/db/pipeline";
import { bareSymbol } from "@/lib/utils";
import { fmtCompactMoney, fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KV, Stat } from "@/components/ui/stat";
import { PersonaChip, personaLabel } from "@/components/ticker-link";
import { TradeLog } from "@/components/portfolio/trade-log";
import { CompanyActions } from "@/components/companies/company-actions";
import { isWriteConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker) };
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const raw = decodeURIComponent((await params).ticker).toUpperCase();
  const db = serverReadClient();
  if (!db) return <NotConfigured />;
  const symbol = bareSymbol(raw);
  const loaded = await safeLoad(() =>
    Promise.all([
      getCompany(db, raw),
      getUniverseForTicker(db, raw).catch(() => []),
      getMemoSummariesForTicker(db, raw).catch(() => []),
      getNotes(db, { ticker: raw, limit: 20 }).catch(() => []),
      getLatestPositions(db),
      getIdeaForTicker(db, raw).catch(() => null),
      getFilings(db, raw).catch(() => []),
      getGuruSignalForSymbol(db, symbol).catch(() => []),
      getHoldersForSymbol(db, symbol, 25).catch(() => []),
      getThemesForTicker(db, raw).catch(() => []),
      getTrades(db, { symbol, limit: 40 }).catch(() => []),
    ]),
  );
  if (!loaded.ok) {
    return (
      <>
        <PageHeader eyebrow="Companies" title={<span className="num">{symbol}</span>} />
        <ErrorPanel title="Company dossier failed to load" detail={loaded.error} />
      </>
    );
  }
  const [company, universe, memos, notes, positions, idea, filings, guru, holders, themes, trades] = loaded.data;
  const canonical = company?.ticker ?? universe[0]?.ticker ?? raw;
  const position = positionForTicker(positions, canonical) ?? positionForTicker(positions, symbol);
  const name = company?.name ?? universe[0]?.companyName ?? position?.companyName ?? symbol;
  const latestGuru = guru[0];

  return (
    <>
      <PageHeader
        eyebrow={`${canonical} · ${company?.sector ?? "—"} · ${company?.industry ?? "—"} · ${company?.country ?? "—"}`}
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <span className="num">{symbol}</span>
            <span className="text-foreground-secondary font-normal">{name}</span>
            {position ? <Badge variant="gold">held {fmtPct(position.weight, 2)}</Badge> : null}
            {idea ? <Link href={`/pipeline?idea=${idea.id}`}><Badge variant={toneFor(idea.stage)}>pipeline · {idea.stage}</Badge></Link> : null}
          </span>
        }
        actions={<CompanyActions ticker={canonical} companyName={name} ideaId={idea?.id ?? null} canWrite={isWriteConfigured()} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
        <Stat label="Market value" value={fmtMoney(position?.marketValue)} caption={position ? `${fmtNum(position.quantity, 0)} sh @ ${fmtPrice(position.closePrice, position.currency)}` : "not held"} sensitive />
        <Stat label="Unrealized" value={fmtMoney(position?.unrealizedPnl)} tone={position ? (position.unrealizedPnl >= 0 ? "pos" : "neg") : "flat"} sensitive caption={position ? `cost ${fmtPrice(position.costPrice, position.currency)}` : undefined} />
        <Stat label="YTD ROI" value={fmtPct(position?.ytdRoi)} tone={position ? ((position.ytdRoi ?? 0) >= 0 ? "pos" : "neg") : "flat"} />
        <Stat label="Lenses covering" value={universe.length} caption={universe.map((u) => personaLabel(u.persona)).join(" · ") || "no memo yet"} />
        <Stat label="Best expected IRR" value={fmtPct(universe.reduce<number | null>((m, u) => (u.expectedIrr !== null && (m === null || u.expectedIrr > m) ? u.expectedIrr : m), null))} tone="gold" />
        <Stat label="13F buyers / sellers" value={latestGuru ? `${latestGuru.buyers} / ${latestGuru.sellers}` : "—"} caption={latestGuru ? `quarter ${fmtDate(latestGuru.reportDate)}` : "not in tracked 13F flow"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader><div><CardTitle>Latest view per lens</CardTitle><CardDescription>Live refresh vs memo assumptions. Click a lens for the full memo.</CardDescription></div></CardHeader>
            <CardContent className="space-y-2">
              {universe.length === 0 ? <p className="text-[12px] text-muted">No memo yet. Queue an underwrite from the agent console or write a note.</p> : null}
              {universe.map((u) => (
                <Link key={u.memoId} href={`/research/${u.memoId}`} className="block panel-2 px-3 py-2.5 hover:border-border-strong transition-colors">
                  <div className="flex items-center gap-2 flex-wrap text-[12px]">
                    <PersonaChip slug={u.persona} />
                    <Badge variant={toneFor(u.verdict)}>{u.verdict}</Badge>
                    <span className="text-muted">{fmtDate(u.analyzedAt)} · {u.ageDays}d · {u.sourceSystem}</span>
                    {u.buyPierced ? <Badge variant="pos">buy zone</Badge> : null}
                    {u.triggerPierced ? <Badge variant="neg">trigger pierced</Badge> : null}
                    {u.respawn ? <Badge variant="warn">re-underwrite</Badge> : null}
                    <span className="ml-auto flex gap-3 num">
                      <span>IRR <b className={(u.expectedIrr ?? 0) >= 0.15 ? "text-pos" : ""}>{fmtPct(u.expectedIrr)}</b></span>
                      <span>@quote <b>{fmtPct(u.irrAtQuote)}</b></span>
                      <span>MoS <b>{u.mos !== null ? `${u.mos.toFixed(2)}x` : "—"}</b></span>
                      <span>down <b className="text-neg">{fmtPct(u.downside, 0)}</b></span>
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted num">memo {fmtPrice(u.memoPrice)} · quote {fmtPrice(u.quotePrice)} ({fmtPct(u.drift, 1, { sign: true })}) · buy ≤ {fmtPrice(u.buyPrice)} · trigger {fmtPrice(u.triggerPrice)} · PWV {fmtPrice(u.pwvPv ?? u.pwv)} · health {u.health ?? "—"}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Memo history · {memos.length}</CardTitle><CardDescription>Every complete memo across lenses, newest first.</CardDescription></div></CardHeader>
            <CardContent>
              {memos.map((m) => (
                <Link key={m.id} href={`/research/${m.id}`} className="flex items-center gap-2 py-1.5 hairline-b last:border-b-0 text-[12px] hover:text-foreground">
                  <span className="num text-muted w-[62px]">{fmtDate(m.analyzedAt)}</span>
                  <PersonaChip slug={m.persona} />
                  <Badge variant={toneFor(m.verdict)}>{m.verdict}</Badge>
                  <span className="text-muted">{m.sourceSystem}</span>
                  <span className="ml-auto num text-muted">{fmtPrice(m.price)} · IRR {fmtPct(m.expectedIrr)} · PWV {fmtPrice(m.pwv)}</span>
                </Link>
              ))}
              {memos.length === 0 ? <p className="text-[12px] text-muted">No memos.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Notes · {notes.length}</CardTitle></div><Button asChild size="sm" variant="secondary"><Link href={`/research/new?ticker=${encodeURIComponent(canonical)}`}>New note</Link></Button></CardHeader>
            <CardContent>
              {notes.map((n) => (
                <Link key={n.id} href={`/research/${n.id}`} className="block py-1.5 hairline-b last:border-b-0 text-[12px] hover:text-foreground">
                  <div className="flex items-center gap-2"><span className="font-medium text-foreground">{n.title}</span><Badge variant="muted">{n.kind}</Badge><span className="ml-auto text-muted">{fmtDate(n.occurredAt)}</span></div>
                  <p className="text-muted line-clamp-1">{n.body.replace(/[#*_>`]/g, "").slice(0, 160)}</p>
                </Link>
              ))}
              {notes.length === 0 ? <p className="text-[12px] text-muted">No notes yet.</p> : null}
            </CardContent>
          </Card>

          <TradeLog initial={trades} symbol={symbol} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Company</CardTitle></CardHeader>
            <CardContent>
              <KV k="Canonical ticker" v={canonical} />
              <KV k="Exchange" v={company?.exchange ?? "—"} />
              <KV k="Sector" v={company?.sector ?? "—"} />
              <KV k="Industry" v={company?.industry ?? "—"} />
              <KV k="Sub-industry" v={company?.subindustry ?? "—"} />
              <KV k="Country" v={company?.country ?? "—"} />
              <KV k="Currency" v={company?.currency ?? position?.currency ?? "—"} />
              <KV k="Record provenance" v={company?.provenance ?? "—"} />
              {themes.length ? <KV k="Themes" v={<span className="flex flex-wrap gap-1 justify-end">{themes.map((t) => <Badge key={t.slug} variant="cyan">{t.name}</Badge>)}</span>} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>13F holders</CardTitle><CardDescription>Tracked filers, latest quarter.</CardDescription></div></CardHeader>
            <CardContent>
              {latestGuru ? (
                <p className="text-[11.5px] text-muted mb-2">Buyers: <span className="text-foreground-secondary">{latestGuru.buyerNames.slice(0, 8).join(", ")}{latestGuru.buyerNames.length > 8 ? "…" : ""}</span>{latestGuru.sellerNames.length ? <> · Sellers: <span className="text-foreground-secondary">{latestGuru.sellerNames.slice(0, 6).join(", ")}{latestGuru.sellerNames.length > 6 ? "…" : ""}</span></> : null}</p>
              ) : null}
              {holders.slice(0, 15).map((h) => (
                <div key={h.investor} className="flex items-center justify-between gap-2 py-1 hairline-b last:border-b-0 text-[12px]"><span className="text-foreground-secondary truncate">{h.investor}</span><span className="num text-muted">{fmtCompactMoney(h.value ? h.value * 1000 : null)}</span></div>
              ))}
              {holders.length === 0 ? <p className="text-[12px] text-muted">No tracked holder positions.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Filings · {filings.length}</CardTitle><CardDescription>company_filings/{canonical}/archive</CardDescription></div></CardHeader>
            <CardContent>
              {filings.map((f) => (
                <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[12px] hover:text-foreground">
                  <Badge variant="muted">{f.form ?? "?"}</Badge>
                  <span className="num text-muted">{fmtDate(f.date)}</span>
                  <span className="num text-muted-2 truncate">{f.accession}</span>
                </a>
              ))}
              {filings.length === 0 ? <p className="text-[12px] text-muted">No stored filing archive for this ticker.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

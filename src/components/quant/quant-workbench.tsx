"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play, Save, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { api, queryKeys } from "@/lib/api";
import type { GuruSignal, MasterScore, UniverseRow } from "@/lib/db/quant";
import type { QuantJobRow } from "@/lib/db/types";
import { fmtCompactMoney, fmtDate, fmtDateTime, fmtMultiple, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { DEFAULT_SCREEN, SCREEN_PRESETS, runScreen, type ScreenSpec } from "@/lib/quant/screener";
import type { BacktestResult } from "@/lib/quant/backtest";
import { cn, uniq } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input, Label, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HermesLineChart } from "@/components/charts/line-chart";
import { TickerLink, PersonaChip } from "@/components/ticker-link";
import { Stat } from "@/components/ui/stat";

type Config = { write: boolean; gurufocus: boolean; priceProvider: string; dailyPoints: number };

export function QuantWorkbench({ universe, guru, scores, jobs, config, initialTab, initialPreset }: { universe: UniverseRow[]; guru: GuruSignal[]; scores: MasterScore[]; jobs: QuantJobRow[]; config: Config; initialTab?: string; initialPreset?: string }) {
  return (
    <Tabs defaultValue={initialTab && ["screener", "backtest", "guru", "altdata", "jobs"].includes(initialTab) ? initialTab : "screener"}>
      <TabsList>
        <TabsTrigger value="screener">Screener · {universe.length}</TabsTrigger>
        <TabsTrigger value="backtest">Backtest lab</TabsTrigger>
        <TabsTrigger value="guru">Guru & insider flow</TabsTrigger>
        <TabsTrigger value="altdata">Alt-data & news</TabsTrigger>
        <TabsTrigger value="jobs">Jobs · {jobs.length}</TabsTrigger>
      </TabsList>
      <TabsContent value="screener"><Screener universe={universe} scores={scores} canWrite={config.write} initialPreset={initialPreset} /></TabsContent>
      <TabsContent value="backtest"><BacktestLab config={config} universe={universe} /></TabsContent>
      <TabsContent value="guru"><GuruFlow guru={guru} universe={universe} /></TabsContent>
      <TabsContent value="altdata"><AltData config={config} /></TabsContent>
      <TabsContent value="jobs"><JobsPanel initial={jobs} canWrite={config.write} /></TabsContent>
    </Tabs>
  );
}

// ── Screener ────────────────────────────────────────────────────────────────

function NumField({ label, k, step, pct, spec, setSpec }: { label: string; k: keyof ScreenSpec; step: number; pct: boolean; spec: ScreenSpec; setSpec: (s: ScreenSpec) => void }) {
  const v = spec[k] as number | null | undefined;
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={v === null || v === undefined ? "" : pct ? Math.round(v * 1000) / 10 : v} onChange={(e) => setSpec({ ...spec, [k]: e.target.value === "" ? null : pct ? Number(e.target.value) / 100 : Number(e.target.value) })} className="w-24" />
    </div>
  );
}

function Screener({ universe, scores, canWrite, initialPreset }: { universe: UniverseRow[]; scores: MasterScore[]; canWrite: boolean; initialPreset?: string }) {
  const preset = SCREEN_PRESETS.find((p) => p.id === initialPreset);
  const [spec, setSpec] = React.useState<ScreenSpec>(preset?.spec ?? DEFAULT_SCREEN);
  const [name, setName] = React.useState(preset?.name ?? "");
  const rows = React.useMemo(() => runScreen(universe, spec), [universe, spec]);
  const sectors = React.useMemo(() => uniq(universe.map((r) => r.sector).filter((s): s is string => Boolean(s))).sort(), [universe]);
  const personas = React.useMemo(() => uniq(universe.map((r) => r.persona)).sort(), [universe]);
  const mcsByTicker = React.useMemo(() => new Map(scores.map((s) => [s.ticker.toUpperCase(), s])), [scores]);

  const save = useMutation({
    mutationFn: () => api("/api/hermes/quant-jobs", { method: "POST", json: { kind: "screen", name: name || "Untitled screen", spec, run: true } }),
    onSuccess: () => toast.success("Screen saved & run — see Jobs"),
    onError: (e) => toast.error(e.message),
  });

  const columns: Column<UniverseRow>[] = [
    { key: "ticker", header: "Ticker", cell: (r) => <TickerLink ticker={r.ticker} />, sortValue: (r) => r.symbol, width: "80px" },
    { key: "name", header: "Company", cell: (r) => <Link href={`/research/${r.memoId}`} className="text-foreground-secondary hover:text-foreground truncate block max-w-[200px]">{r.companyName}</Link>, sortValue: (r) => r.companyName },
    { key: "persona", header: "Lens", cell: (r) => <PersonaChip slug={r.persona} />, sortValue: (r) => r.persona },
    { key: "verdict", header: "Verdict", cell: (r) => <Badge variant={toneFor(r.verdict)}>{r.verdict}</Badge>, sortValue: (r) => r.verdict },
    { key: "irr", header: "Exp. IRR", cell: (r) => <span className={cn((r.expectedIrr ?? 0) >= 0.15 ? "text-pos" : "")}>{fmtPct(r.expectedIrr)}</span>, sortValue: (r) => r.expectedIrr, align: "right" },
    { key: "irrq", header: "IRR @ quote", cell: (r) => fmtPct(r.irrAtQuote), sortValue: (r) => r.irrAtQuote, align: "right" },
    { key: "mos", header: "MoS (PV)", cell: (r) => fmtMultiple(r.mos, 2), sortValue: (r) => r.mos, align: "right" },
    { key: "down", header: "Downside", cell: (r) => <span className="text-neg">{fmtPct(r.downside, 0)}</span>, sortValue: (r) => r.downside, align: "right" },
    { key: "quote", header: "Quote", cell: (r) => fmtPrice(r.quotePrice ?? r.memoPrice), sortValue: (r) => r.quotePrice ?? r.memoPrice, align: "right" },
    { key: "buy", header: "Buy ≤", cell: (r) => fmtPrice(r.buyPrice), sortValue: (r) => r.buyPrice, align: "right" },
    { key: "dist", header: "To buy", cell: (r) => <span className={cn(r.distanceToBuy !== null && r.distanceToBuy >= 0 ? "text-pos" : "text-muted")}>{fmtPct(r.distanceToBuy, 1, { sign: true })}</span>, sortValue: (r) => r.distanceToBuy, align: "right" },
    { key: "mcap", header: "Mkt cap", cell: (r) => (r.marketCapMm ? fmtCompactMoney(r.marketCapMm * 1e6) : "—"), sortValue: (r) => r.marketCapMm, align: "right" },
    { key: "mcs", header: "MCS", cell: (r) => { const s = mcsByTicker.get(r.ticker.toUpperCase()); return s ? <span className="text-gold">{fmtNum(s.mcs, 1)}</span> : "—"; }, sortValue: (r) => mcsByTicker.get(r.ticker.toUpperCase())?.mcs ?? null, align: "right" },
    { key: "held", header: "Held", cell: (r) => (r.heldWeight ? <span className="sensitive">{fmtPct(r.heldWeight, 2)}</span> : <span className="text-muted-2">—</span>), sortValue: (r) => r.heldWeight, align: "right" },
    { key: "sector", header: "Sector", cell: (r) => <span className="text-muted">{r.sector ?? "—"}</span>, sortValue: (r) => r.sector ?? "" },
    { key: "age", header: "Age", cell: (r) => <span className={cn((r.ageDays ?? 0) > 90 ? "text-warn" : "text-muted")}>{r.ageDays ?? "—"}d</span>, sortValue: (r) => r.ageDays, align: "right" },
    { key: "health", header: "Health", cell: (r) => <Badge variant={r.health === "healthy" ? "pos" : r.blocker ? "neg" : "muted"}>{r.health ?? "—"}</Badge>, sortValue: (r) => r.health ?? "" },
  ];

  const numField = (label: string, k: keyof ScreenSpec, step = 0.01, pct = true) => <NumField key={k} label={label} k={k} step={step} pct={pct} spec={spec} setSpec={setSpec} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {SCREEN_PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setSpec(p.spec); setName(p.name); }} title={p.description} className={cn("rounded-md border px-2 py-1 text-[11.5px]", JSON.stringify(p.spec) === JSON.stringify(spec) ? "border-gold/50 bg-gold-soft text-gold" : "border-border bg-surface-2 text-foreground-secondary hover:text-foreground")}>
            {p.name}
          </button>
        ))}
      </div>
      <Card>
        <CardContent className="pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative"><Label>Text</Label><Search className="absolute left-2 top-[30px] size-3.5 text-muted" /><Input value={spec.text ?? ""} onChange={(e) => setSpec({ ...spec, text: e.target.value || null })} className="pl-7 w-44" placeholder="ticker, name, sector" /></div>
            <div><Label>Lens</Label><Select value={spec.personas?.[0] ?? ""} onChange={(e) => setSpec({ ...spec, personas: e.target.value ? [e.target.value] : [] })}><option value="">All</option>{personas.map((p) => <option key={p} value={p}>{p}</option>)}</Select></div>
            <div><Label>Verdicts</Label><Select value={(spec.verdicts ?? []).join(",")} onChange={(e) => setSpec({ ...spec, verdicts: e.target.value ? e.target.value.split(",") : [] })}>
              <option value="">Any</option><option value="BUY,BUY-MORE">BUY / BUY-MORE</option><option value="BUY,BUY-MORE,MAINTAIN">Actionable</option><option value="WATCH">WATCH</option><option value="TRIM,EXIT,AVOID">Negative</option>
            </Select></div>
            <div><Label>Sector</Label><Select value={spec.sectors?.[0] ?? ""} onChange={(e) => setSpec({ ...spec, sectors: e.target.value ? [e.target.value] : [] })}><option value="">All</option>{sectors.map((s) => <option key={s}>{s}</option>)}</Select></div>
            {numField("Min IRR %", "minExpectedIrr")}
            {numField("Min MoS ×", "minMos", 0.05, false)}
            {numField("Worst downside %", "maxDownside")}
            {numField("Max age d", "maxAgeDays", 1, false)}
            {numField("Max cap $mm", "maxMarketCapMm", 100, false)}
            <div><Label>Held</Label><Select value={spec.held ?? "any"} onChange={(e) => setSpec({ ...spec, held: e.target.value as ScreenSpec["held"] })}><option value="any">Any</option><option value="held">Held</option><option value="not_held">Not held</option></Select></div>
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted pb-2"><input type="checkbox" checked={Boolean(spec.buyZoneOnly)} onChange={(e) => setSpec({ ...spec, buyZoneOnly: e.target.checked })} className="accent-[var(--gold)]" /> buy zone</label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted pb-2"><input type="checkbox" checked={Boolean(spec.rankableOnly)} onChange={(e) => setSpec({ ...spec, rankableOnly: e.target.checked })} className="accent-[var(--gold)]" /> rankable</label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted pb-2"><input type="checkbox" checked={Boolean(spec.mathMustWork)} onChange={(e) => setSpec({ ...spec, mathMustWork: e.target.checked })} className="accent-[var(--gold)]" /> math must work</label>
            <div className="ml-auto flex items-end gap-2">
              <div><Label>Save as</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Screen name" className="w-44" /></div>
              <Button variant="secondary" onClick={() => save.mutate()} disabled={!canWrite || save.isPending}><Save /> Save & run</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center gap-3 text-[11.5px] text-muted">
        <span><span className="num text-foreground">{rows.length}</span> of {universe.length} latest memos match</span>
        <span>· {rows.filter((r) => (r.heldWeight ?? 0) > 0).length} held</span>
        <span>· {rows.filter((r) => r.distanceToBuy !== null && r.distanceToBuy >= 0).length} in buy zone</span>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.memoId} defaultSort={spec.sort ? { key: spec.sort.key === "expectedIrr" ? "irr" : spec.sort.key === "mos" ? "mos" : spec.sort.key === "distanceToBuy" ? "dist" : spec.sort.key === "ageDays" ? "age" : "irr", dir: spec.sort.dir } : null} maxHeight="640px" />
    </div>
  );
}

// ── Backtest lab ────────────────────────────────────────────────────────────

function BacktestLab({ config, universe }: { config: Config; universe: UniverseRow[] }) {
  const [strategy, setStrategy] = React.useState<"basket" | "overlay">("basket");
  const [tickers, setTickers] = React.useState("MU, TSM, NVDA, AMKR");
  const [benchmark, setBenchmark] = React.useState("QQQ");
  const [from, setFrom] = React.useState("2021-01-01");
  const [rebalance, setRebalance] = React.useState<"none" | "monthly" | "quarterly">("quarterly");
  const [exposure, setExposure] = React.useState("0.9");
  const [name, setName] = React.useState("");
  const [result, setResult] = React.useState<QuantJobRow | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api<{ job: QuantJobRow }>("/api/hermes/quant-jobs", {
        method: "POST",
        json: {
          kind: "backtest",
          name: name || (strategy === "basket" ? `Basket ${tickers}` : `Overlay ${exposure}x`),
          spec:
            strategy === "basket"
              ? { strategy, tickers: tickers.split(/[,\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean), benchmark, from, rebalance, costBps: 5 }
              : { strategy, exposure: Number(exposure), cashRate: 0.045 },
          run: true,
        },
      }),
    onSuccess: (res) => {
      setResult(res.job);
      if (res.job.status === "error") toast.error(res.job.error ?? "Backtest failed");
      else toast.success("Backtest complete");
    },
    onError: (e) => toast.error(e.message),
  });

  const bt = result?.status === "done" ? (result.result as unknown as BacktestResult) : null;
  const suggested = universe.filter((r) => ["BUY", "BUY-MORE"].includes(r.verdict) && (r.heldWeight ?? 0) > 0).slice(0, 12).map((r) => r.symbol);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="inline-flex items-center gap-1.5"><FlaskConical className="size-3.5 text-gold" /> Specify</CardTitle>
            <CardDescription>Deterministic, stored as a job. Prices via {config.priceProvider === "none" ? "no provider (set HERMES_PRICE_PROVIDER)" : "stooq daily closes"}.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Strategy</Label><Select value={strategy} onChange={(e) => setStrategy(e.target.value as "basket" | "overlay")} className="w-full"><option value="basket">Basket vs benchmark</option><option value="overlay">Exposure overlay on realised book</option></Select></div>
          {strategy === "basket" ? (
            <>
              <div><Label>Tickers</Label><Input value={tickers} onChange={(e) => setTickers(e.target.value)} className="num" /><button type="button" className="mt-1 text-[10.5px] text-cyan" onClick={() => setTickers(suggested.join(", "))}>use held BUY names ({suggested.length})</button></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Benchmark</Label><Input value={benchmark} onChange={(e) => setBenchmark(e.target.value.toUpperCase())} className="num" /></div>
                <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              </div>
              <div><Label>Rebalance</Label><Select value={rebalance} onChange={(e) => setRebalance(e.target.value as typeof rebalance)} className="w-full"><option value="none">Buy & hold</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></Select></div>
            </>
          ) : (
            <>
              <div><Label>Exposure (1 = fully invested)</Label><Input type="number" step="0.05" value={exposure} onChange={(e) => setExposure(e.target.value)} className="num" /></div>
              <p className="text-[11px] text-muted">Uses the imported daily TWR series ({config.dailyPoints} points). {config.dailyPoints < 20 ? "Run `npm run migrate:performance` first." : ""}</p>
            </>
          )}
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" /></div>
          <Button onClick={() => run.mutate()} disabled={!config.write || run.isPending} className="w-full"><Play /> {run.isPending ? "Running…" : "Run backtest"}</Button>
          {!config.write ? <p className="text-[11px] text-warn">Jobs need SUPABASE_SERVICE_ROLE_KEY.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Result</CardTitle>
            <CardDescription>{result ? `${result.name} · ${result.status}${result.result_summary ? ` · ${result.result_summary}` : ""}` : "Run a backtest to see the equity curve and stats."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {result?.status === "error" ? <p className="text-[12px] text-neg num">{result.error}</p> : null}
          {bt ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-4">
                <Stat label="Strategy" value={fmtPct(bt.stats.strategy.cumulative)} size="sm" />
                <Stat label="Benchmark" value={fmtPct(bt.stats.benchmark.cumulative)} size="sm" />
                <Stat label="Active" value={fmtPct(bt.stats.activeCumulative, 1, { sign: true })} tone={(bt.stats.activeCumulative ?? 0) >= 0 ? "pos" : "neg"} size="sm" />
                <Stat label="CAGR" value={fmtPct(bt.stats.strategy.annualized)} size="sm" />
                <Stat label="Sharpe" value={fmtNum(bt.stats.strategy.sharpe, 2)} size="sm" />
                <Stat label="Sortino" value={fmtNum(bt.stats.strategy.sortino, 2)} size="sm" />
                <Stat label="Max DD" value={fmtPct(bt.stats.maxDrawdown)} tone="neg" size="sm" />
                <Stat label="Beta / IR" value={`${fmtNum(bt.stats.beta, 2)} / ${fmtNum(bt.stats.informationRatio, 2)}`} size="sm" />
              </div>
              <HermesLineChart data={bt.equity as unknown as Array<Record<string, unknown>>} series={[{ key: "strategy", label: "Strategy", area: true }, { key: "benchmark", label: "Benchmark" }]} yFormat={(v) => v.toFixed(0)} height={300} />
              {bt.notes.length ? <ul className="mt-2 text-[11px] text-muted list-disc pl-4">{bt.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
              <p className="mt-2 text-[11px] text-muted">{bt.days} trading days · {fmtDate(bt.from)} → {fmtDate(bt.to)}</p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Guru / insider flow ─────────────────────────────────────────────────────

function GuruFlow({ guru, universe }: { guru: GuruSignal[]; universe: UniverseRow[] }) {
  const [minBuyers, setMinBuyers] = React.useState(3);
  const [q, setQ] = React.useState("");
  const covered = React.useMemo(() => new Set(universe.map((u) => u.symbol)), [universe]);
  const held = React.useMemo(() => new Set(universe.filter((u) => (u.heldWeight ?? 0) > 0).map((u) => u.symbol)), [universe]);
  const rows = guru.filter((g) => g.buyers >= minBuyers && (!q || `${g.symbol} ${g.issuer ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const reportDate = guru[0]?.reportDate;

  const columns: Column<GuruSignal>[] = [
    { key: "symbol", header: "Symbol", cell: (g) => <TickerLink ticker={g.symbol} />, sortValue: (g) => g.symbol, width: "80px" },
    { key: "issuer", header: "Issuer", cell: (g) => <span className="text-foreground-secondary truncate block max-w-[220px]">{g.issuer}</span>, sortValue: (g) => g.issuer ?? "" },
    { key: "buyers", header: "Buyers", cell: (g) => <span className="text-pos">{g.buyers}</span>, sortValue: (g) => g.buyers, align: "right" },
    { key: "new", header: "New", cell: (g) => g.newBuyers, sortValue: (g) => g.newBuyers, align: "right" },
    { key: "sellers", header: "Sellers", cell: (g) => <span className="text-neg">{g.sellers}</span>, sortValue: (g) => g.sellers, align: "right" },
    { key: "out", header: "Sold out", cell: (g) => g.soldOut, sortValue: (g) => g.soldOut, align: "right" },
    { key: "net", header: "Net", cell: (g) => <span className={cn(g.net >= 0 ? "text-pos" : "text-neg")}>{g.net > 0 ? "+" : ""}{g.net}</span>, sortValue: (g) => g.net, align: "right" },
    { key: "bv", header: "Buy $", cell: (g) => fmtCompactMoney(g.buyValue), sortValue: (g) => g.buyValue, align: "right" },
    { key: "sv", header: "Sell $", cell: (g) => fmtCompactMoney(g.sellValue), sortValue: (g) => g.sellValue, align: "right" },
    { key: "cov", header: "Hermes", cell: (g) => (held.has(g.symbol) ? <Badge variant="gold">held</Badge> : covered.has(g.symbol) ? <Badge variant="cyan">memo</Badge> : <span className="text-muted-2">—</span>), sortValue: (g) => (held.has(g.symbol) ? 2 : covered.has(g.symbol) ? 1 : 0) },
    { key: "who", header: "Buyers", cell: (g) => <span className="text-muted truncate block max-w-[360px]" title={g.buyerNames.join(", ")}>{g.buyerNames.slice(0, 5).join(", ")}{g.buyerNames.length > 5 ? ` +${g.buyerNames.length - 5}` : ""}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[12px] text-muted inline-flex items-center gap-1.5"><Users className="size-3.5 text-gold" /> Tracked 13F filers · quarter ending {fmtDate(reportDate, "long")} · {guru.length} tickers with ≥2 buyers</p>
        <label className="flex items-center gap-2 text-[11.5px] text-muted">min buyers <input type="range" min={2} max={20} value={minBuyers} onChange={(e) => setMinBuyers(Number(e.target.value))} className="accent-[var(--gold)]" /><span className="num">{minBuyers}</span></label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="w-48" />
        <span className="ml-auto text-[11.5px] text-muted">{rows.length} shown</span>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(g) => `${g.symbol}-${g.reportDate}`} defaultSort={{ key: "net", dir: "desc" }} maxHeight="640px" />
      <p className="text-[11px] text-muted">Insider transactions: wire a provider under <code className="num">src/lib/altdata</code> (GuruFocus insider endpoints need the API key). Politician and insider feeds are on the roadmap in the README.</p>
    </div>
  );
}

// ── Alt-data ────────────────────────────────────────────────────────────────

function AltData({ config }: { config: Config }) {
  const [ticker, setTicker] = React.useState("MU");
  const [submitted, setSubmitted] = React.useState("MU");
  const news = useQuery({
    queryKey: ["altdata-news", submitted],
    queryFn: () => api<{ items: Array<{ title: string; url: string; source?: string; date?: string }>; provider: string; error?: string }>(`/api/altdata/news?ticker=${encodeURIComponent(submitted)}`),
    enabled: Boolean(submitted),
  });
  return (
    <div className="space-y-3">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(ticker); }}>
        <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className="w-32 num" />
        <Button type="submit" variant="secondary">Fetch news</Button>
        <span className="text-[11.5px] text-muted">{config.gurufocus ? "GuruFocus news feed" : "GuruFocus key not set — falling back to SEC EDGAR filings feed"}</span>
      </form>
      <Card>
        <CardContent className="pt-3">
          {news.isLoading ? <p className="text-[12px] text-muted">Loading…</p> : null}
          {news.data?.error ? <p className="text-[12px] text-neg">{news.data.error}</p> : null}
          <ul className="space-y-1.5">
            {(news.data?.items ?? []).map((n, i) => (
              <li key={i} className="text-[12px]">
                <a href={n.url} target="_blank" rel="noreferrer" className="text-foreground hover:text-gold">{n.title}</a>
                <span className="text-muted"> · {n.source ?? news.data?.provider} · {fmtDateTime(n.date)}</span>
              </li>
            ))}
          </ul>
          {news.data && news.data.items.length === 0 && !news.data.error ? <p className="text-[12px] text-muted">No items.</p> : null}
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted">Alt-data adapters live in <code className="num">src/lib/altdata</code>. Add a provider by implementing <code className="num">NewsProvider</code> and registering it in the route.</p>
    </div>
  );
}

// ── Jobs ────────────────────────────────────────────────────────────────────

function JobsPanel({ initial, canWrite }: { initial: QuantJobRow[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const jobs = useQuery({ queryKey: queryKeys.quantJobs(), queryFn: () => api<{ jobs: QuantJobRow[] }>("/api/hermes/quant-jobs").then((r) => r.jobs), initialData: initial, enabled: canWrite });
  useRealtime(["hermes_quant_jobs"], [queryKeys.quantJobs()]);
  const rerun = useMutation({ mutationFn: (id: string) => api(`/api/hermes/quant-jobs/${id}`, { method: "POST" }), onSuccess: () => { toast.success("Job re-run"); void queryClient.invalidateQueries({ queryKey: queryKeys.quantJobs() }); }, onError: (e) => toast.error(e.message) });
  const rows = jobs.data ?? initial;
  return (
    <div className="space-y-1.5">
      {rows.length === 0 ? <p className="text-[12px] text-muted">No jobs yet. Save a screen or run a backtest.</p> : null}
      {rows.map((j) => (
        <details key={j.id} className="panel px-4 py-2.5">
          <summary className="flex items-center gap-2 cursor-pointer text-[12.5px]">
            <Badge variant="muted">{j.kind}</Badge>
            <span className="font-medium text-foreground">{j.name}</span>
            <Badge variant={toneFor(j.status)}>{j.status}</Badge>
            <span className="text-muted truncate flex-1">{j.result_summary ?? j.error ?? j.description}</span>
            <span className="text-[10.5px] text-muted num">{j.requested_by} · {fmtDateTime(j.created_at)}</span>
            {canWrite && (j.kind === "screen" || j.kind === "backtest") ? <Button size="xs" variant="ghost" onClick={(e) => { e.preventDefault(); rerun.mutate(j.id); }}><Play /> re-run</Button> : null}
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border bg-surface-2 p-3 text-[11px] num">{JSON.stringify({ spec: j.spec, result: j.result }, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}

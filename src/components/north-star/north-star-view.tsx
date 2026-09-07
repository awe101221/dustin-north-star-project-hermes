"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Mandate, NorthStarStats } from "@/lib/db/northstar";
import type { Alert, Decision } from "@/lib/db/portfolio";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPp, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stat } from "@/components/ui/stat";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HermesLineChart } from "@/components/charts/line-chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { TickerLink, PersonaChip } from "@/components/ticker-link";

export function NorthStarView({ mandate, stats, decisions, alerts, canWrite }: { mandate: Mandate; stats: NorthStarStats; decisions: Decision[]; alerts: Alert[]; canWrite: boolean }) {
  const graded = decisions.filter((d) => d.alpha !== null);
  const hitRate = graded.length ? graded.filter((d) => (d.alpha ?? 0) > 0).length / graded.length : null;
  const avgAlpha = graded.length ? (graded.reduce((n, d) => n + (d.alpha ?? 0), 0) / graded.length) * 100 : null;
  const currentYear = stats.asOf?.slice(0, 4);
  const annualRows = [
    ...stats.annual,
    ...(currentYear && !stats.annual.some((a) => String(a.year) === currentYear)
      ? [{ year: Number(currentYear), twr: stats.ytdTwr, qqq: stats.qqqYtd, alphaPp: stats.ytdAlphaPp, startingNav: null, endingNav: stats.nav, netDeposits: null, source: "ytd", notes: "Year to date", partial: true }]
      : []),
  ];
  const last = (arr: Array<number | null>) => [...arr].reverse().find((v) => v !== null) ?? null;
  const rolling = stats.daily.rolling;
  const sharpe60 = last(rolling.map((r) => r.sharpe60));
  const sortino60 = last(rolling.map((r) => r.sortino60));
  const rollingData = rolling.filter((r) => r.sharpe60 !== null).map((r) => ({ date: r.date, sharpe60: r.sharpe60, sortino60: r.sortino60, sharpe120: r.sharpe120 }));
  const curveData = stats.daily.curve;

  const decisionColumns: Column<Decision>[] = [
    { key: "date", header: "Date", cell: (d) => fmtDate(d.date), sortValue: (d) => d.date, width: "80px" },
    { key: "verdict", header: "Action", cell: (d) => <Badge variant={toneFor(d.verdict)}>{d.verdict}</Badge>, sortValue: (d) => d.verdict },
    { key: "ticker", header: "Ticker", cell: (d) => <TickerLink ticker={d.ticker} />, sortValue: (d) => d.ticker },
    { key: "price", header: "Price", cell: (d) => fmtPrice(d.price), sortValue: (d) => d.price, align: "right" },
    { key: "qty", header: "Qty", cell: (d) => fmtNum(d.quantity, 0), sortValue: (d) => d.quantity, align: "right", sensitive: true },
    { key: "now", header: "Now", cell: (d) => fmtPrice(d.currentPrice), sortValue: (d) => d.currentPrice, align: "right" },
    { key: "ret", header: "Return", cell: (d) => <span className={cn((d.realizedReturn ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPct(d.realizedReturn)}</span>, sortValue: (d) => d.realizedReturn, align: "right" },
    { key: "qqq", header: "QQQ", cell: (d) => fmtPct(d.qqqReturn), sortValue: (d) => d.qqqReturn, align: "right" },
    { key: "alpha", header: "Alpha", cell: (d) => <span className={cn((d.alpha ?? 0) >= 0 ? "text-pos" : "text-neg")}>{d.alpha === null ? "—" : fmtPp(d.alpha * 100)}</span>, sortValue: (d) => d.alpha, align: "right" },
    { key: "rat", header: "Rationale", cell: (d) => <span className="text-muted truncate block max-w-[380px]">{d.rationale}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="YTD TWR" value={fmtPct(stats.ytdTwr)} caption={`QQQ ${fmtPct(stats.qqqYtd)}`} tone="gold" size="lg" />
        <Stat label="YTD alpha" value={fmtPp(stats.ytdAlphaPp)} tone={(stats.ytdAlphaPp ?? 0) >= 0 ? "pos" : "neg"} size="lg" caption="time-weighted" />
        <Stat label={`Alpha since ${fmtDate(stats.sinceDate)}`} value={fmtPct(stats.cumulativeAlpha, 1, { sign: true })} tone={(stats.cumulativeAlpha ?? 0) >= 0 ? "pos" : "neg"} size="lg" caption="NAV index vs QQQ index" />
        <Stat label="Rolling 60d Sharpe" value={fmtNum(sharpe60, 2)} caption={`Sortino ${fmtNum(sortino60, 2)}`} size="lg" tone={sharpe60 !== null && sharpe60 >= 1 ? "pos" : "flat"} />
        <Stat label="Beta / corr to QQQ" value={`${fmtNum(stats.daily.beta, 2)} / ${fmtNum(stats.daily.correlation, 2)}`} caption={stats.daily.available ? `${stats.daily.portfolio?.observations} daily obs` : "daily series not imported"} size="lg" />
        <Stat label="Decision hit rate" value={fmtPct(hitRate, 0)} caption={`${graded.length} graded · avg ${fmtPp(avgAlpha)}`} tone={hitRate !== null && hitRate >= 0.5 ? "pos" : "flat"} size="lg" />
      </div>

      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Stats vs QQQ</TabsTrigger>
          <TabsTrigger value="mandate">Mandate & rules</TabsTrigger>
          <TabsTrigger value="decisions">Decision scorecard · {decisions.length}</TabsTrigger>
          <TabsTrigger value="triggers">Armed triggers · {alerts.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><div><CardTitle>Year over year</CardTitle><CardDescription>Time-weighted return from IBKR statements vs QQQ total return. Alpha in percentage points.</CardDescription></div></CardHeader>
              <CardContent>
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left"><th className="eyebrow py-1">Year</th><th className="eyebrow py-1 text-right">Portfolio TWR</th><th className="eyebrow py-1 text-right">QQQ</th><th className="eyebrow py-1 text-right">Alpha</th><th className="eyebrow py-1 text-right">Ending NAV</th><th className="eyebrow py-1 text-right">Net deposits</th></tr></thead>
                  <tbody>
                    {annualRows.map((a) => (
                      <tr key={a.year} className="border-t border-border">
                        <td className="py-1.5 num">{a.year}{a.partial ? <span className="text-muted"> YTD</span> : ""}</td>
                        <td className="py-1.5 text-right num text-foreground">{fmtPct(a.twr)}</td>
                        <td className="py-1.5 text-right num">{fmtPct(a.qqq)}</td>
                        <td className={cn("py-1.5 text-right num font-semibold", (a.alphaPp ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPp(a.alphaPp)}</td>
                        <td className="py-1.5 text-right num sensitive">{fmtMoney(a.endingNav)}</td>
                        <td className="py-1.5 text-right num sensitive">{fmtMoney(a.netDeposits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {annualRows.length <= 1 ? <p className="mt-2 text-[11px] text-muted">Only one full year on file. Add rows to portfolio_annual_returns as statements close each year.</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Daily risk statistics</CardTitle><CardDescription>{stats.daily.available ? `${stats.daily.from} → ${stats.daily.to}, ${stats.daily.portfolio?.observations} aligned days` : "Import the daily series to unlock: npm run migrate:performance"}</CardDescription></div></CardHeader>
              <CardContent>
                {stats.daily.available && stats.daily.portfolio && stats.daily.benchmark ? (
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left"><th className="eyebrow py-1">Metric</th><th className="eyebrow py-1 text-right">Portfolio</th><th className="eyebrow py-1 text-right">QQQ</th></tr></thead>
                    <tbody>
                      {[
                        ["Cumulative", fmtPct(stats.daily.portfolio.cumulative), fmtPct(stats.daily.benchmark.cumulative)],
                        ["Annualized", fmtPct(stats.daily.portfolio.annualized), fmtPct(stats.daily.benchmark.annualized)],
                        ["Volatility (ann.)", fmtPct(stats.daily.portfolio.vol), fmtPct(stats.daily.benchmark.vol)],
                        ["Sharpe", fmtNum(stats.daily.portfolio.sharpe, 2), fmtNum(stats.daily.benchmark.sharpe, 2)],
                        ["Sortino", fmtNum(stats.daily.portfolio.sortino, 2), fmtNum(stats.daily.benchmark.sortino, 2)],
                        ["Max drawdown", fmtPct(stats.daily.portfolio.maxDrawdown), fmtPct(stats.daily.benchmark.maxDrawdown)],
                        ["Best / worst day", `${fmtPct(stats.daily.portfolio.bestDay)} / ${fmtPct(stats.daily.portfolio.worstDay)}`, `${fmtPct(stats.daily.benchmark.bestDay)} / ${fmtPct(stats.daily.benchmark.worstDay)}`],
                        ["Positive days", fmtPct(stats.daily.portfolio.positiveDays, 0), fmtPct(stats.daily.benchmark.positiveDays, 0)],
                        ["Tracking error / IR", `${fmtPct(stats.daily.trackingError)} / ${fmtNum(stats.daily.informationRatio, 2)}`, "—"],
                        ["Daily hit rate vs QQQ", fmtPct(stats.daily.hitRate, 0), "—"],
                      ].map(([k, a, b]) => (
                        <tr key={k} className="border-t border-border"><td className="py-1 text-muted">{k}</td><td className="py-1 text-right num text-foreground">{a}</td><td className="py-1 text-right num">{b}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[12px] text-muted">Rolling Sharpe/Sortino, beta, tracking error and drawdown need daily returns. The one-time import copies the daily TWR series and QQQ total-return index from the Dustin Awe Capital reference DB into hermes_performance_points; after that the IBKR sync keeps it current.</p>
                )}
              </CardContent>
            </Card>
          </div>
          {stats.daily.available ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader><div><CardTitle>Growth of 100 — daily</CardTitle><CardDescription>Compounded daily returns, aligned dates.</CardDescription></div></CardHeader>
                <CardContent><HermesLineChart data={curveData} series={[{ key: "portfolio", label: "Portfolio", area: true }, { key: "benchmark", label: "QQQ" }]} yFormat={(v) => v.toFixed(0)} height={260} /></CardContent>
              </Card>
              <Card>
                <CardHeader><div><CardTitle>Rolling Sharpe & Sortino</CardTitle><CardDescription>60-day windows (120-day Sharpe dashed). Annualized, rf = 0.</CardDescription></div></CardHeader>
                <CardContent><HermesLineChart data={rollingData} series={[{ key: "sharpe60", label: "Sharpe 60d" }, { key: "sortino60", label: "Sortino 60d" }, { key: "sharpe120", label: "Sharpe 120d", dashed: true, color: "var(--series-3)" }]} yFormat={(v) => v.toFixed(1)} referenceY={1} height={260} /></CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="mandate">
          <MandateEditor mandate={mandate} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="decisions">
          <div id="decisions">
            <DataTable rows={decisions} columns={decisionColumns} rowKey={(d) => d.id} defaultSort={{ key: "date", dir: "desc" }} maxHeight="640px" emptyMessage="No decisions detected yet." />
          </div>
        </TabsContent>

        <TabsContent value="triggers">
          <div className="space-y-1.5">
            {alerts.map((a) => (
              <div key={a.id} className="panel px-4 py-2 flex items-center gap-2 text-[12px]">
                <Badge variant={a.type.includes("approaching") ? "warn" : toneFor(a.type)}>{a.type.replace(/_/g, " ")}</Badge>
                <TickerLink ticker={a.ticker} />
                <span className="text-muted truncate flex-1">{a.note}</span>
                <span className="num">{fmtPrice(a.livePrice)} → {fmtPrice(a.triggerPrice)}</span>
                <span className="num text-warn">{fmtPct(a.pctToTrigger)}</span>
                <PersonaChip slug={a.persona} />
                <span className="text-[10.5px] text-muted num">{fmtDate(a.asOf)}</span>
              </div>
            ))}
            {alerts.length === 0 ? <p className="text-[12px] text-muted">No alerts recorded.</p> : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Rule = { id: string; title: string; detail?: string; kind?: "rule" | "gate" | "limit" | "process" };

function RuleList({ label, items, onChange, disabled }: { label: string; items: Rule[]; onChange: (items: Rule[]) => void; disabled: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5"><Label className="mb-0">{label}</Label>{!disabled ? <Button size="xs" variant="ghost" onClick={() => onChange([...items, { id: `r-${Date.now().toString(36)}`, title: "", kind: "rule" }])}><Plus /> add</Button> : null}</div>
      <div className="space-y-1.5">
        {items.map((r, i) => (
          <div key={r.id} className="flex gap-2 items-start">
            <Input value={r.title} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} disabled={disabled} placeholder="Rule" />
            <Input value={r.detail ?? ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))} disabled={disabled} placeholder="Detail (optional)" className="w-72" />
            {!disabled ? <Button size="icon-sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></Button> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MandateEditor({ mandate, canWrite }: { mandate: Mandate; canWrite: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    title: mandate.title,
    mission: mandate.mission,
    benchmark_symbol: mandate.benchmark,
    horizon_years: String(mandate.horizonYears),
    hurdle_irr: String(mandate.hurdleIrr * 100),
    rules: mandate.rules as Rule[],
    guardrails: mandate.guardrails as Rule[],
    kpis: mandate.kpis,
    sleeves: mandate.sleeves,
  });
  const save = useMutation({
    mutationFn: () => api("/api/hermes/mandate", { method: "PUT", json: { ...form, horizon_years: Number(form.horizon_years), hurdle_irr: Number(form.hurdle_irr) / 100, rules: form.rules.filter((r) => r.title.trim()), guardrails: form.guardrails.filter((r) => r.title.trim()), metadata: mandate.metadata } }),
    onSuccess: () => { toast.success("Mandate saved (version bumped)"); router.refresh(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <Card>
        <CardHeader>
          <div><CardTitle>Mandate</CardTitle><CardDescription>Versioned. Saving records a mandate.updated event in the activity log.</CardDescription></div>
          <Button size="sm" onClick={() => save.mutate()} disabled={!canWrite || save.isPending}><Save /> {save.isPending ? "Saving…" : `Save as v${mandate.version + 1}`}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={!canWrite} /></div>
            <div><Label>Benchmark</Label><Input value={form.benchmark_symbol} onChange={(e) => setForm({ ...form, benchmark_symbol: e.target.value.toUpperCase() })} disabled={!canWrite} className="num" /></div>
            <div><Label>Horizon (years)</Label><Input type="number" value={form.horizon_years} onChange={(e) => setForm({ ...form, horizon_years: e.target.value })} disabled={!canWrite} className="num" /></div>
            <div className="col-span-2 md:col-span-3"><Label>Mission</Label><Textarea value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} disabled={!canWrite} /></div>
            <div><Label>Hurdle IRR %</Label><Input type="number" step="0.5" value={form.hurdle_irr} onChange={(e) => setForm({ ...form, hurdle_irr: e.target.value })} disabled={!canWrite} className="num" /></div>
          </div>
          <RuleList label="Rules & gates" items={form.rules} onChange={(rules) => setForm({ ...form, rules })} disabled={!canWrite} />
          <RuleList label="Guardrails" items={form.guardrails} onChange={(guardrails) => setForm({ ...form, guardrails })} disabled={!canWrite} />
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>KPIs</CardTitle></CardHeader>
          <CardContent>
            {form.kpis.map((k) => (
              <div key={k.id} className="flex items-baseline justify-between gap-3 py-1 hairline-b last:border-b-0 text-[12px]"><span className="text-foreground-secondary">{k.label}</span><span className="num text-muted">{k.target}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sleeves</CardTitle></CardHeader>
          <CardContent>
            {form.sleeves.map((s) => (
              <div key={s.id} className="py-1.5 hairline-b last:border-b-0 text-[12px]"><p className="text-foreground">{s.name} <span className="text-muted">· vs {s.benchmark ?? form.benchmark_symbol}</span></p><p className="text-muted">{s.role}{s.target_weight !== undefined ? ` · target ${fmtPct(s.target_weight, 0)}` : ""}</p></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

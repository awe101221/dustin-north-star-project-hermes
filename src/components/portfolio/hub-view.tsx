"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Layers } from "lucide-react";
import type { PortfolioHub } from "@/lib/db/hub";
import { fmtCompactMoney, fmtDate, fmtMoney, fmtPct, fmtPp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stat, BarRow, KV } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, SectionHeading } from "@/components/ui/card";
import { Badge, toneFor } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HermesLineChart } from "@/components/charts/line-chart";
import { HermesBarChart } from "@/components/charts/bar-chart";
import { TickerLink, PersonaChip } from "@/components/ticker-link";
import { Markdown } from "@/components/markdown";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { TradeLog } from "@/components/portfolio/trade-log";
import { SleevesPanel } from "@/components/portfolio/sleeves-panel";

export function PortfolioHubView({ hub }: { hub: PortfolioHub }) {
  const ytdData = hub.ytdSeries.map((p) => ({ date: p.date, portfolio: p.portfolio === null ? null : p.portfolio * 100, qqq: p.qqq === null ? null : p.qqq * 100 }));
  const attributionTop = [...hub.attribution.slice(0, 8), ...hub.attribution.slice(-6)].map((a) => ({ name: a.symbol, pnl: a.pnlYtd, contribution: a.contribution * 100 }));
  const alphaTone = hub.ytdAlphaPp === null ? "flat" : hub.ytdAlphaPp >= 0 ? "pos" : "neg";
  const approaching = hub.alerts.filter((a) => a.type.includes("approaching")).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Net liquidation" value={fmtMoney(hub.nav)} caption={`cash ${fmtCompactMoney(hub.cash)}`} sensitive size="lg" />
        <Stat label="YTD TWR" value={fmtPct(hub.ytdTwr)} caption={`QQQ ${fmtPct(hub.qqqYtd)}`} tone="gold" size="lg" />
        <Stat label="YTD alpha" value={fmtPp(hub.ytdAlphaPp)} tone={alphaTone} caption="time-weighted, flow-neutral" size="lg" />
        <Stat label={`Alpha since ${fmtDate(hub.alphaSince)}`} value={fmtPct(hub.cumulativeAlpha, 1, { sign: true })} tone={(hub.cumulativeAlpha ?? 0) >= 0 ? "pos" : "neg"} caption="NAV index vs QQQ index" size="lg" />
        <Stat label="Unrealized P&L" value={fmtCompactMoney(hub.unrealized)} tone={hub.unrealized >= 0 ? "pos" : "neg"} caption={`${hub.positions.length} lines`} sensitive size="lg" />
        <Stat label="Top 10 concentration" value={fmtPct(hub.concentration.top10, 0)} caption={`top 5 ${fmtPct(hub.concentration.top5, 0)} · top 20 ${fmtPct(hub.concentration.top20, 0)}`} size="lg" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Benchmark chart */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Portfolio vs QQQ — year to date</CardTitle>
              <CardDescription>Time-weighted return, both series rebased to 0% on Jan 1. {hub.seriesSource === "daily" ? "Daily." : "Statement snapshots (import the daily series for rolling stats)."}</CardDescription>
            </div>
            <Link href="/north-star" className="text-[11.5px] text-cyan hover:underline inline-flex items-center gap-1">
              North Star stats <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {ytdData.length > 1 ? (
              <HermesLineChart
                data={ytdData}
                series={[
                  { key: "portfolio", label: "Portfolio (TWR)", area: true, format: (v) => `${v.toFixed(1)}%` },
                  { key: "qqq", label: "QQQ", format: (v) => `${v.toFixed(1)}%` },
                ]}
                yFormat={(v) => `${v.toFixed(0)}%`}
                referenceY={0}
                height={280}
              />
            ) : (
              <p className="text-[12px] text-muted py-10 text-center">No YTD series yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Alerts + recommendations */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="inline-flex items-center gap-1.5"><Bell className="size-3.5 text-gold" /> Desk signals</CardTitle>
              <CardDescription>Armed triggers approaching and open master recommendations.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="eyebrow mb-1.5">Approaching entry</p>
              {approaching.length === 0 ? <p className="text-[12px] text-muted">No trigger within range.</p> : null}
              {approaching.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[12px]">
                  <TickerLink ticker={a.ticker} />
                  <span className="text-muted truncate flex-1">{a.note}</span>
                  <span className="num text-warn">{fmtPct(a.pctToTrigger, 1)}</span>
                  <PersonaChip slug={a.persona} />
                </div>
              ))}
            </div>
            <div>
              <p className="eyebrow mb-1.5">Open recommendations ({hub.recommendations.length})</p>
              <div className="max-h-56 overflow-y-auto pr-1">
                {hub.recommendations.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[12px]">
                    <Badge variant={toneFor(r.action)}>{r.action}</Badge>
                    <TickerLink ticker={r.ticker} />
                    <span className="text-muted truncate flex-1">{r.sizeSuggestion ?? r.rationale}</span>
                    <span className="num text-muted sensitive">{fmtPct(r.currentWeight, 2)}</span>
                  </div>
                ))}
                {hub.recommendations.length === 0 ? <p className="text-[12px] text-muted">Nothing open.</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exposure + attribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="inline-flex items-center gap-1.5"><Layers className="size-3.5 text-gold" /> Exposure</CardTitle>
              <CardDescription>Share of NAV. Sector needs a memo-backed company record; the rest shows as Unclassified.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sector">
              <TabsList>
                <TabsTrigger value="sector">Sector</TabsTrigger>
                <TabsTrigger value="currency">Currency</TabsTrigger>
                <TabsTrigger value="country">Country</TabsTrigger>
              </TabsList>
              {(["sector", "currency", "country"] as const).map((k) => (
                <TabsContent key={k} value={k}>
                  {hub.exposures[k].slice(0, 12).map((b, i) => (
                    <BarRow key={b.key} label={`${b.label} · ${b.count}`} value={b.weight} max={hub.exposures[k][0]?.weight ?? 1} display={fmtPct(b.weight, 1)} color={i === 0 ? "var(--series-1)" : "var(--series-2)"} />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>YTD alpha attribution by name</CardTitle>
              <CardDescription>
                Total P&L per name (unrealized + realized + dividends + option P&L) as a share of starting NAV {hub.startingNav ? fmtCompactMoney(hub.startingNav) : ""}. Top 8 and bottom 6.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="sensitive">
              <HermesBarChart data={attributionTop} xKey="name" yKey="contribution" format={(v) => `${v.toFixed(2)}pp`} height={240} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Positions */}
      <div>
        <SectionHeading eyebrow="Book" title="Positions" aside={`${hub.positions.length} lines · MV ${fmtCompactMoney(hub.marketValue)} · options ${fmtCompactMoney(hub.optionsMv)}`} />
        <PositionsTable positions={hub.positions} options={hub.options} />
      </div>

      {/* Sleeves + decisions + trade log */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SleevesPanel sleeves={hub.sleeves} />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Decision scorecard</CardTitle>
              <CardDescription>Auto-detected adds/trims graded against QQQ from the decision date.</CardDescription>
            </div>
            <Link href="/north-star#decisions" className="text-[11.5px] text-cyan hover:underline">All →</Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="panel-2 px-3 py-2"><p className="eyebrow">Graded</p><p className="num text-[16px] font-semibold mt-1">{hub.decisions.graded}</p></div>
              <div className="panel-2 px-3 py-2"><p className="eyebrow">Hit rate</p><p className={cn("num text-[16px] font-semibold mt-1", (hub.decisions.hitRate ?? 0) >= 0.5 ? "text-pos" : "text-neg")}>{fmtPct(hub.decisions.hitRate, 0)}</p></div>
              <div className="panel-2 px-3 py-2"><p className="eyebrow">Avg alpha</p><p className={cn("num text-[16px] font-semibold mt-1", (hub.decisions.avgAlphaPp ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPp(hub.decisions.avgAlphaPp)}</p></div>
            </div>
            {hub.decisions.recent.slice(0, 8).map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[12px]">
                <Badge variant={toneFor(d.verdict)}>{d.verdict}</Badge>
                <TickerLink ticker={d.ticker} />
                <span className="text-muted num">{fmtDate(d.date)}</span>
                <span className="flex-1" />
                <span className={cn("num", (d.alpha ?? 0) >= 0 ? "text-pos" : "text-neg")}>{d.alpha === null ? "—" : fmtPp(d.alpha * 100)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <TradeLog initial={hub.trades} />
      </div>

      {/* Digest */}
      {hub.digest ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Master digest · {fmtDate(hub.digest.as_of, "long")}</CardTitle>
              <CardDescription>Generated by the daily master refresh from the legacy Awe Capital pipeline.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-[12px] text-cyan">Show digest</summary>
              <div className="mt-3 sensitive-none">
                <Markdown>{hub.digest.digest_markdown}</Markdown>
              </div>
            </details>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              <KV k="Annual returns on file" v={hub.annual.map((a) => `${a.year}: ${fmtPct(a.twr)} vs ${fmtPct(a.qqq)}`).join(" · ") || "—"} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

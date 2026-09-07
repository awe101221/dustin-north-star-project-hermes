"use client";

import * as React from "react";
import type { OptionPosition, Position } from "@/lib/db/portfolio";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerLink } from "@/components/ticker-link";
import { Badge } from "@/components/ui/badge";

export function PositionsTable({ positions, options }: { positions: Position[]; options: OptionPosition[] }) {
  const [q, setQ] = React.useState("");
  const [minWeight, setMinWeight] = React.useState<number>(0);
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return positions.filter((p) => p.weight >= minWeight / 100 && (!needle || `${p.symbol} ${p.companyName} ${p.sector ?? ""} ${p.currency}`.toLowerCase().includes(needle)));
  }, [positions, q, minWeight]);

  const columns: Column<Position>[] = [
    { key: "symbol", header: "Symbol", cell: (p) => <TickerLink ticker={p.ticker ?? p.symbol} />, sortValue: (p) => p.symbol, width: "84px" },
    { key: "name", header: "Company", cell: (p) => <span className="text-foreground-secondary truncate block max-w-[220px]">{p.companyName}</span>, sortValue: (p) => p.companyName },
    { key: "sector", header: "Sector", cell: (p) => <span className="text-muted">{p.sector ?? "—"}</span>, sortValue: (p) => p.sector ?? "" },
    { key: "ccy", header: "Ccy", cell: (p) => <span className="text-muted">{p.currency}</span>, sortValue: (p) => p.currency, width: "48px" },
    { key: "weight", header: "Weight", cell: (p) => fmtPct(p.weight, 2), sortValue: (p) => p.weight, align: "right" },
    { key: "mv", header: "Market value", cell: (p) => fmtMoney(p.marketValue), sortValue: (p) => p.marketValue, align: "right", sensitive: true },
    { key: "qty", header: "Qty", cell: (p) => fmtNum(p.quantity, p.quantity % 1 === 0 ? 0 : 2), sortValue: (p) => p.quantity, align: "right", sensitive: true },
    { key: "px", header: "Last", cell: (p) => fmtPrice(p.closePrice, p.currency), sortValue: (p) => p.closePrice, align: "right" },
    { key: "cost", header: "Avg cost", cell: (p) => fmtPrice(p.costPrice, p.currency), sortValue: (p) => p.costPrice, align: "right", sensitive: true },
    {
      key: "upnl",
      header: "Unrealized",
      cell: (p) => <span className={cn(p.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(p.unrealizedPnl)}</span>,
      sortValue: (p) => p.unrealizedPnl,
      align: "right",
      sensitive: true,
    },
    {
      key: "roi",
      header: "YTD ROI",
      cell: (p) => <span className={cn((p.ytdRoi ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPct(p.ytdRoi, 1)}</span>,
      sortValue: (p) => p.ytdRoi,
      align: "right",
    },
    { key: "div", header: "Div YTD", cell: (p) => fmtMoney(p.dividendsYtd), sortValue: (p) => p.dividendsYtd, align: "right", sensitive: true },
  ];

  const optionColumns: Column<OptionPosition>[] = [
    { key: "u", header: "Underlying", cell: (o) => <TickerLink ticker={o.underlying} />, sortValue: (o) => o.underlying },
    { key: "r", header: "Right", cell: (o) => <Badge variant={o.right === "C" ? "cyan" : "warn"}>{o.right === "C" ? "Call" : "Put"}</Badge>, sortValue: (o) => o.right, width: "70px" },
    { key: "k", header: "Strike", cell: (o) => fmtNum(o.strike, 2), sortValue: (o) => o.strike, align: "right" },
    { key: "e", header: "Expiry", cell: (o) => fmtDate(o.expiry), sortValue: (o) => o.expiry },
    { key: "dte", header: "DTE", cell: (o) => (o.dte === null ? "—" : `${o.dte}d`), sortValue: (o) => o.dte, align: "right" },
    { key: "q", header: "Qty", cell: (o) => <span className={cn(o.quantity < 0 ? "text-neg" : "text-pos")}>{fmtNum(o.quantity)}</span>, sortValue: (o) => o.quantity, align: "right", sensitive: true },
    { key: "mv", header: "Market value", cell: (o) => fmtMoney(o.marketValue), sortValue: (o) => o.marketValue, align: "right", sensitive: true },
    { key: "pnl", header: "Unrealized", cell: (o) => <span className={cn(o.unrealizedPnl >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(o.unrealizedPnl)}</span>, sortValue: (o) => o.unrealizedPnl, align: "right", sensitive: true },
  ];

  return (
    <Tabs defaultValue="equities">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <TabsList>
          <TabsTrigger value="equities">Equities · {positions.length}</TabsTrigger>
          <TabsTrigger value="options">Options · {options.length}</TabsTrigger>
        </TabsList>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter symbol, name, sector…" className="w-64" />
        <label className="flex items-center gap-2 text-[11.5px] text-muted">
          min weight
          <input type="range" min={0} max={3} step={0.25} value={minWeight} onChange={(e) => setMinWeight(Number(e.target.value))} className="accent-[var(--gold)]" />
          <span className="num w-10">{minWeight.toFixed(2)}%</span>
        </label>
        <span className="ml-auto text-[11.5px] text-muted">{filtered.length} shown</span>
      </div>
      <TabsContent value="equities" className="mt-0">
        <DataTable rows={filtered} columns={columns} rowKey={(p) => p.id} defaultSort={{ key: "weight", dir: "desc" }} maxHeight="560px" />
      </TabsContent>
      <TabsContent value="options" className="mt-0">
        <DataTable rows={options} columns={optionColumns} rowKey={(o) => o.id} defaultSort={{ key: "mv", dir: "asc" }} maxHeight="420px" emptyMessage="No open option positions in the latest statement." />
      </TabsContent>
    </Tabs>
  );
}

"use client";

import * as React from "react";
import { fmtDate, fmtPct } from "@/lib/format";
import { uniq } from "@/lib/utils";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/input";
import { Badge, toneFor } from "@/components/ui/badge";
import { TickerLink, personaLabel } from "@/components/ticker-link";

export type CompanyListRow = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  lenses: string[];
  bestVerdict: string | null;
  bestIrr: number | null;
  latestMemoAt: string | null;
  weight: number | null;
  stage: string | null;
  memoCount: number;
};

export function CompaniesTable({ rows }: { rows: CompanyListRow[] }) {
  const [q, setQ] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [only, setOnly] = React.useState<"all" | "held" | "covered" | "pipeline">("all");
  const sectors = React.useMemo(() => uniq(rows.map((r) => r.sector).filter((s): s is string => Boolean(s))).sort(), [rows]);
  const filtered = rows.filter((r) => {
    if (sector && r.sector !== sector) return false;
    if (only === "held" && !(r.weight && r.weight > 0)) return false;
    if (only === "covered" && r.memoCount === 0) return false;
    if (only === "pipeline" && !r.stage) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${r.ticker} ${r.symbol} ${r.name} ${r.industry ?? ""}`.toLowerCase().includes(needle);
  });
  const columns: Column<CompanyListRow>[] = [
    { key: "ticker", header: "Ticker", cell: (r) => <TickerLink ticker={r.ticker} showExchange />, sortValue: (r) => r.ticker, width: "110px" },
    { key: "name", header: "Company", cell: (r) => <span className="text-foreground-secondary truncate block max-w-[240px]">{r.name}</span>, sortValue: (r) => r.name },
    { key: "sector", header: "Sector", cell: (r) => <span className="text-muted">{r.sector ?? "—"}</span>, sortValue: (r) => r.sector ?? "" },
    { key: "country", header: "Country", cell: (r) => <span className="text-muted">{r.country ?? "—"}</span>, sortValue: (r) => r.country ?? "" },
    { key: "lenses", header: "Coverage", cell: (r) => <span className="flex gap-1 flex-wrap">{r.lenses.map((l) => { const [p, v] = l.split(":"); return <Badge key={l} variant={toneFor(v)}>{personaLabel(p)}</Badge>; })}</span>, sortValue: (r) => r.memoCount },
    { key: "irr", header: "Best IRR", cell: (r) => fmtPct(r.bestIrr), sortValue: (r) => r.bestIrr, align: "right" },
    { key: "weight", header: "Held", cell: (r) => (r.weight ? <span className="sensitive">{fmtPct(r.weight, 2)}</span> : <span className="text-muted-2">—</span>), sortValue: (r) => r.weight, align: "right" },
    { key: "stage", header: "Pipeline", cell: (r) => (r.stage ? <Badge variant={toneFor(r.stage)}>{r.stage}</Badge> : <span className="text-muted-2">—</span>), sortValue: (r) => r.stage ?? "" },
    { key: "at", header: "Latest memo", cell: (r) => <span className="text-muted">{fmtDate(r.latestMemoAt)}</span>, sortValue: (r) => r.latestMemoAt ?? "" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or name…" className="w-64" />
        <Select value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All sectors</option>{sectors.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select value={only} onChange={(e) => setOnly(e.target.value as typeof only)}><option value="all">Everything</option><option value="held">Held</option><option value="covered">With memos</option><option value="pipeline">On pipeline</option></Select>
        <span className="ml-auto text-[11.5px] text-muted">{filtered.length} of {rows.length}</span>
      </div>
      <DataTable rows={filtered} columns={columns} rowKey={(r) => r.ticker} maxHeight="calc(100dvh - 240px)" />
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { api, queryKeys } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { KV } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";

export type NorthStarSummary = {
  configured: boolean;
  asOf: string | null;
  nav: number | null;
  ytdTwr: number | null;
  qqqYtd: number | null;
  ytdAlphaPp: number | null;
  cumulativeAlpha: number | null;
  sinceDate: string | null;
  sharpe60: number | null;
  sortino60: number | null;
  beta: number | null;
  hitRate: number | null;
  mandate: {
    title: string;
    mission: string;
    benchmark: string;
    horizonYears: number;
    hurdleIrr: number;
    rules: Array<{ id: string; title: string; detail?: string; kind?: string }>;
    kpis: Array<{ id: string; label: string; target?: string; detail?: string }>;
    guardrails: Array<{ id: string; title: string }>;
    version: number;
  };
  openRecommendations: number;
  approachingTriggers: number;
};

export function useNorthStarSummary() {
  return useQuery({
    queryKey: queryKeys.northStar,
    queryFn: () => api<NorthStarSummary>("/api/north-star/summary"),
    staleTime: 60_000,
  });
}

/** Compact always-on strip in the top bar: YTD vs QQQ and alpha. */
export function NorthStarStrip() {
  const { data } = useNorthStarSummary();
  if (!data?.configured) return null;
  const alphaTone = data.ytdAlphaPp === null ? "flat" : data.ytdAlphaPp >= 0 ? "pos" : "neg";
  return (
    <div className="hidden md:flex items-center gap-4 text-[11.5px]">
      <span className="text-muted">YTD</span>
      <span className="num text-foreground sensitive">{fmtPct(data.ytdTwr)}</span>
      <span className="text-muted-2">vs</span>
      <span className="num text-foreground-secondary">QQQ {fmtPct(data.qqqYtd)}</span>
      <span className={cn("num font-semibold", alphaTone === "pos" && "text-pos", alphaTone === "neg" && "text-neg", alphaTone === "flat" && "text-muted")}>
        {fmtPp(data.ytdAlphaPp)}
      </span>
      <span className="text-muted-2">·</span>
      <span className="text-muted">since {fmtDate(data.sinceDate)}</span>
      <span className={cn("num font-semibold", (data.cumulativeAlpha ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPct(data.cumulativeAlpha, 1, { sign: true })}</span>
    </div>
  );
}

export function NorthStarDrawer() {
  const { northStarOpen, setNorthStarOpen } = useUiStore();
  const { data, isLoading } = useNorthStarSummary();

  return (
    <Dialog open={northStarOpen} onOpenChange={setNorthStarOpen}>
      <SheetContent width="max-w-md">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Compass className="size-4 text-gold" />
            <DialogTitle className="text-[15px] font-semibold">North Star</DialogTitle>
            {data?.mandate ? <Badge variant="gold">v{data.mandate.version}</Badge> : null}
          </div>
          <p className="text-[12.5px] text-foreground-secondary leading-5">
            {data?.mandate?.mission ?? "Beat QQQ over 10 years."}
          </p>

          {isLoading ? <p className="mt-6 text-[12px] text-muted">Loading…</p> : null}

          {data?.configured ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="panel-2 px-3 py-2">
                  <p className="eyebrow">YTD TWR</p>
                  <p className="num text-[18px] font-semibold text-foreground mt-1 sensitive">{fmtPct(data.ytdTwr)}</p>
                  <p className="text-[11px] text-muted">QQQ {fmtPct(data.qqqYtd)}</p>
                </div>
                <div className="panel-2 px-3 py-2">
                  <p className="eyebrow">YTD alpha</p>
                  <p className={cn("num text-[18px] font-semibold mt-1", (data.ytdAlphaPp ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPp(data.ytdAlphaPp)}</p>
                  <p className="text-[11px] text-muted">as of {fmtDate(data.asOf)}</p>
                </div>
              </div>
              <div className="mt-3">
                <KV k="NAV" v={<span className="sensitive">{fmtMoney(data.nav)}</span>} />
                <KV k={`Cumulative alpha since ${fmtDate(data.sinceDate)}`} v={fmtPct(data.cumulativeAlpha, 1, { sign: true })} />
                <KV k="Rolling 60d Sharpe / Sortino" v={`${fmtNum(data.sharpe60, 2)} / ${fmtNum(data.sortino60, 2)}`} />
                <KV k="Beta to QQQ (daily)" v={fmtNum(data.beta, 2)} />
                <KV k="Daily hit rate vs QQQ" v={fmtPct(data.hitRate, 0)} />
                <KV k="Open recommendations" v={data.openRecommendations} />
                <KV k="Triggers approaching" v={data.approachingTriggers} />
              </div>
            </>
          ) : null}

          {data?.mandate ? (
            <>
              <p className="eyebrow mt-6 mb-2">Rules & gates</p>
              <ul className="space-y-1.5">
                {data.mandate.rules.map((r) => (
                  <li key={r.id} className="flex gap-2 text-[12px] text-foreground-secondary">
                    <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-gold" />
                    <span>{r.title}</span>
                  </li>
                ))}
              </ul>
              <p className="eyebrow mt-5 mb-2">KPIs</p>
              <ul className="space-y-1">
                {data.mandate.kpis.map((k) => (
                  <li key={k.id} className="flex justify-between gap-2 text-[12px]">
                    <span className="text-foreground-secondary">{k.label}</span>
                    <span className="num text-muted">{k.target}</span>
                  </li>
                ))}
              </ul>
              <p className="eyebrow mt-5 mb-2">Guardrails</p>
              <ul className="space-y-1">
                {data.mandate.guardrails.map((g) => (
                  <li key={g.id} className="text-[12px] text-muted">— {g.title}</li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="mt-6 flex gap-2">
            <Link href="/north-star" onClick={() => setNorthStarOpen(false)} className="text-[12px] text-cyan hover:underline">
              Open the full North Star →
            </Link>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}

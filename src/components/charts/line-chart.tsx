"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Multi-series line chart with the Hermes chart chrome: recessive grid, mono
 * axis ticks, crosshair tooltip, direct labels via the legend row. Series
 * colors come from the fixed categorical slots (validated in globals.css).
 */
export type LineSeries = {
  key: string;
  label: string;
  color?: string;
  format?: (v: number) => string;
  area?: boolean;
  dashed?: boolean;
  sensitive?: boolean;
};

const SLOT_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

export function HermesLineChart({
  data,
  series,
  xKey = "date",
  height = 260,
  yFormat,
  yDomain,
  referenceY,
  className,
  compact,
}: {
  data: Array<Record<string, unknown>>;
  series: LineSeries[];
  xKey?: string;
  height?: number;
  yFormat?: (v: number) => string;
  yDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  referenceY?: number;
  className?: string;
  compact?: boolean;
}) {
  const colors = React.useMemo(() => series.map((s, i) => s.color ?? SLOT_COLORS[i % SLOT_COLORS.length]!), [series]);
  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-foreground-secondary">
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 rounded" style={{ background: colors[i], borderTop: s.dashed ? "2px dashed" : undefined }} />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) =>
              s.area ? (
                <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
                </linearGradient>
              ) : null,
            )}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey={xKey} tickFormatter={(v) => fmtDate(String(v))} minTickGap={40} axisLine={false} tickLine={false} tick={{ fontSize: 10.5 }} />
          <YAxis
            width={compact ? 40 : 54}
            tickFormatter={(v) => (yFormat ? yFormat(Number(v)) : String(v))}
            domain={yDomain ?? ["auto", "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10.5 }}
          />
          {referenceY !== undefined ? <ReferenceLine y={referenceY} stroke="var(--axis)" strokeDasharray="3 3" /> : null}
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border border-border-strong bg-overlay px-2.5 py-2 text-[11.5px] shadow-xl">
                  <p className="text-muted mb-1">{fmtDate(String(label), "long")}</p>
                  {payload.map((p, i) => {
                    const s = series.find((x) => x.key === p.dataKey);
                    const v = typeof p.value === "number" ? p.value : Number(p.value);
                    return (
                      <div key={String(p.dataKey) + i} className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 text-foreground-secondary">
                          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
                          {s?.label ?? String(p.dataKey)}
                        </span>
                        <span className={cn("num text-foreground", s?.sensitive && "sensitive")}>{s?.format ? s.format(v) : yFormat ? yFormat(v) : v.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {series.map((s, i) =>
            s.area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} stroke={colors[i]} strokeWidth={2} fill={`url(#area-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} connectNulls />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={colors[i]} strokeWidth={2} strokeDasharray={s.dashed ? "4 3" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} connectNulls />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

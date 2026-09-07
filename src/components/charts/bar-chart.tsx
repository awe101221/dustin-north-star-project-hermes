"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

/**
 * Horizontal/vertical bar with polarity coloring for P&L-style data (positive
 * = success status color, negative = critical). Thin bars, 4px rounded ends
 * anchored on the baseline, per-bar hover tooltip.
 */
export function HermesBarChart({
  data,
  xKey,
  yKey,
  height = 220,
  format,
  layout = "horizontal",
  polarity = true,
  color = "var(--series-1)",
  className,
  sensitive,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  height?: number;
  format?: (v: number) => string;
  layout?: "horizontal" | "vertical";
  polarity?: boolean;
  color?: string;
  className?: string;
  sensitive?: boolean;
}) {
  const vertical = layout === "vertical";
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 4, right: 8, bottom: 0, left: vertical ? 8 : 0 }} barCategoryGap={vertical ? 3 : "24%"}>
          <CartesianGrid horizontal={!vertical} vertical={vertical} strokeDasharray="2 4" />
          {vertical ? (
            <>
              <XAxis type="number" tickFormatter={(v) => (format ? format(Number(v)) : String(v))} axisLine={false} tickLine={false} tick={{ fontSize: 10.5 }} />
              <YAxis type="category" dataKey={xKey} width={72} axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "var(--foreground-secondary)" }} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 10.5 }} interval={0} />
              <YAxis tickFormatter={(v) => (format ? format(Number(v)) : String(v))} axisLine={false} tickLine={false} tick={{ fontSize: 10.5 }} width={54} />
            </>
          )}
          {polarity ? <ReferenceLine {...(vertical ? { x: 0 } : { y: 0 })} stroke="var(--axis)" /> : null}
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as Record<string, unknown>;
              const v = Number(payload[0]!.value);
              return (
                <div className="rounded-md border border-border-strong bg-overlay px-2.5 py-2 text-[11.5px] shadow-xl">
                  <p className="text-foreground-secondary">{String(row[xKey])}</p>
                  <p className={cn("num text-foreground", sensitive && "sensitive")}>{format ? format(v) : v.toFixed(2)}</p>
                </div>
              );
            }}
          />
          <Bar dataKey={yKey} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false} maxBarSize={vertical ? 14 : 28}>
            {data.map((row, i) => {
              const v = Number(row[yKey]);
              const fill = polarity ? (v >= 0 ? "var(--pos)" : "var(--neg)") : color;
              return <Cell key={i} fill={fill} fillOpacity={0.85} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

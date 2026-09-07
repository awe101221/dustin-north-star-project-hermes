"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export function Sparkline({ data, dataKey = "v", color = "var(--series-1)", height = 28 }: { data: Array<Record<string, unknown>>; dataKey?: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

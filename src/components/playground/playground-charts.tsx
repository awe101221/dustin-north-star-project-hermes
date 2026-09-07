"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HermesLineChart } from "@/components/charts/line-chart";
import { HermesBarChart } from "@/components/charts/bar-chart";

const line = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(2026, 0, 1 + i * 4);
  return { date: d.toISOString().slice(0, 10), portfolio: 100 * Math.pow(1.004, i) * (1 + Math.sin(i / 5) * 0.02), qqq: 100 * Math.pow(1.0025, i) };
});
const bars = [
  { name: "MU", contribution: 4.2 }, { name: "HY9H", contribution: 3.9 }, { name: "RKLB", contribution: 2.6 }, { name: "NBIS", contribution: 1.4 }, { name: "LULU", contribution: -0.5 }, { name: "PDD", contribution: -0.2 },
];

export function PlaygroundCharts() {
  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card>
        <CardHeader><div><CardTitle>Line chart</CardTitle><CardDescription>Two series, fixed categorical slots, crosshair tooltip.</CardDescription></div></CardHeader>
        <CardContent><HermesLineChart data={line} series={[{ key: "portfolio", label: "Portfolio", area: true }, { key: "qqq", label: "QQQ" }]} yFormat={(v) => v.toFixed(0)} height={240} /></CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Bar chart</CardTitle><CardDescription>Polarity coloring, rounded data ends, per-bar tooltip.</CardDescription></div></CardHeader>
        <CardContent><HermesBarChart data={bars} xKey="name" yKey="contribution" format={(v) => `${v.toFixed(1)}pp`} height={240} /></CardContent>
      </Card>
    </section>
  );
}

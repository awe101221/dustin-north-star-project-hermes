import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat, BarRow, KV } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Kbd, Skeleton } from "@/components/ui/misc";
import { PlaygroundCharts } from "@/components/playground/playground-charts";

export const metadata: Metadata = { title: "Playground" };

/**
 * Component playground — the Storybook stand-in. Every primitive rendered on
 * one page with the real tokens so design changes can be reviewed at a glance.
 * Add a section here whenever you add a primitive to src/components/ui.
 */
export default function PlaygroundPage() {
  return (
    <>
      <PageHeader eyebrow="DevEx" title="Component playground" description="Design tokens and primitives in situ. Swap in Storybook later if you want isolated stories; this page is the zero-dependency version." />
      <div className="space-y-6">
        <section>
          <p className="eyebrow mb-2">Buttons</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button><Button variant="link">Link</Button><Button size="sm">Small</Button><Button size="xs">XS</Button>
          </div>
        </section>
        <section>
          <p className="eyebrow mb-2">Badges</p>
          <div className="flex flex-wrap gap-2">{(["default", "outline", "gold", "cyan", "pos", "neg", "warn", "info", "muted"] as const).map((v) => <Badge key={v} variant={v}>{v}</Badge>)}</div>
        </section>
        <section>
          <p className="eyebrow mb-2">Stats</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="NAV" value="$3,812,208" caption="cash $104.9K" sensitive size="lg" />
            <Stat label="YTD TWR" value="41.6%" caption="QQQ 15.1%" tone="gold" size="lg" />
            <Stat label="YTD alpha" value="+26.5pp" delta={1} deltaLabel="vs QQQ" size="lg" />
            <Stat label="Drawdown" value="-8.2%" tone="neg" size="lg" />
          </div>
        </section>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><div><CardTitle>Card with rows</CardTitle><CardDescription>KV + BarRow primitives</CardDescription></div></CardHeader>
            <CardContent>
              <KV k="Expected IRR" v="19.6%" /><KV k="Downside" v={<span className="text-neg">-40.9%</span>} /><KV k="Sensitive" v="$183,313" sensitive />
              <div className="mt-3"><BarRow label="Technology · 41" value={0.42} max={0.42} display="42.0%" /><BarRow label="Communication Services · 12" value={0.16} max={0.42} display="16.0%" color="var(--series-2)" /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Inputs</CardTitle><CardDescription>Dense form controls</CardDescription></div></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Input" /><Select><option>Select</option></Select><Textarea placeholder="Textarea" />
              <p className="text-[12px] text-muted">Keys: <Kbd>⌘K</Kbd> <Kbd>g</Kbd><Kbd>p</Kbd> <Kbd>\</Kbd></p>
              <Skeleton className="h-6 w-40" />
            </CardContent>
          </Card>
        </section>
        <PlaygroundCharts />
      </div>
    </>
  );
}

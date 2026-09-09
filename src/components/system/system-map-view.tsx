import Link from "next/link";
import { ArrowDown, ArrowRight, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { SYSTEM_COMPONENTS, SYSTEM_CONNECTIONS, type RealityStatus, type SystemComponent, type SystemLayer } from "@/lib/system-map";
import type { DatabaseReality } from "@/lib/db/underwriting";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, SectionHeading } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";

const LAYERS: Array<{ id: SystemLayer; label: string; detail: string }> = [
  { id: "interface", label: "Interfaces", detail: "Where Dustin sees and steers the system" },
  { id: "orchestration", label: "Orchestration", detail: "How work is decomposed and scheduled" },
  { id: "agent", label: "Specialist lanes", detail: "Decision-specific analytical roles" },
  { id: "tool", label: "Tools and source adapters", detail: "External evidence, market context, and QA" },
  { id: "structure", label: "Durable structures", detail: "Versioned outputs that survive a chat window" },
  { id: "database", label: "Database", detail: "The source of truth and access boundary" },
  { id: "delivery", label: "Delivery", detail: "Tests, deployment, and production verification" },
];

const statusTone: Record<RealityStatus, "pos" | "cyan" | "warn"> = { live: "pos", available: "cyan", planned: "warn" };

export function SystemMapView({ database }: { database: DatabaseReality[] }) {
  const live = SYSTEM_COMPONENTS.filter((item) => item.status === "live").length;
  const available = SYSTEM_COMPONENTS.filter((item) => item.status === "available").length;
  const planned = SYSTEM_COMPONENTS.filter((item) => item.status === "planned").length;
  const readableTables = database.filter((item) => item.readable).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Live components" value={live} tone="pos" caption="operating now" />
        <Stat label="Available lanes" value={available} tone="cyan" caption="invoked when needed" />
        <Stat label="Planned" value={planned} tone="flat" caption="shown, never implied live" />
        <Stat label="Readable DB surfaces" value={`${readableTables}/${database.length}`} tone={readableTables === database.length ? "pos" : "flat"} caption="production readback" />
      </div>

      <Card className="overflow-hidden border-gold/25">
        <CardHeader className="border-b border-border bg-gold-soft/15">
          <div><CardTitle>Closed decision-learning loop</CardTitle><CardDescription>The shortest accurate picture of how a request becomes a measured, revisable conclusion.</CardDescription></div>
          <Badge variant="gold">Beat QQQ over 10 years</Badge>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            <LoopStep number="01" title="Dustin steers" detail="Telegram request, constraint, or approval" />
            <LoopArrow />
            <LoopStep number="02" title="Hermes orchestrates" detail="Chooses specialist agents and real tools" />
            <LoopArrow />
            <LoopStep number="03" title="System persists" detail="Validated outputs, graph, forecasts, provenance" />
            <LoopArrow />
            <LoopStep number="04" title="North Star displays" detail="10 + 10, models, evidence, QQQ alternative" />
            <LoopArrow />
            <LoopStep number="05" title="Outcomes improve it" detail="Error, calibration, alpha, prompt/model revision" />
          </div>
        </CardContent>
      </Card>

      <div>
        <SectionHeading eyebrow="System reality" title="Everything in the operating model" aside="Live ≠ always-on" />
        <div className="space-y-3">
          {LAYERS.map((layer, layerIndex) => (
            <div key={layer.id}>
              <div className="panel p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2.5">
                  <div><p className="eyebrow">Layer {String(layerIndex + 1).padStart(2, "0")}</p><h2 className="mt-1 text-[14px] font-semibold">{layer.label}</h2></div>
                  <p className="text-[11px] text-muted">{layer.detail}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {SYSTEM_COMPONENTS.filter((component) => component.layer === layer.id).map((component) => <ComponentCard key={component.id} component={component} />)}
                </div>
              </div>
              {layerIndex < LAYERS.length - 1 ? <div className="flex h-7 items-center justify-center text-muted-2"><ArrowDown className="size-4" /></div> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader><div><CardTitle>Database reality</CardTitle><CardDescription>Live count readback. An unavailable row is shown as unavailable rather than assumed empty.</CardDescription></div><Database className="size-4 text-violet-400" /></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {database.map((row) => (
              <div key={row.table} className="panel-2 flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0"><p className="text-[12px] font-medium">{row.label}</p><p className="num truncate text-[10.5px] text-muted">{row.table}</p></div>
                <Badge variant={row.readable ? "pos" : "warn"}>{row.readable ? row.count ?? 0 : "unavailable"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Truth and control boundaries</CardTitle><CardDescription>What the architecture deliberately refuses to blur.</CardDescription></div><ShieldCheck className="size-4 text-pos" /></CardHeader>
          <CardContent className="space-y-2 text-[11.5px] leading-4 text-foreground-secondary">
            {[
              "LLMs propose and synthesize; deterministic code performs financial math.",
              "Primary evidence is preferred; secondary market feeds retain explicit caveats.",
              "Old Awe Capital, AI Stack, and Obsidian are source systems—not this product's identity.",
              "Publishable-key reads and service-role writes are separated by RLS and validated routes.",
              "No broker order path exists. Research and portfolio context never become autonomous trading.",
              "Planned components remain visibly planned until an executed and verified workflow exists.",
            ].map((item) => <p key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-pos" /><span>{item}</span></p>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><div><CardTitle>Connection ledger</CardTitle><CardDescription>The labeled flows behind the diagram. This keeps attractive boxes from implying integrations that do not exist.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {SYSTEM_CONNECTIONS.map((connection) => (
            <div key={`${connection.from}-${connection.to}-${connection.label}`} className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[10.5px]">
              <span className="num text-foreground-secondary">{connection.from}</span><ArrowRight className="size-3 shrink-0 text-muted-2" /><span className="num text-foreground-secondary">{connection.to}</span><span className="ml-auto text-right text-muted">{connection.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ComponentCard({ component }: { component: SystemComponent }) {
  const content = <><div className="flex items-center justify-between gap-2"><p className="text-[12.5px] font-semibold">{component.name}</p><Badge variant={statusTone[component.status]}>{component.status}</Badge></div><p className="mt-1 text-[11px] font-medium text-foreground-secondary">{component.role}</p><p className="mt-1.5 text-[11px] leading-4 text-muted">{component.reality}</p>{component.technology ? <p className="num mt-2 text-[10px] text-muted-2">{component.technology}</p> : null}</>;
  return component.href ? <Link href={component.href} className="panel-2 block p-3 transition-colors hover:border-border-strong">{content}</Link> : <div className="panel-2 p-3">{content}</div>;
}

function LoopStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="rounded-md border border-gold/25 bg-surface-2 p-3"><p className="num text-[10px] text-gold">{number}</p><p className="mt-1 text-[12.5px] font-semibold">{title}</p><p className="mt-1 text-[11px] leading-4 text-muted">{detail}</p></div>;
}

function LoopArrow() {
  return <div className="flex items-center justify-center text-gold/60"><ArrowRight className="hidden size-4 lg:block" /><ArrowDown className="size-4 lg:hidden" /></div>;
}

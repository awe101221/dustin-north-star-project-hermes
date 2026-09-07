"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { KanbanSquare, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Memo } from "@/lib/db/research";
import { fmtDate, fmtMultiple, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge, toneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/markdown";
import { KV } from "@/components/ui/stat";
import { TickerLink, PersonaChip, personaLabel } from "@/components/ticker-link";

type HistoryRow = { id: string; verdict: string; status: string; sourceSystem: string | null; price: number | null; expectedIrr: number | null; pwv: number | null; analyzedAt: string | null };

function JsonList({ items, primary, secondary }: { items: Array<Record<string, unknown>>; primary: string[]; secondary?: string[] }) {
  if (items.length === 0) return <p className="text-[12px] text-muted">None recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const main = primary.map((k) => item[k]).find((v) => typeof v === "string" && v) as string | undefined;
        const rest = Object.entries(item).filter(([k, v]) => !primary.includes(k) && v !== null && v !== "" && typeof v !== "object");
        return (
          <li key={i} className="panel-2 px-3 py-2 text-[12px]">
            <p className="text-foreground">{main ?? JSON.stringify(item)}</p>
            {rest.length ? (
              <p className="mt-0.5 text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                {rest
                  .filter(([k]) => !secondary || secondary.includes(k))
                  .map(([k, v]) => (
                    <span key={k}><span className="text-muted-2">{k}</span> <span className="num text-foreground-secondary">{typeof v === "number" ? (Math.abs(v) < 1 && v !== 0 ? (v * 100).toFixed(1) + "%" : v.toLocaleString()) : String(v)}</span></span>
                  ))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function MemoView({ memo, history, idea, canWrite }: { memo: Memo; history: HistoryRow[]; idea: { id: string; stage: string } | null; canWrite: boolean }) {
  const router = useRouter();
  const mos = memo.pwv !== null && memo.price ? memo.pwv / memo.price : null;
  const passed = memo.gates.filter((g) => g.status === "pass").length;
  const failed = memo.gates.filter((g) => g.status === "fail");

  const addToPipeline = useMutation({
    mutationFn: () =>
      api<{ idea: { id: string } }>("/api/hermes/ideas", {
        method: "POST",
        json: {
          ticker: memo.ticker,
          company_name: memo.companyName,
          stage: ["BUY", "BUY-MORE"].includes(memo.verdict) ? "diligence" : "sourcing",
          persona_slug: memo.persona,
          memo_id: memo.id,
          thesis: memo.thesisBullets.map((b) => b.text).join("\n"),
          falsifier: memo.risks.map((r) => r.falsifier).filter((x): x is string => typeof x === "string").join("\n") || null,
          catalyst: memo.catalysts.map((c) => c.catalyst).filter((x): x is string => typeof x === "string").join("\n") || null,
          source: "memo",
          source_ref: { memo_id: memo.id, verdict: memo.verdict },
          tags: [memo.persona, memo.verdict.toLowerCase()],
        },
      }),
    onSuccess: (res) => {
      toast.success("Added to pipeline");
      router.push(`/pipeline?idea=${res.idea.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow={`${personaLabel(memo.persona)} · ${memo.sourceSystem ?? "memo"} · ${fmtDate(memo.analyzedAt, "long")}`}
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <TickerLink ticker={memo.ticker} showExchange className="text-[20px]" />
            <span>{memo.companyName}</span>
            <Badge variant={toneFor(memo.verdict)} className="text-[12px]">{memo.verdict}</Badge>
            {memo.mathMustWork === false ? <Badge variant="neg">math_must_work = false</Badge> : null}
            {memo.status !== "complete" ? <Badge variant="warn">{memo.status}</Badge> : null}
          </span>
        }
        actions={
          <>
            {idea ? (
              <Button asChild variant="secondary" size="sm"><Link href={`/pipeline?idea=${idea.id}`}><KanbanSquare /> On pipeline · {idea.stage}</Link></Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => addToPipeline.mutate()} disabled={!canWrite || addToPipeline.isPending}><KanbanSquare /> Add to pipeline</Button>
            )}
            <Button asChild variant="secondary" size="sm"><Link href={`/research/new?ticker=${encodeURIComponent(memo.ticker)}&memo=${memo.id}&title=${encodeURIComponent(`${memo.symbol} — note on ${personaLabel(memo.persona)} memo`)}`}><PenLine /> Note</Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-5">
        {[
          ["Price at memo", fmtPrice(memo.price)],
          ["Buy ≤", fmtPrice(memo.buyPrice)],
          ["Re-underwrite trigger", fmtPrice(memo.triggerPrice)],
          ["PWV (PV)", fmtPrice(memo.pwv)],
          ["Expected IRR", fmtPct(memo.expectedIrr)],
          ["Downside", fmtPct(memo.downside, 0)],
          ["Margin of safety", fmtMultiple(mos, 2)],
          ["Gates", `${passed}/${memo.gates.length} pass`],
        ].map(([k, v]) => (
          <div key={k} className="panel px-3 py-2">
            <p className="eyebrow">{k}</p>
            <p className={cn("num text-[15px] font-semibold mt-1", k === "Expected IRR" && (memo.expectedIrr ?? 0) >= 0.15 ? "text-pos" : k === "Downside" ? "text-neg" : "text-foreground")}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-4 min-w-0">
          {memo.thesisBullets.length ? (
            <Card>
              <CardHeader><CardTitle>Thesis</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {memo.thesisBullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px]">
                      {b.type ? <Badge variant={b.type === "FACT" ? "cyan" : b.type === "INFERENCE" ? "warn" : "gold"}>{b.type}</Badge> : null}
                      <span className="text-foreground-secondary">{b.text}{b.source ? <span className="text-muted-2"> — {b.source}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Tabs defaultValue="memo">
            <TabsList>
              <TabsTrigger value="memo">Memo</TabsTrigger>
              <TabsTrigger value="valuation">Valuation</TabsTrigger>
              <TabsTrigger value="gates">Gates · {memo.gates.length}</TabsTrigger>
              <TabsTrigger value="structure">KPIs · Catalysts · Risks · Plan</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
            </TabsList>
            <TabsContent value="memo">
              <div className="panel p-6"><Markdown>{memo.markdown}</Markdown></div>
            </TabsContent>
            <TabsContent value="valuation">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Scenarios</CardTitle>
                    <CardDescription>Chassis: {String(memo.valuation.chassis ?? "—")} · discount rate {fmtPct(typeof memo.valuation.discount_rate === "number" ? memo.valuation.discount_rate : null)} · horizon {memo.horizonYears ?? 5}y</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {memo.scenarios.length ? (
                    <table className="w-full text-[12px]">
                      <thead><tr className="text-left"><th className="eyebrow py-1">Case</th><th className="eyebrow py-1 text-right">Prob</th><th className="eyebrow py-1 text-right">5y IRR</th><th className="eyebrow py-1 text-right">Y5 price</th><th className="eyebrow py-1 text-right">IV / share (PV)</th><th className="eyebrow py-1">Narrative</th></tr></thead>
                      <tbody>
                        {memo.scenarios.map((s) => (
                          <tr key={s.name} className="border-t border-border align-top">
                            <td className="py-1.5 capitalize font-medium">{s.name}</td>
                            <td className="py-1.5 text-right num">{fmtPct(s.probability, 0)}</td>
                            <td className={cn("py-1.5 text-right num", (s.irr ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPct(s.irr)}</td>
                            <td className="py-1.5 text-right num">{fmtPrice(s.y5Price)}</td>
                            <td className="py-1.5 text-right num">{fmtPrice(s.iv)}</td>
                            <td className="py-1.5 text-muted pl-3 max-w-[420px]">{s.narrative}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-[12px] text-muted">No scenario block stored.</p>}
                  <details className="mt-4">
                    <summary className="cursor-pointer text-[12px] text-cyan">Raw valuation JSON</summary>
                    <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-surface-2 p-3 text-[11px] num">{JSON.stringify(memo.valuation, null, 2)}</pre>
                  </details>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="gates">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {memo.gates.map((g) => (
                  <div key={g.slug} className={cn("panel-2 px-3 py-2 border-l-2", g.status === "pass" ? "border-l-pos" : g.status === "fail" ? "border-l-neg" : "border-l-muted-2")}>
                    <div className="flex items-center gap-2">
                      <span className="num text-[12px] font-semibold uppercase">{g.slug.replace("gate_", "Gate ")}</span>
                      <Badge variant={g.status === "pass" ? "pos" : g.status === "fail" ? "neg" : "muted"}>{g.status}</Badge>
                      {g.value !== null ? <span className="num text-[11px] text-muted ml-auto">{typeof g.value === "number" ? fmtNum(g.value, 3) : g.value}</span> : null}
                    </div>
                    {g.evidence ? <p className="mt-1 text-[11.5px] text-foreground-secondary">{g.evidence}</p> : null}
                    {g.sourcePath ? <p className="mt-0.5 text-[10.5px] text-muted-2 num">{g.sourcePath}{g.checkedBy ? ` · ${g.checkedBy}` : ""}</p> : null}
                  </div>
                ))}
                {memo.gates.length === 0 ? <p className="text-[12px] text-muted">No gates recorded on this memo.</p> : null}
              </div>
            </TabsContent>
            <TabsContent value="structure">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card><CardHeader><CardTitle>KPIs</CardTitle></CardHeader><CardContent><JsonList items={memo.kpis} primary={["metric", "kpi", "name"]} /></CardContent></Card>
                <Card><CardHeader><CardTitle>Catalysts</CardTitle></CardHeader><CardContent><JsonList items={memo.catalysts} primary={["catalyst", "event", "text"]} /></CardContent></Card>
                <Card><CardHeader><CardTitle>Risks & falsifiers</CardTitle></CardHeader><CardContent><JsonList items={memo.risks} primary={["risk", "text"]} /></CardContent></Card>
                <Card><CardHeader><CardTitle>Action plan</CardTitle></CardHeader><CardContent><JsonList items={memo.actionPlan} primary={["action", "step", "text"]} /></CardContent></Card>
              </div>
            </TabsContent>
            <TabsContent value="sources">
              <Card>
                <CardContent className="pt-4">
                  <ul className="space-y-1 text-[12px]">
                    {memo.dataSources.map((s, i) => (
                      <li key={i} className="flex flex-wrap gap-x-3 text-foreground-secondary">
                        <Badge variant="muted">{String(s.type ?? "source")}</Badge>
                        {typeof s.ref === "string" ? <span className="num">{s.ref}</span> : null}
                        {typeof s.endpoint === "string" ? <span className="num">{s.endpoint}</span> : null}
                        {typeof s.url === "string" ? <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan truncate max-w-[520px]">{s.url}</a> : null}
                        {typeof s.form === "string" ? <span>{s.form} · {String(s.filing_date ?? "")}</span> : null}
                      </li>
                    ))}
                    {memo.dataSources.length === 0 ? <li className="text-muted">No data sources recorded.</li> : null}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-gold" /> Summary</CardTitle></CardHeader>
            <CardContent>
              <KV k="Persona" v={<PersonaChip slug={memo.persona} />} />
              <KV k="Source system" v={memo.sourceSystem ?? "—"} />
              <KV k="Analyzed" v={fmtDate(memo.analyzedAt, "long")} />
              <KV k="Sector" v={String(memo.companyMetadata.sector ?? "—")} />
              <KV k="Industry" v={String(memo.companyMetadata.industry ?? "—")} />
              <KV k="Country" v={String(memo.companyMetadata.country ?? "—")} />
              <KV k="Differentiation" v={fmtNum(memo.differentiation, 1)} />
              {failed.length ? <KV k="Failed gates" v={<span className="text-neg">{failed.map((g) => g.slug.replace("gate_", "")).join(", ").toUpperCase()}</span>} /> : null}
            </CardContent>
          </Card>
          {Object.keys(memo.positionContext).length ? (
            <Card>
              <CardHeader><CardTitle>Position context</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(memo.positionContext).map(([k, v]) => <KV key={k} k={k.replace(/_/g, " ")} v={String(v)} />)}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Memo history · {personaLabel(memo.persona)}</CardTitle></CardHeader>
            <CardContent>
              {history.map((h) => (
                <Link key={h.id} href={`/research/${h.id}`} className={cn("flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[11.5px] hover:text-foreground", h.id === memo.id ? "text-foreground" : "text-muted")}>
                  <span className="num w-[58px]">{fmtDate(h.analyzedAt)}</span>
                  <Badge variant={toneFor(h.verdict)}>{h.verdict}</Badge>
                  <span className="num">{fmtPrice(h.price)}</span>
                  <span className="num ml-auto">{fmtPct(h.expectedIrr)}</span>
                  {h.status !== "complete" ? <Badge variant="muted">{h.status}</Badge> : null}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

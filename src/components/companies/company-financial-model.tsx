import { AlertTriangle, ArrowUpRight, BarChart3, Gauge, ShieldAlert, Telescope } from "lucide-react";
import type { RankedBestIdea } from "@/lib/best-ideas";
import { buildForecastRows, type CompanyFinancialModel, type CompanyModelScenario } from "@/lib/company-models";
import { fmtDateTime, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";

function scenarioTone(name: CompanyModelScenario["name"]) {
  return name === "Bear" ? "text-neg" : name === "Bull" ? "text-pos" : "text-cyan";
}

function ModelList({ title, icon, items, tone }: { title: string; icon: React.ReactNode; items: string[]; tone: "gold" | "neg" | "cyan" }) {
  return (
    <div className="panel-2 p-3.5">
      <p className={cn("mb-2 flex items-center gap-1.5 text-[12px] font-semibold", tone === "gold" ? "text-gold" : tone === "neg" ? "text-neg" : "text-cyan")}>
        {icon}{title}
      </p>
      <ul className="space-y-2 text-[12px] leading-4.5 text-foreground-secondary">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-50" /> <span>{item}</span></li>)}
      </ul>
    </div>
  );
}

export function CompanyFinancialModelView({ model, rankedIdea, formerSelection = false }: { model: CompanyFinancialModel; rankedIdea: RankedBestIdea | null; formerSelection?: boolean }) {
  const baseRows = buildForecastRows(model, "Base");
  const base = model.scenarios.find((scenario) => scenario.name === "Base")!;
  const excess = model.probabilityWeightedReturn - model.qqqHurdle;
  return (
    <Card className="overflow-hidden border-gold/30">
      <CardHeader className="flex-col gap-3 border-b border-border bg-gold-soft/25 sm:flex-row">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {rankedIdea ? <Badge variant={formerSelection ? "outline" : "gold"}>{formerSelection ? "Former " : ""}{rankedIdea.lane === "top-ten" ? `Top 10 · #${rankedIdea.rank}` : `Watchlist · #${rankedIdea.rank}`}</Badge> : <Badge variant="outline">Company model · no current rank</Badge>}
            {rankedIdea && !formerSelection ? <Badge variant={rankedIdea.qqqLine === "above" ? "pos" : "warn"}>{rankedIdea.qqqLine === "above" ? "Above QQQ line" : "QQQ better by default"}</Badge> : <Badge variant="muted">QQQ case needs a fresh ranked review</Badge>}
            <Badge variant="outline">5-year model</Badge>
          </div>
          <CardTitle className="text-[15px]">Forward financial model</CardTitle>
          <CardDescription className="mt-1 max-w-3xl">Bear, base, and bull assumptions tied to an explicit 12% QQQ hurdle. Scenario returns are research estimates, not targets or trade instructions.</CardDescription>
        </div>
        <div className="sm:ml-auto sm:text-right">
          <p className="eyebrow">Model refreshed</p>
          <p className="num mt-1 text-[11.5px] text-foreground-secondary">{fmtDateTime(model.asOf)}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Reference price" value={fmtPrice(model.baseline.currentPrice, model.baseline.currency)} caption="model snapshot, not live quote" />
          <Stat label="Probability-weighted IRR" value={fmtPct(model.probabilityWeightedReturn, 1)} tone={model.probabilityWeightedReturn >= model.qqqHurdle ? "gold" : "flat"} caption={`${fmtPct(excess, 1, { sign: true })} vs hurdle`} />
          <Stat label="QQQ hurdle" value={fmtPct(model.qqqHurdle, 0)} tone="cyan" caption="annualized 5-year line" />
          <Stat label="Base implied price" value={fmtPrice(base.targetPrice, model.baseline.currency)} caption={`${fmtPct(base.annualizedReturn, 1)} annualized`} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {model.scenarios.map((scenario) => (
            <div key={scenario.name} className="panel-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={cn("text-[13px] font-semibold", scenarioTone(scenario.name))}>{scenario.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{fmtPct(scenario.probability, 0)} probability</p>
                </div>
                <div className="text-right">
                  <p className={cn("num text-[18px] font-semibold", scenarioTone(scenario.name))}>{fmtPct(scenario.annualizedReturn, 1)}</p>
                  <p className="text-[10.5px] text-muted">annualized return</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-y border-border py-2.5 text-center">
                <div><p className="eyebrow">Revenue</p><p className="num mt-1 text-[12px]">{fmtPct(scenario.revenueCagr, 0)}</p><p className="text-[10px] text-muted">CAGR</p></div>
                <div><p className="eyebrow">Y5 margin</p><p className="num mt-1 text-[12px]">{fmtPct(scenario.targetMargin, 0)}</p><p className="text-[10px] text-muted">target</p></div>
                <div><p className="eyebrow">Exit</p><p className="num mt-1 text-[12px]">{scenario.exitMultiple.toFixed(1)}x</p><p className="truncate text-[10px] text-muted" title={scenario.exitMultipleLabel}>{scenario.exitMultipleLabel}</p></div>
              </div>
              <p className="mt-3 text-[12px] leading-4.5 text-foreground-secondary">{scenario.narrative}</p>
              <p className="num mt-3 text-[11px] text-muted">Implied year-5 price {fmtPrice(scenario.targetPrice, model.baseline.currency)}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_.75fr]">
          <div className="panel-2 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3.5 py-3">
              <div><p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground"><BarChart3 className="size-3.5 text-gold" /> Base-case operating build</p><p className="mt-0.5 text-[11px] text-muted">Indexed revenue avoids ADR and reporting-currency mismatches. Year 0 = 100.</p></div>
              <Badge variant="cyan">{model.metric}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[11.5px]">
                <thead><tr className="text-left text-muted"><th className="px-3.5 py-2 font-medium">Metric</th>{baseRows.map((row) => <th key={row.year} className="px-3 py-2 text-right font-medium">{row.year === 0 ? "Now" : `Y${row.year}`}</th>)}</tr></thead>
                <tbody className="num">
                  <tr className="border-t border-border"><td className="px-3.5 py-2 text-foreground-secondary">Revenue index</td>{baseRows.map((row) => <td key={row.year} className="px-3 py-2 text-right">{row.revenueIndex.toFixed(1)}</td>)}</tr>
                  <tr className="border-t border-border"><td className="px-3.5 py-2 text-foreground-secondary">Margin</td>{baseRows.map((row) => <td key={row.year} className="px-3 py-2 text-right">{fmtPct(row.margin, 1)}</td>)}</tr>
                  <tr className="border-t border-border"><td className="px-3.5 py-2 text-foreground-secondary">Operating-profit units</td>{baseRows.map((row) => <td key={row.year} className="px-3 py-2 text-right">{row.operatingProfitUnits.toFixed(1)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel-2 p-3.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground"><Gauge className="size-3.5 text-cyan" /> Starting point</p>
            <dl className="mt-3 space-y-2 text-[11.5px]">
              <div className="flex justify-between gap-3"><dt className="text-muted">1-year revenue growth</dt><dd className="num">{fmtPct(model.baseline.revenueGrowth1y, 1)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">3-year revenue CAGR</dt><dd className="num">{fmtPct(model.baseline.revenueCagr3y, 1)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Starting margin</dt><dd className="num">{fmtPct(model.baseline.startingMargin, 1)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Starting valuation</dt><dd className="num text-right">{model.baseline.valuationMultiple.toFixed(1)}x {model.baseline.valuationLabel}</dd></div>
            </dl>
            <p className="mt-3 border-t border-border pt-3 text-[11px] leading-4 text-muted">{model.sourceLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ModelList title="What drives upside" icon={<ArrowUpRight className="size-3.5" />} items={model.drivers} tone="gold" />
          <ModelList title="What can break" icon={<ShieldAlert className="size-3.5" />} items={model.risks} tone="neg" />
          <ModelList title="What Hermes monitors" icon={<Telescope className="size-3.5" />} items={model.monitoring} tone="cyan" />
        </div>

        <div className="rounded-md border border-warn/25 bg-warn-soft/35 p-3 text-[11px] leading-4 text-foreground-secondary">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-warn"><AlertTriangle className="size-3.5" /> Model limits and data quality</p>
          <p>{model.dataQuality}</p>
          <p className="mt-2 text-muted">{model.methodology}</p>
        </div>
      </CardContent>
    </Card>
  );
}

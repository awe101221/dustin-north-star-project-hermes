"use client";

import type { Sleeve } from "@/lib/db/portfolio";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneFor } from "@/components/ui/badge";
import { TickerLink } from "@/components/ticker-link";

export function SleevesPanel({ sleeves }: { sleeves: Sleeve[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sleeves</CardTitle>
          <CardDescription>Separately measured books. Hermes proposes; Dustin approves every trade.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sleeves.length === 0 ? <p className="text-[12px] text-muted">No sleeves defined.</p> : null}
        {sleeves.map((s) => {
          const nav = s.latestNav;
          const cashW = nav && nav.nav > 0 && nav.cash !== null ? nav.cash / nav.nav : null;
          return (
            <div key={s.id} className="panel-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{s.name}</p>
                  <p className="text-[11px] text-muted">
                    {s.manager} · authority {s.tradeAuthority} · since {fmtDate(s.inceptionDate)} · vs {s.benchmark}
                  </p>
                </div>
                <Badge variant={s.status === "active" ? "pos" : "warn"}>{s.status?.replace(/_/g, " ")}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                <div><p className="eyebrow">NAV</p><p className="num text-foreground mt-0.5 sensitive">{fmtMoney(nav?.nav ?? s.startingCapital)}</p></div>
                <div><p className="eyebrow">Cash</p><p className="num text-foreground mt-0.5">{fmtPct(cashW, 0)}</p></div>
                <div><p className="eyebrow">Active vs {s.benchmark}</p><p className={cn("num mt-0.5", (nav?.activeReturn ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtPct(nav?.activeReturn ?? 0, 2, { sign: true })}</p></div>
              </div>
              {s.recommendations.length ? (
                <div className="mt-3">
                  <p className="eyebrow mb-1">Proposed allocation · {fmtDate(s.recommendations[0]?.asOf)}</p>
                  {s.recommendations.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 py-1 hairline-b last:border-b-0 text-[12px]">
                      <span className="num text-muted w-4">{r.rank}</span>
                      {r.assetClass === "CASH" ? <span className="num font-semibold">CASH</span> : <TickerLink ticker={r.symbol} />}
                      <span className="text-muted truncate flex-1">{r.companyName}</span>
                      <Badge variant={toneFor(r.action)}>{r.action.replace(/_/g, " ")}</Badge>
                      <span className="num">{fmtPct(r.targetWeight, 0)}</span>
                      <Badge variant={r.approvalStatus === "approved" ? "pos" : "warn"}>{r.approvalStatus.replace(/_/g, " ").replace("dustin ", "")}</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

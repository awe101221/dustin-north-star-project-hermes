"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, queryKeys } from "@/lib/api";
import { getBrowserClient } from "@/lib/supabase/public";
import { getTrades, type Trade } from "@/lib/db/portfolio";
import { fmtDate, fmtMoney, fmtNum, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { useShellConfig } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, toneFor } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TickerLink } from "@/components/ticker-link";

export function TradeLog({ initial, symbol }: { initial: Trade[]; symbol?: string }) {
  const config = useShellConfig();
  const queryClient = useQueryClient();
  const trades = useQuery({
    queryKey: [...queryKeys.trades, symbol ?? "all"],
    queryFn: async () => {
      const client = getBrowserClient();
      if (!client) return initial;
      return getTrades(client, { limit: 100, symbol });
    },
    initialData: initial,
  });
  useRealtime(["hermes_trades"], [queryKeys.trades]);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/hermes/trades/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Trade removed");
      void queryClient.invalidateQueries({ queryKey: queryKeys.trades });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = trades.data ?? initial;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Trade log</CardTitle>
          <CardDescription>Explicit executions with rationale. Imported broker executions are tagged by source.</CardDescription>
        </div>
        <NewTradeDialog defaultSymbol={symbol} disabled={!config.write} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-[12px] text-muted">No trades logged yet. Press the button, or run <code className="num">npm run migrate:trades</code> to import broker history.</p> : null}
        <div className="max-h-80 overflow-y-auto pr-1">
          {rows.map((t) => (
            <div key={t.id} className="group flex items-center gap-2 py-1.5 hairline-b last:border-b-0 text-[12px]">
              <span className="num text-muted w-[54px]">{fmtDate(t.tradeDate)}</span>
              <Badge variant={toneFor(t.side)}>{t.side}</Badge>
              <TickerLink ticker={t.ticker ?? t.symbol} />
              <span className="num text-foreground-secondary sensitive">{fmtNum(t.quantity, 0)} @ {fmtPrice(t.price, t.currency)}</span>
              {t.assetType !== "stock" ? <Badge variant="muted">{t.assetType}</Badge> : null}
              <span className="text-muted truncate flex-1">{t.rationale}</span>
              {t.realizedPnl !== null ? <span className={cn("num sensitive", t.realizedPnl >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(t.realizedPnl)}</span> : null}
              {config.write ? (
                <button type="button" onClick={() => remove.mutate(t.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-neg" title="Delete">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NewTradeDialog({ defaultSymbol, disabled }: { defaultSymbol?: string; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    symbol: defaultSymbol ?? "",
    side: "BUY",
    asset_type: "stock",
    quantity: "",
    price: "",
    currency: "USD",
    trade_time: new Date().toISOString().slice(0, 16),
    sleeve_id: "ibkr-core",
    rationale: "",
  });
  const create = useMutation({
    mutationFn: () =>
      api("/api/hermes/trades", {
        method: "POST",
        json: {
          symbol: form.symbol,
          side: form.side,
          asset_type: form.asset_type,
          quantity: form.quantity ? Number(form.quantity) : null,
          price: form.price ? Number(form.price) : null,
          currency: form.currency,
          trade_time: new Date(form.trade_time).toISOString(),
          sleeve_id: form.sleeve_id,
          rationale: form.rationale || null,
        },
      }),
    onSuccess: () => {
      toast.success("Trade logged");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trades });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? "Writes need SUPABASE_SERVICE_ROLE_KEY" : undefined}>
        <Plus /> Log trade
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a trade</DialogTitle>
          <DialogDescription>Recorded in hermes_trades. This is a journal entry, not an order.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Symbol</Label><Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} placeholder="MU" /></div>
          <div><Label>Side</Label><Select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} className="w-full">{["BUY", "SELL", "SHORT", "COVER", "ASSIGN", "EXERCISE", "EXPIRE", "DIVIDEND", "OTHER"].map((s) => <option key={s}>{s}</option>)}</Select></div>
          <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div><Label>Price</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div><Label>Asset</Label><Select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })} className="w-full">{["stock", "option", "etf", "cash", "bond", "fx", "other"].map((s) => <option key={s}>{s}</option>)}</Select></div>
          <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
          <div><Label>Time</Label><Input type="datetime-local" value={form.trade_time} onChange={(e) => setForm({ ...form, trade_time: e.target.value })} /></div>
          <div><Label>Sleeve</Label><Input value={form.sleeve_id} onChange={(e) => setForm({ ...form, sleeve_id: e.target.value })} /></div>
          <div className="col-span-2"><Label>Rationale</Label><Textarea value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} placeholder="Why now, what thesis, what would make you wrong." /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.symbol || create.isPending}>{create.isPending ? "Saving…" : "Save trade"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

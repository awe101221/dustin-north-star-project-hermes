"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PresentationToggle } from "@/components/shell/presentation-toggle";

export function SettingsActions({ gate }: { gate: boolean }) {
  const router = useRouter();
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<{ db: { ok: boolean; latencyMs: number | null; error?: string } }>("/api/health"), refetchInterval: 30_000 });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-muted">DB round trip:</span>
        {health.data ? <span className={health.data.db.ok ? "text-pos num" : "text-neg num"}>{health.data.db.ok ? `${health.data.db.latencyMs} ms` : health.data.db.error ?? "failed"}</span> : <span className="text-muted">…</span>}
        <Button size="xs" variant="ghost" onClick={() => health.refetch()}><RefreshCw /> check</Button>
      </div>
      <div className="max-w-xs"><PresentationToggle /></div>
      {gate ? (
        <Button variant="secondary" size="sm" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}><LogOut /> Sign out</Button>
      ) : null}
    </div>
  );
}

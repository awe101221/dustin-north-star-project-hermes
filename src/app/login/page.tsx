"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HermesMark } from "@/components/brand/hermes-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { password } });
      router.replace(params.get("next") ?? "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel w-full max-w-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gold-soft text-gold border border-gold/30">
          <HermesMark size={16} />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-foreground">Dustin North Star Project Hermes</p>
          <p className="text-[11px] text-muted">Private PM terminal</p>
        </div>
      </div>
      <label className="eyebrow block mb-1.5" htmlFor="password">Access password</label>
      <Input id="password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      {error ? <p className="mt-2 text-[12px] text-neg">{error}</p> : null}
      <Button type="submit" className="mt-4 w-full" disabled={busy || !password}>
        {busy ? "Checking…" : "Enter"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <React.Suspense>
        <LoginForm />
      </React.Suspense>
    </div>
  );
}

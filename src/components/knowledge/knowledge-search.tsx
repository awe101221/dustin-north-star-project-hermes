"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function KnowledgeSearch({ q, category, categories, count }: { q: string; category: string; categories: string[]; count: number }) {
  const router = useRouter();
  const [value, setValue] = React.useState(q);
  function go(next: { q?: string; category?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? value;
    const nc = next.category ?? category;
    if (nq) params.set("q", nq);
    if (nc) params.set("category", nc);
    router.push(`/knowledge${params.size ? `?${params}` : ""}`);
  }
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); go({}); }}>
      <div className="relative"><Search className="absolute left-2 top-2 size-3.5 text-muted" /><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Search knowledge…" className="pl-7 w-72" /></div>
      <Select value={category} onChange={(e) => go({ category: e.target.value })}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
      <Button type="submit" variant="secondary" size="sm">Search</Button>
      <span className="ml-auto text-[11.5px] text-muted">{count} docs</span>
    </form>
  );
}

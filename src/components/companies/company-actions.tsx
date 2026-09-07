"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Bot, KanbanSquare, PenLine } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function CompanyActions({ ticker, companyName, ideaId, canWrite }: { ticker: string; companyName: string; ideaId: string | null; canWrite: boolean }) {
  const router = useRouter();
  const addIdea = useMutation({
    mutationFn: () => api<{ idea: { id: string } }>("/api/hermes/ideas", { method: "POST", json: { ticker, company_name: companyName, stage: "sourcing", source: "company_page" } }),
    onSuccess: (r) => router.push(`/pipeline?idea=${r.idea.id}`),
    onError: (e) => toast.error(e.message),
  });
  const queueUnderwrite = useMutation({
    mutationFn: () => api("/api/hermes/agent-tasks", { method: "POST", json: { task_type: "underwrite", title: `Underwrite ${ticker}`, ticker, priority: 60, instructions: `Produce a fresh underwriting memo for ${ticker} (${companyName}) through the persona of your choice; persist to analyst_memos and reference the memo id in result_ref.` } }),
    onSuccess: () => toast.success("Underwrite task queued for agents"),
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button asChild variant="secondary" size="sm"><Link href={`/research/new?ticker=${encodeURIComponent(ticker)}`}><PenLine /> Note</Link></Button>
      {ideaId ? (
        <Button asChild variant="secondary" size="sm"><Link href={`/pipeline?idea=${ideaId}`}><KanbanSquare /> Pipeline card</Link></Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => addIdea.mutate()} disabled={!canWrite || addIdea.isPending}><KanbanSquare /> Add to pipeline</Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => queueUnderwrite.mutate()} disabled={!canWrite || queueUnderwrite.isPending}><Bot /> Queue underwrite</Button>
    </>
  );
}

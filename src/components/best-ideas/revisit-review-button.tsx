"use client";

import { useMutation } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function RevisitReviewButton({ ticker, nextAction, canWrite }: { ticker: string; nextAction: string | null; canWrite: boolean }) {
  const review = useMutation({
    mutationFn: () => api("/api/hermes/agent-tasks", { method: "POST", json: {
      task_type: "reunderwrite",
      title: `Revisit ${ticker} for the 10 + 10`,
      ticker,
      priority: 60,
      instructions: `Review ${ticker}, a former Top 10 or Watchlist 10 company. Read its retained company model, prior thesis, falsifiers, and latest research. Check new filings, fundamentals, valuation and price; update the model with dated evidence and compare its QQQ-relative case with the current 10 + 10. Explain whether it merits re-entry and what still needs to improve. Persist the research and model updates and reference them in the task result. Do not promote it without a fresh ranked review. Prior research action: ${nextAction || "Refresh the thesis and test the prior falsifiers."}`,
    } }),
    onSuccess: () => toast.success(`Re-entry review queued for ${ticker}`),
    onError: (error) => toast.error(error.message),
  });
  return <Button variant="secondary" size="sm" onClick={() => review.mutate()} disabled={!canWrite || review.isPending || review.isSuccess} title={!canWrite ? "Agent task writes are not configured" : undefined}>
    <RotateCcw />{review.isSuccess ? "Review queued" : review.isPending ? "Queuing…" : "Request re-entry review"}
  </Button>;
}

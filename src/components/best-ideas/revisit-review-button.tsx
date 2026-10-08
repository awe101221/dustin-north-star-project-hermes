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
      title: `Revisit ${ticker} for the Top 50`,
      ticker,
      priority: 60,
      instructions: `Review ${ticker}, a former Top 10 or Watchlist 10 company, for the Top 50 ranking. Read its retained company model, prior thesis, falsifiers, and latest research. Check new filings, fundamentals, valuation and price. Produce a dated five-year price-only forecast using the current shared QQQ scenarios and matched stock/QQQ outcomes. Estimate its probability of beating QQQ, explain the assumptions and uncertainty, and compare with the current sleeve ranking. Persist the research and reference it in the task result. Publication requires independent Evidence & Risk review and exact-content North Star PM approval. Prior research action: ${nextAction || "Refresh the thesis and test the prior falsifiers."}`,
    } }),
    onSuccess: () => toast.success(`Re-entry review queued for ${ticker}`),
    onError: (error) => toast.error(error.message),
  });
  return <Button variant="secondary" size="sm" onClick={() => review.mutate()} disabled={!canWrite || review.isPending || review.isSuccess} title={!canWrite ? "Agent task writes are not configured" : undefined}>
    <RotateCcw />{review.isSuccess ? "Review queued" : review.isPending ? "Queuing…" : "Request re-entry review"}
  </Button>;
}

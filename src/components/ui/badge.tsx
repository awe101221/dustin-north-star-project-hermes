import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-[0.08em] leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-2 text-foreground-secondary",
        outline: "border-border-strong bg-transparent text-foreground-secondary",
        gold: "border-gold/30 bg-gold-soft text-gold",
        cyan: "border-cyan/30 bg-cyan-soft text-cyan",
        pos: "border-pos/30 bg-pos-soft text-pos",
        neg: "border-neg/30 bg-neg-soft text-neg",
        warn: "border-warn/30 bg-warn-soft text-warn",
        info: "border-info/30 bg-info-soft text-info",
        muted: "border-transparent bg-transparent text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Map a verdict / action / stage string to a badge tone. */
export function toneFor(value: string | null | undefined): BadgeProps["variant"] {
  const v = (value ?? "").toUpperCase();
  if (["BUY", "BUY-MORE", "ADD", "NEW_BUY", "LIVE", "PASS_OK", "DONE", "GOOD", "PASS"].includes(v)) return v === "PASS" ? "muted" : "pos";
  if (["SELL", "EXIT", "SHORT", "AVOID", "TRIM", "FAIL", "ERROR", "CRITICAL"].includes(v)) return "neg";
  if (["WATCH", "MONITOR", "DATA_GAP", "REVIEW", "WARN", "CLAIMED", "RUNNING"].includes(v)) return "warn";
  if (["MAINTAIN", "HOLD", "DILIGENCE", "OPEN", "QUEUED"].includes(v)) return "cyan";
  if (["SOURCING", "DRAFT"].includes(v)) return "info";
  if (["ARCHIVE", "ARCHIVED", "CANCELLED"].includes(v)) return "muted";
  return "default";
}

export { Badge, badgeVariants };

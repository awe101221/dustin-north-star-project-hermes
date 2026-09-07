import * as React from "react";
import { cn } from "@/lib/utils";
import { pnlTone } from "@/lib/format";

/**
 * Stat tile — the hero-number pattern from the data-viz method: a label, one
 * proportional figure, an optional delta with icon+label (never color alone),
 * and a caption. `sensitive` blurs the value in presentation mode.
 */
export function Stat({
  label,
  value,
  delta,
  deltaLabel,
  caption,
  tone,
  sensitive,
  className,
  size = "md",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: number | null;
  deltaLabel?: React.ReactNode;
  caption?: React.ReactNode;
  tone?: "pos" | "neg" | "flat" | "gold" | "cyan";
  sensitive?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const t = tone ?? (delta !== undefined ? pnlTone(delta) : "flat");
  return (
    <div className={cn("panel px-4 py-3 min-w-0", className)}>
      <p className="eyebrow truncate">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2 min-w-0">
        <span
          className={cn(
            "num font-semibold text-foreground truncate",
            size === "lg" ? "text-[26px] leading-7" : size === "md" ? "text-[20px] leading-6" : "text-[16px] leading-5",
            t === "gold" && "text-gold",
            t === "cyan" && "text-cyan",
            sensitive && "sensitive",
          )}
        >
          {value}
        </span>
        {deltaLabel !== undefined ? (
          <span
            className={cn(
              "num text-[11.5px] font-medium inline-flex items-center gap-0.5",
              t === "pos" && "text-pos",
              t === "neg" && "text-neg",
              t === "flat" && "text-muted",
              sensitive && "sensitive",
            )}
          >
            {t === "pos" ? "▲" : t === "neg" ? "▼" : ""}
            {deltaLabel}
          </span>
        ) : null}
      </div>
      {caption ? <p className="mt-1 text-[11px] text-muted truncate">{caption}</p> : null}
    </div>
  );
}

/** Inline key/value row for definition-style panels. */
export function KV({ k, v, sensitive, className }: { k: React.ReactNode; v: React.ReactNode; sensitive?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 hairline-b last:border-b-0", className)}>
      <span className="text-[11.5px] text-muted">{k}</span>
      <span className={cn("num text-[12px] text-foreground text-right", sensitive && "sensitive")}>{v}</span>
    </div>
  );
}

/** Horizontal bar with a label, for exposure breakdowns. */
export function BarRow({
  label,
  value,
  max,
  display,
  color = "var(--series-1)",
  sensitive,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  display: React.ReactNode;
  color?: string;
  sensitive?: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center py-1">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-foreground-secondary truncate">{label}</span>
        </div>
        <div className="mt-1 h-[5px] w-full rounded-[2px] bg-surface-3 overflow-hidden">
          <div className="h-full rounded-[2px]" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <span className={cn("num text-[11.5px] text-foreground w-20 text-right", sensitive && "sensitive")}>{display}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted max-w-md mx-auto">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

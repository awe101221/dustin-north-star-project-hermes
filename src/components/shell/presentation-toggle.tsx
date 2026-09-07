"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { Kbd } from "@/components/ui/misc";
import { Hint } from "@/components/ui/tooltip";

/**
 * Analyst / trade presentation toggle: one click hides every live position
 * value, NAV and P&L figure (anything marked `.sensitive`).
 */
export function PresentationToggle({ compact }: { compact?: boolean }) {
  const presentation = useUiStore((s) => s.presentation);
  const toggle = useUiStore((s) => s.togglePresentation);
  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={presentation}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
        presentation ? "bg-warn-soft text-warn" : "text-muted hover:bg-surface-2 hover:text-foreground",
        compact && "justify-center px-0",
      )}
    >
      {presentation ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      {!compact ? (
        <>
          <span className="flex-1 text-left">{presentation ? "Analyst view" : "Trade view"}</span>
          <Kbd>\</Kbd>
        </>
      ) : null}
    </button>
  );
  return compact ? <Hint label={`${presentation ? "Show" : "Hide"} live positions (\\)`} side="right">{button}</Hint> : button;
}

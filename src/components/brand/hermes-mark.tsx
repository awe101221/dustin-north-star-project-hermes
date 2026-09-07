import { cn } from "@/lib/utils";

/**
 * Hermes mark — a winged sandal reduced to a glyph: one swift stroke and two
 * feathers, drawn in the gold accent. Subtle by design; it only ever appears
 * at 16–28px.
 */
export function HermesMark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path d="M3 16.5c3.5 0 6.2-1.4 8-4.2 1.4-2.2 2.7-4 6-4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.2 12.2c-1.6-.6-3.7-.3-5.5 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.5 9.2c-1.2-.9-3-1-4.7-.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 19.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="8.3" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-gold-soft text-gold border border-gold/30">
        <HermesMark size={15} />
      </span>
      {!compact ? (
        <div className="min-w-0 leading-none">
          <p className="text-[12px] font-semibold text-foreground truncate">North Star · Hermes</p>
          <p className="text-[10px] text-muted truncate mt-[3px]">Dustin North Star Project Hermes</p>
        </div>
      ) : null}
    </div>
  );
}

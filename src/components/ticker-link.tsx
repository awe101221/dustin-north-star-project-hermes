import Link from "next/link";
import { bareSymbol, cn } from "@/lib/utils";

export function TickerLink({ ticker, className, showExchange = false, children }: { ticker: string | null | undefined; className?: string; showExchange?: boolean; children?: React.ReactNode }) {
  if (!ticker) return <span className={cn("num text-muted", className)}>—</span>;
  const label = showExchange ? ticker : bareSymbol(ticker);
  return (
    <Link href={`/companies/${encodeURIComponent(ticker)}`} className={cn("num font-semibold text-foreground hover:text-gold transition-colors", className)}>
      {children ?? label}
    </Link>
  );
}

const PERSONA_SHORT: Record<string, string> = { "brad-gerstner": "Brad", "mohnish-pabrai": "Pabrai", "public-vc": "Public VC" };

export function personaLabel(slug: string | null | undefined) {
  if (!slug) return "—";
  return PERSONA_SHORT[slug] ?? slug.replace(/-/g, " ");
}

export function PersonaChip({ slug }: { slug: string | null | undefined }) {
  if (!slug) return null;
  return (
    <Link href={`/personas/${slug}`} className="inline-flex items-center rounded-[4px] border border-border bg-surface-2 px-1.5 py-[1px] text-[10.5px] font-medium text-foreground-secondary hover:text-gold hover:border-gold/40">
      {personaLabel(slug)}
    </Link>
  );
}

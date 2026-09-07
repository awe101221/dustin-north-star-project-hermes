import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpenText,
  Bot,
  Building2,
  Compass,
  FlaskConical,
  Gauge,
  KanbanSquare,
  Library,
  Settings,
  Trophy,
  Users,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Key pressed after "g" to jump here. */
  hotkey: string;
  description: string;
};

/**
 * Primary navigation. The app is centered on Hermes's ranked conclusions first:
 * Top 10 best ideas, Watchlist 10, then the research/pipeline/tools that explain
 * or improve those rankings. Portfolio is context, not the product center.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Best Ideas", short: "Best Ideas", icon: Trophy, hotkey: "b", description: "Hermes-ranked Top 10 + Watchlist 10 for beating QQQ over 10 years" },
  { href: "/best-ideas", label: "Top 10 + Watchlist", short: "Top 10", icon: Trophy, hotkey: "t", description: "Full ranked list, QQQ case, falsifiers, and next Hermes action" },
  { href: "/research", label: "Research", short: "Research", icon: BookOpenText, hotkey: "r", description: "Hermes memos, notes, journal, and source-backed conclusions" },
  { href: "/pipeline", label: "Idea Pipeline", short: "Pipeline", icon: KanbanSquare, hotkey: "i", description: "Sourcing → Diligence → Live → Monitor → Archive" },
  { href: "/north-star", label: "North Star", short: "North Star", icon: Compass, hotkey: "n", description: "Mandate, rules, KPIs, stats vs QQQ" },
  { href: "/companies", label: "Companies", short: "Companies", icon: Building2, hotkey: "c", description: "Company dossiers that support the ranked lists" },
  { href: "/quant", label: "Quant / Alpha", short: "Quant", icon: FlaskConical, hotkey: "q", description: "Screens and backtests that can promote ideas into the ranked list" },
  { href: "/personas", label: "Analyst Personas", short: "Personas", icon: Users, hotkey: "a", description: "Agent lenses and prompts that feed Hermes rankings" },
  { href: "/knowledge", label: "Knowledge", short: "Knowledge", icon: Library, hotkey: "k", description: "Playbooks, specs, templates, and agent instructions" },
  { href: "/agents", label: "Agents & Jobs", short: "Agents", icon: Bot, hotkey: "g", description: "Agent task queue, automations, and refresh jobs" },
  { href: "/activity", label: "Activity", short: "Activity", icon: Activity, hotkey: "v", description: "Unified timeline of ranking, memo, and pipeline changes" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, hotkey: "s", description: "Connections, environment, diagnostics" },
  { href: "/portfolio", label: "Portfolio Context", short: "Portfolio", icon: Gauge, hotkey: "p", description: "Live book, exposure, P&L, trade log, and attribution context" },
];

export function navFor(pathname: string) {
  if (pathname === "/") return NAV[0];
  return NAV.slice(1).find((item) => pathname.startsWith(item.href)) ?? null;
}

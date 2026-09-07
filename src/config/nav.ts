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
 * Primary navigation. The order is the mental model of the desk: money first,
 * then the research that justifies it, then the pipeline that feeds it, then
 * the tools that sharpen it, then the mandate that governs it.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Portfolio Hub", short: "Portfolio", icon: Gauge, hotkey: "p", description: "Live exposures, P&L, sleeves, QQQ benchmark, trade log, attribution" },
  { href: "/research", label: "Research", short: "Research", icon: BookOpenText, hotkey: "r", description: "Memo stream, notes, journal, search" },
  { href: "/pipeline", label: "Idea Pipeline", short: "Pipeline", icon: KanbanSquare, hotkey: "i", description: "Sourcing → Diligence → Live → Monitor → Archive" },
  { href: "/quant", label: "Quant / Alpha", short: "Quant", icon: FlaskConical, hotkey: "q", description: "Screener, backtest lab, guru & insider flow, alt-data" },
  { href: "/north-star", label: "North Star", short: "North Star", icon: Compass, hotkey: "n", description: "Mandate, rules, KPIs, stats vs QQQ" },
  { href: "/companies", label: "Companies", short: "Companies", icon: Building2, hotkey: "c", description: "Universe, memos, filings, holders per ticker" },
  { href: "/personas", label: "Analyst Personas", short: "Personas", icon: Users, hotkey: "a", description: "Persona architecture, prompts, artifacts" },
  { href: "/knowledge", label: "Knowledge", short: "Knowledge", icon: Library, hotkey: "k", description: "Migrated playbooks, specs, templates" },
  { href: "/agents", label: "Agents & Jobs", short: "Agents", icon: Bot, hotkey: "g", description: "Agent task queue, quant jobs, automations" },
  { href: "/activity", label: "Activity", short: "Activity", icon: Activity, hotkey: "t", description: "Unified timeline of everything that changed" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, hotkey: "s", description: "Connections, environment, diagnostics" },
];

export function navFor(pathname: string) {
  if (pathname === "/") return NAV[0];
  return NAV.slice(1).find((item) => pathname.startsWith(item.href)) ?? null;
}

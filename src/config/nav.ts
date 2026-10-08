import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpenText,
  Bot,
  Brain,
  Building2,
  ChartNoAxesCombined,
  Compass,
  Cpu,
  FlaskConical,
  Gauge,
  KanbanSquare,
  Library,
  Network,
  Settings,
  Scale,
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
 * Top 50 per sleeve, then the research/pipeline/tools that explain
 * or improve those rankings. Portfolio is context, not the product center.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "North Star Top 50", short: "Top 50", icon: Trophy, hotkey: "b", description: "50 North Star companies ranked by modeled likelihood of beating QQQ over five years" },
  { href: "/challengers", label: "Challengers", short: "Challengers", icon: Scale, hotkey: "h", description: "Research candidates and historical reviewed tournaments" },
  { href: "/ai-regime", label: "AI Regime Top 50", short: "AI Top 50", icon: Cpu, hotkey: "d", description: "50 AI Regime companies ranked by modeled likelihood of beating QQQ over five years" },
  { href: "/learnings", label: "Learnings", short: "Learnings", icon: Brain, hotkey: "l", description: "Archive of Hermes investing philosophy updates that shape the ranked list" },
  { href: "/research", label: "Research", short: "Research", icon: BookOpenText, hotkey: "r", description: "Hermes memos, notes, journal, and source-backed conclusions" },
  { href: "/pipeline", label: "Idea Pipeline", short: "Pipeline", icon: KanbanSquare, hotkey: "i", description: "Sourcing → Diligence → Live → Monitor → Archive" },
  { href: "/north-star", label: "North Star", short: "North Star", icon: Compass, hotkey: "n", description: "Mandate, rules, KPIs, stats vs QQQ" },
  { href: "/companies", label: "Companies", short: "Companies", icon: Building2, hotkey: "c", description: "Company dossiers that support the ranked lists" },
  { href: "/quant", label: "Quant / Alpha", short: "Quant", icon: FlaskConical, hotkey: "q", description: "Screens and backtests that can promote ideas into the ranked list" },
  { href: "/personas", label: "Analyst Personas", short: "Personas", icon: Users, hotkey: "a", description: "Agent lenses and prompts that feed Hermes rankings" },
  { href: "/knowledge", label: "Knowledge", short: "Knowledge", icon: Library, hotkey: "k", description: "Playbooks, specs, templates, and agent instructions" },
  { href: "/agents", label: "Agents & Jobs", short: "Agents", icon: Bot, hotkey: "g", description: "Agent task queue, automations, and refresh jobs" },
  { href: "/evaluation", label: "Evaluation", short: "Evaluation", icon: ChartNoAxesCombined, hotkey: "e", description: "Forecast error, calibration, and outcomes relative to QQQ" },
  { href: "/system", label: "System Map", short: "System", icon: Network, hotkey: "m", description: "Reality map of interfaces, agents, tools, structures, databases, and delivery" },
  { href: "/activity", label: "Activity", short: "Activity", icon: Activity, hotkey: "v", description: "Unified timeline of ranking, memo, and pipeline changes" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, hotkey: "s", description: "Connections, environment, diagnostics" },
  { href: "/portfolio", label: "Portfolio Context", short: "Portfolio", icon: Gauge, hotkey: "p", description: "Live book, exposure, P&L, trade log, and attribution context" },
];

export function navFor(pathname: string) {
  if (pathname === "/" || pathname.startsWith("/best-ideas")) return NAV[0];
  return NAV.slice(1).find((item) => pathname.startsWith(item.href)) ?? null;
}

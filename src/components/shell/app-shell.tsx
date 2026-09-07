"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Command, Compass, EyeOff, Search } from "lucide-react";
import { motion } from "motion/react";
import { NAV, navFor } from "@/config/nav";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { useGlobalHotkeys } from "@/hooks/use-hotkeys";
import { Wordmark } from "@/components/brand/hermes-mark";
import { Kbd } from "@/components/ui/misc";
import { Hint } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/shell/command-palette";
import { NorthStarDrawer, NorthStarStrip } from "@/components/shell/north-star-drawer";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { PresentationToggle } from "@/components/shell/presentation-toggle";

export type ShellConfig = { read: boolean; write: boolean; gate: boolean; agent: boolean; projectRef: string };

const ShellConfigContext = React.createContext<ShellConfig>({ read: false, write: false, gate: false, agent: false, projectRef: "" });
export const useShellConfig = () => React.useContext(ShellConfigContext);

function HotkeysMount() {
  useGlobalHotkeys();
  return null;
}

const subscribeNoop = () => () => {};

export function AppShell({ children, config, bare }: { children: React.ReactNode; config: ShellConfig; bare?: boolean }) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, presentation, setPaletteOpen, setNorthStarOpen } = useUiStore();
  const active = navFor(pathname);
  // Persisted UI state only applies after hydration so server and first client render match.
  const hydrated = React.useSyncExternalStore(subscribeNoop, () => true, () => false);
  const collapsed = hydrated && sidebarCollapsed;

  if (bare) {
    return <ShellConfigContext.Provider value={config}>{children}</ShellConfigContext.Provider>;
  }

  return (
    <ShellConfigContext.Provider value={config}>
      <HotkeysMount />
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            "sticky top-0 h-dvh shrink-0 flex flex-col border-r border-border bg-surface transition-[width] duration-200",
            collapsed ? "w-[52px]" : "w-[212px]",
          )}
        >
          <div className={cn("flex items-center h-12 px-3 hairline-b", collapsed && "justify-center px-0")}>
            <Link href="/" className="min-w-0">
              <Wordmark compact={collapsed} />
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map((item) => {
              const isActive = active?.href === item.href;
              const Icon = item.icon;
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative mx-2 my-[1px] flex items-center gap-2.5 rounded-md px-2 py-[6px] text-[12.5px] transition-colors",
                    isActive ? "bg-surface-3 text-foreground" : "text-foreground-secondary hover:bg-surface-2 hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {isActive ? (
                    <motion.span layoutId="nav-active" className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-gold" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                  ) : null}
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-gold" : "text-muted group-hover:text-foreground-secondary")} />
                  {!collapsed ? (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Kbd>g{item.hotkey}</Kbd>
                      </span>
                    </>
                  ) : null}
                </Link>
              );
              return collapsed ? (
                <Hint key={item.href} label={`${item.label} · g ${item.hotkey}`} side="right">
                  {link}
                </Hint>
              ) : (
                link
              );
            })}
          </nav>

          <div className={cn("hairline-t p-2 space-y-1", collapsed && "flex flex-col items-center")}>
            <PresentationToggle compact={collapsed} />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted hover:bg-surface-2 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Search className="size-3.5" />
              {!collapsed ? (
                <>
                  <span className="flex-1 text-left">Search & commands</span>
                  <Kbd>⌘K</Kbd>
                </>
              ) : null}
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted hover:bg-surface-2 hover:text-foreground", collapsed && "justify-center px-0")}
            >
              {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
              {!collapsed ? <span className="flex-1 text-left">Collapse</span> : null}
            </button>
            {!collapsed ? (
              <div className="px-2 pt-1 flex items-center gap-1.5 text-[10.5px] text-muted-2">
                <span className={cn("inline-block size-1.5 rounded-full", config.read ? "bg-pos" : "bg-neg")} />
                {config.read ? `brain · ${config.projectRef.slice(0, 8)}` : "brain · not configured"}
                <span className={cn("ml-auto inline-block size-1.5 rounded-full", config.write ? "bg-pos" : "bg-warn")} title={config.write ? "writes enabled" : "read-only"} />
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-12 flex items-center gap-4 px-5 hairline-b bg-background/85 backdrop-blur">
            <div className="min-w-0 flex items-center gap-2">
              <span className="eyebrow">{active?.short ?? "Hermes"}</span>
              {presentation ? (
                <span className="inline-flex items-center gap-1 rounded-[4px] border border-warn/40 bg-warn-soft px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.1em] text-warn">
                  <EyeOff className="size-3" /> Presenting
                </span>
              ) : null}
            </div>
            <div className="flex-1 min-w-0 flex justify-center">
              <NorthStarStrip />
            </div>
            <div className="flex items-center gap-1">
              <Hint label="North Star (.)">
                <button type="button" onClick={() => setNorthStarOpen(true)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] text-foreground-secondary hover:bg-surface-2 hover:text-foreground">
                  <Compass className="size-3.5 text-gold" /> North Star
                </button>
              </Hint>
              <Hint label="Command palette (⌘K)">
                <button type="button" onClick={() => setPaletteOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-foreground">
                  <Command className="size-3.5" />
                </button>
              </Hint>
            </div>
          </header>
          <main className="flex-1 min-w-0 px-5 py-5 animate-fade-in">{children}</main>
        </div>
      </div>
      <CommandPalette />
      <NorthStarDrawer />
      <ShortcutsDialog />
    </ShellConfigContext.Provider>
  );
}

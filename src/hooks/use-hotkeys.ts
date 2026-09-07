"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { NAV } from "@/config/nav";
import { useUiStore } from "@/stores/ui";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Linear/Raycast-style keyboard model:
 *   ⌘K / Ctrl+K  command palette
 *   g then <key> navigate (see NAV hotkeys)
 *   \            toggle presentation mode
 *   ?            shortcut help
 *   n            new note
 *   i            new idea
 *   .            open North Star drawer
 */
export function useGlobalHotkeys() {
  const router = useRouter();
  const { setPaletteOpen, togglePresentation, setShortcutsOpen, setNorthStarOpen } = useUiStore();
  const pendingG = React.useRef<number | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();
      if (pendingG.current && now - pendingG.current < 900) {
        pendingG.current = null;
        const item = NAV.find((n) => n.hotkey === e.key.toLowerCase());
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }

      switch (e.key) {
        case "g":
          pendingG.current = now;
          return;
        case "\\":
          e.preventDefault();
          togglePresentation();
          return;
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          return;
        case ".":
          e.preventDefault();
          setNorthStarOpen(true);
          return;
        case "n":
          e.preventDefault();
          router.push("/research/new");
          return;
        case "i":
          e.preventDefault();
          router.push("/pipeline?new=1");
          return;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setPaletteOpen, togglePresentation, setShortcutsOpen, setNorthStarOpen]);
}

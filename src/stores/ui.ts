"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Global UI state. Presentation mode ("analyst view") hides every live
 * position value and dollar figure with one keystroke (\) — the toggle is
 * persisted so a screen-share stays safe across reloads.
 */
type UiState = {
  presentation: boolean;
  paletteOpen: boolean;
  northStarOpen: boolean;
  shortcutsOpen: boolean;
  sidebarCollapsed: boolean;
  setPresentation: (value: boolean) => void;
  togglePresentation: () => void;
  setPaletteOpen: (value: boolean) => void;
  setNorthStarOpen: (value: boolean) => void;
  setShortcutsOpen: (value: boolean) => void;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      presentation: false,
      paletteOpen: false,
      northStarOpen: false,
      shortcutsOpen: false,
      sidebarCollapsed: false,
      setPresentation: (value) => set({ presentation: value }),
      togglePresentation: () => set((s) => ({ presentation: !s.presentation })),
      setPaletteOpen: (value) => set({ paletteOpen: value }),
      setNorthStarOpen: (value) => set({ northStarOpen: value }),
      setShortcutsOpen: (value) => set({ shortcutsOpen: value }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "hermes-ui",
      partialize: (s) => ({ presentation: s.presentation, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);

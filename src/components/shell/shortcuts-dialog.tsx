"use client";

import { NAV } from "@/config/nav";
import { useUiStore } from "@/stores/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";

const GLOBAL: Array<[string[], string]> = [
  [["⌘", "K"], "Command palette / search"],
  [["\\"], "Toggle analyst ↔ trade view"],
  [["."], "Open North Star drawer"],
  [["n"], "New research note"],
  [["i"], "New pipeline idea"],
  [["?"], "This help"],
];

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard</DialogTitle>
          <DialogDescription>Hermes is keyboard-first. Press g then a letter to jump.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div>
            <p className="eyebrow mb-2">Global</p>
            {GLOBAL.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between py-1 text-[12px]">
                <span className="text-foreground-secondary">{label}</span>
                <span className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="eyebrow mb-2">Navigate</p>
            {NAV.map((item) => (
              <div key={item.href} className="flex items-center justify-between py-1 text-[12px]">
                <span className="text-foreground-secondary">{item.short}</span>
                <span className="flex gap-1"><Kbd>g</Kbd><Kbd>{item.hotkey}</Kbd></span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

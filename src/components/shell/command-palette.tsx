"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, EyeOff, FileText, KanbanSquare, PenLine, Sparkles } from "lucide-react";
import { NAV } from "@/config/nav";
import { api, queryKeys } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useUiStore } from "@/stores/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge, toneFor } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/misc";

type SearchResponse = {
  companies: Array<{ ticker: string; symbol: string; name: string; sector: string | null }>;
  research: Array<{ id: string; kind: string; source_table: string; title: string; ticker: string | null; persona_slug: string | null; verdict: string | null; occurred_at: string | null; headline: string | null }>;
  ideas: Array<{ id: string; ticker: string; stage: string; company_name: string | null }>;
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, togglePresentation, setNorthStarOpen } = useUiStore();
  const [query, setQuery] = React.useState("");
  const debounced = useDebounced(query, 160);

  const search = useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: () => api<SearchResponse>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: paletteOpen && debounced.trim().length >= 2,
    staleTime: 60_000,
  });

  function close() {
    setPaletteOpen(false);
    setQuery("");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  const results = search.data;
  const showAsync = debounced.trim().length >= 2;

  return (
    <Dialog open={paletteOpen} onOpenChange={(open) => (open ? setPaletteOpen(true) : close())}>
      <DialogContent hideClose className="p-0 max-w-xl overflow-hidden top-[18%] translate-y-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={!showAsync} label="Command palette" className="flex flex-col">
          <div className="flex items-center gap-2 px-3 hairline-b">
            <Sparkles className="size-4 text-gold" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Jump to a ticker, search memos, run a command…"
              className="h-11 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-2 outline-none"
            />
            <Kbd>esc</Kbd>
          </div>
          <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-[12px] text-muted">
              {search.isFetching ? "Searching the brain…" : "No matches."}
            </Command.Empty>

            {showAsync && results?.companies?.length ? (
              <Command.Group heading="Tickers" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {results.companies.map((c) => (
                  <Command.Item key={c.ticker} value={`ticker ${c.ticker} ${c.name}`} onSelect={() => go(`/companies/${encodeURIComponent(c.ticker)}`)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                    <Building2 className="size-3.5 text-muted" />
                    <span className="num font-semibold text-foreground w-24">{c.symbol}</span>
                    <span className="flex-1 truncate text-foreground-secondary">{c.name}</span>
                    <span className="text-[11px] text-muted truncate max-w-[140px]">{c.sector ?? c.ticker}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {showAsync && results?.ideas?.length ? (
              <Command.Group heading="Pipeline" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {results.ideas.map((i) => (
                  <Command.Item key={i.id} value={`idea ${i.ticker} ${i.company_name ?? ""}`} onSelect={() => go(`/pipeline?idea=${i.id}`)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                    <KanbanSquare className="size-3.5 text-muted" />
                    <span className="num font-semibold text-foreground w-24">{i.ticker}</span>
                    <span className="flex-1 truncate text-foreground-secondary">{i.company_name}</span>
                    <Badge variant={toneFor(i.stage)}>{i.stage}</Badge>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {showAsync && results?.research?.length ? (
              <Command.Group heading="Research" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {results.research.map((r) => (
                  <Command.Item key={r.id} value={`research ${r.id}`} onSelect={() => go(`/research/${r.id}`)} className="flex items-start gap-2.5 rounded-md px-2 py-2 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                    <FileText className="size-3.5 text-muted mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{r.title}</span>
                        {r.ticker ? <span className="num text-[11px] text-muted">{r.ticker}</span> : null}
                        {r.verdict ? <Badge variant={toneFor(r.verdict)}>{r.verdict}</Badge> : null}
                        <span className="ml-auto text-[10.5px] text-muted-2">{r.persona_slug ?? r.kind} · {fmtDate(r.occurred_at)}</span>
                      </div>
                      {r.headline ? <p className="text-[11.5px] text-muted truncate [&_b]:text-gold [&_b]:font-semibold" dangerouslySetInnerHTML={{ __html: r.headline }} /> : null}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              {NAV.map((item) => (
                <Command.Item key={item.href} value={`go ${item.label} ${item.description}`} onSelect={() => go(item.href)} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                  <item.icon className="size-3.5 text-muted" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[11px] text-muted-2 truncate max-w-[220px]">{item.description}</span>
                  <Kbd>g{item.hotkey}</Kbd>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <Command.Item value="new note journal memo" onSelect={() => go("/research/new")} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                <PenLine className="size-3.5 text-muted" /> <span className="flex-1">New research note</span> <Kbd>n</Kbd>
              </Command.Item>
              <Command.Item value="new idea pipeline card" onSelect={() => go("/pipeline?new=1")} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                <KanbanSquare className="size-3.5 text-muted" /> <span className="flex-1">New pipeline idea</span> <Kbd>i</Kbd>
              </Command.Item>
              <Command.Item value="toggle presentation analyst view hide positions" onSelect={() => { togglePresentation(); close(); }} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                <EyeOff className="size-3.5 text-muted" /> <span className="flex-1">Toggle analyst / trade view</span> <Kbd>\</Kbd>
              </Command.Item>
              <Command.Item value="open north star mandate drawer" onSelect={() => { close(); setNorthStarOpen(true); }} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer data-[selected=true]:bg-surface-3">
                <ArrowRight className="size-3.5 text-muted" /> <span className="flex-1">Open North Star drawer</span> <Kbd>.</Kbd>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

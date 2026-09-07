"use client";

import * as React from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/public";

/**
 * Live updates: subscribe to postgres_changes on the given hermes_* tables and
 * invalidate the matching react-query keys (and optionally refresh the server
 * component tree). Realtime is anon-readable because every hermes table has a
 * SELECT policy; writes still only happen server-side.
 */
export function useRealtime(tables: string[], keys: QueryKey[], opts: { refreshRoute?: boolean; debounceMs?: number } = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const tablesKey = tables.join(",");
  const keysRef = React.useRef(keys);
  React.useEffect(() => {
    keysRef.current = keys;
  });

  React.useEffect(() => {
    const client = getBrowserClient();
    if (!client || tables.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of keysRef.current) void queryClient.invalidateQueries({ queryKey: key });
        if (opts.refreshRoute) router.refresh();
      }, opts.debounceMs ?? 250);
    };
    let channel = client.channel(`hermes:${tablesKey}:${Math.random().toString(36).slice(2, 8)}`);
    for (const table of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, fire);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, opts.refreshRoute, opts.debounceMs]);
}

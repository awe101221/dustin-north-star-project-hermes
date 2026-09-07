"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/ui";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

/** Applies presentation mode to <html data-present> so CSS can blur values. */
function PresentationAttribute() {
  const presentation = useUiStore((s) => s.presentation);
  React.useEffect(() => {
    document.documentElement.dataset.present = presentation ? "true" : "false";
  }, [presentation]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(getQueryClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        <PresentationAttribute />
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: "var(--overlay)", border: "1px solid var(--border-strong)", color: "var(--foreground)", fontSize: 12.5 },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

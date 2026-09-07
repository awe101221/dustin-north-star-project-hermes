"use client";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-neg">Something broke on this page.</p>
      <p className="mt-1 text-[12px] text-muted num break-all max-w-xl mx-auto">{error.message}</p>
      <Button variant="secondary" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3 sm:items-end", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="break-words text-[20px] font-semibold leading-6 text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-muted">{description}</p> : null}
        {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
    </div>
  );
}

export function NotConfigured({ what = "the Awe Capital brain" }: { what?: string }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-foreground">Hermes is not connected to {what}.</p>
      <p className="mt-1 text-[12px] text-muted max-w-lg mx-auto">
        Set <code className="num">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="num">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (and{" "}
        <code className="num">SUPABASE_SERVICE_ROLE_KEY</code> for writes) in Vercel or <code className="num">.env.local</code>. See README → Setup.
      </p>
    </div>
  );
}

export function ErrorPanel({ title = "Query failed", detail }: { title?: string; detail?: string }) {
  return (
    <div className="rounded-md border border-neg/40 bg-neg-soft px-4 py-3 text-[12px]">
      <p className="font-medium text-neg">{title}</p>
      {detail ? <p className="mt-0.5 text-foreground-secondary num break-all">{detail}</p> : null}
    </div>
  );
}

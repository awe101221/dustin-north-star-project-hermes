"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A deliberately small, fast table: sortable columns, sticky header, dense
 * rows, tabular numerals. No virtualization — Hermes tables are < 2k rows and
 * the browser handles that comfortably; keep it simple and instant.
 */
export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => number | string | null | undefined;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
  sensitive?: boolean;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  defaultSort,
  onRowClick,
  emptyMessage = "Nothing here yet.",
  dense = true,
  maxHeight,
  className,
  rowClassName,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  defaultSort?: SortState;
  onRowClick?: (row: T) => void;
  emptyMessage?: React.ReactNode;
  dense?: boolean;
  maxHeight?: string;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  footer?: React.ReactNode;
}) {
  const [sort, setSort] = React.useState<SortState>(defaultSort ?? null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: col.align === "right" ? "desc" : "asc" };
      if (prev.dir === "desc") return { key: col.key, dir: "asc" };
      return { key: col.key, dir: "desc" };
    });
  }

  return (
    <div className={cn("overflow-auto rounded-md border border-border bg-surface", className)} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "eyebrow px-2.5 py-2 text-left whitespace-nowrap border-b border-border-strong select-none",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.sortValue && "cursor-pointer hover:text-foreground",
                    active && "text-gold",
                    col.className,
                  )}
                  onClick={() => toggleSort(col)}
                >
                  <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                    {col.header}
                    {col.sortValue ? (
                      active ? (
                        sort?.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )
                    ) : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted text-[12px]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border last:border-b-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-surface-2",
                  rowClassName?.(row),
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-2.5 align-middle whitespace-nowrap",
                      dense ? "py-1.5" : "py-2.5",
                      col.align === "right" && "text-right num",
                      col.align === "center" && "text-center",
                      col.sensitive && "sensitive",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer ? <tfoot className="sticky bottom-0 bg-surface-2">{footer}</tfoot> : null}
      </table>
    </div>
  );
}

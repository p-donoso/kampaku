"use client";

import { useEffect, useState, type ReactNode } from "react";

type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  hideOnMobile?: boolean;
};

type ResponsiveTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  mobileCard: (row: T) => ReactNode;
  breakpoint?: "md" | "lg";
  empty?: ReactNode;
};

export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  mobileCard,
  breakpoint = "md",
  empty,
}: ResponsiveTableProps<T>) {
  const [isMobile, setIsMobile] = useState(false);
  const query = breakpoint === "lg" ? "(min-width: 1024px)" : "(min-width: 768px)";

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setIsMobile(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  if (rows.length === 0 && empty) return <>{empty}</>;

  if (isMobile) {
    return (
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={onRowClick ? "cursor-pointer" : undefined}
          >
            {mobileCard(row)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-border/60 ${
                onRowClick ? "cursor-pointer hover:bg-elevated/50" : ""
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-foreground">
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

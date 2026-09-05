import type { ReactNode } from "react";
import Link from "next/link";

type StatCardProps = {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "error";
  compact?: boolean;
  href?: string;
};

const toneClass = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
} as const;

export function StatCard({ label, value, icon, tone = "default", compact = false, href }: StatCardProps) {
  const content = (
    <div className={`rounded-xl border border-border bg-surface/30 ${href ? "transition-colors hover:border-warning/50 hover:bg-elevated/40" : ""} ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">{label}</div>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className={`mt-1 font-semibold ${compact ? "text-xl" : "text-2xl"} ${toneClass[tone]}`}>
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href} aria-label={`${label}: ${value}`}>{content}</Link> : content;
}

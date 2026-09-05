import type { ReactNode } from "react";

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  padding?: "none" | "sm" | "md";
  id?: string;
};

const paddingClass = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
} as const;

export function Surface({
  children,
  className = "",
  elevated = false,
  padding = "md",
  id,
}: SurfaceProps) {
  return (
    <div
      id={id}
      className={`rounded-xl border border-border ${
        elevated ? "bg-elevated" : "bg-surface/30"
      } ${paddingClass[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

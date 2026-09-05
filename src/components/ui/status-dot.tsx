type StatusDotProps = {
  status: "online" | "offline" | "running" | "warning" | "error";
  className?: string;
  label?: string;
};

const statusClass = {
  online: "bg-success",
  offline: "bg-error",
  running: "bg-info animate-pulse",
  warning: "bg-warning",
  error: "bg-error",
} as const;

export function StatusDot({ status, className = "", label }: StatusDotProps) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusClass[status]} ${className}`}
      title={label}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}

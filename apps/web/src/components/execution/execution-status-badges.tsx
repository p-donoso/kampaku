import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import type { WorkItemRecord } from "@/lib/types";
import { getWorkItemDisplayStatus, type WorkItemStatusTone } from "@/lib/work-item-status";

const TONE_COLORS: Record<
  WorkItemStatusTone,
  "default" | "warning" | "info" | "success" | "error"
> = {
  default: "default",
  warning: "warning",
  info: "info",
  success: "success",
  error: "error",
};

export function WorkItemStatusBadge({
  item,
}: {
  item: Pick<WorkItemRecord, "status" | "executionPhase" | "jobStatus">;
}) {
  const display = getWorkItemDisplayStatus(item);

  return (
    <Chip
      size="small"
      color={TONE_COLORS[display.tone]}
      variant="outlined"
      label={display.label}
      icon={display.pulse ? <CircularProgress size={10} color="inherit" /> : undefined}
      title={display.title}
      sx={{ height: 20, fontSize: 10 }}
    />
  );
}

/** @deprecated Use WorkItemStatusBadge */
export function ExecutionStatusBadge({
  item,
}: {
  item: Pick<WorkItemRecord, "status" | "executionPhase" | "jobStatus">;
}) {
  return <WorkItemStatusBadge item={item} />;
}

export function RuntimeStatusBanner({
  runtime,
}: {
  runtime: { workersOnline: number; queuedJobs: number; runningJobs: number } | null;
}) {
  if (!runtime) return null;

  if (runtime.workersOnline === 0 && runtime.queuedJobs > 0) {
    return (
      <Alert severity="warning" className="!mb-3" sx={{ py: 0 }}>
        Worker offline — {runtime.queuedJobs} task{runtime.queuedJobs !== 1 ? "s" : ""} queued.
        Start with <code className="text-amber-200">make dev</code>.
      </Alert>
    );
  }

  return null;
}

export function FailedCountBadge({ count, compact }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;

  return (
    <Chip
      size="small"
      color="error"
      variant="outlined"
      label={`${count} failed`}
      title={`${count} failed task${count !== 1 ? "s" : ""}`}
      sx={{ height: compact ? 20 : 24, fontSize: compact ? 10 : 12 }}
    />
  );
}

import type { WorkItemRecord } from "./types";

export type WorkItemStatusTone = "default" | "warning" | "info" | "success" | "error";

export type WorkItemDisplayStatus = {
  label: string;
  tone: WorkItemStatusTone;
  pulse?: boolean;
  title?: string;
};

const WORKFLOW_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function getWorkItemDisplayStatus(
  item: Pick<WorkItemRecord, "status" | "executionPhase" | "jobStatus">,
): WorkItemDisplayStatus {
  const phase = item.executionPhase;

  if (phase === "queued") {
    return {
      label: "Queued",
      tone: "warning",
      pulse: true,
      title: item.jobStatus ? `Job: ${item.jobStatus}` : undefined,
    };
  }

  if (phase === "running") {
    return {
      label: "Running",
      tone: "info",
      pulse: true,
      title: item.jobStatus ? `Job: ${item.jobStatus}` : undefined,
    };
  }

  if (phase === "failed" || item.status === "blocked") {
    return {
      label: "Failed",
      tone: "error",
      title: item.jobStatus ? `Job: ${item.jobStatus}` : undefined,
    };
  }

  if (item.status === "done" || phase === "done") {
    return { label: "Done", tone: "success" };
  }

  return {
    label: WORKFLOW_LABELS[item.status] ?? item.status,
    tone: item.status === "cancelled" ? "default" : "default",
  };
}

export type BlockerStatus = "pending" | "resolved" | "escalated" | "converted";
export type RecoveryAction = "resolve" | "escalate" | "convert";

export function nextBlockerStatus(current: BlockerStatus, action: RecoveryAction): BlockerStatus {
  if (current !== "pending") throw new Error("Only pending blockers can transition.");
  return action === "resolve" ? "resolved" : action === "escalate" ? "escalated" : "converted";
}

export function canRequeueWorkItem(blockerStatus: BlockerStatus, activeJobExists: boolean): boolean {
  return blockerStatus === "resolved" && !activeJobExists;
}

export function retryContext(attempt: number, failureCode: string, failureMessage: string) {
  return { attempt, failureCode, failureMessage, capturedAt: new Date().toISOString() };
}

export function escalationOwner(kind: "tool_failure" | "task_failure" | "dependency" | "decision_dependency"): string {
  return kind === "tool_failure" ? "platform-owner" : kind === "dependency" ? "dependency-owner" : kind === "decision_dependency" ? "question-flow" : "project-lead";
}

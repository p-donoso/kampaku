export interface TraceLink { requirementId: string; workItemId: string; attemptId: string; artifactRefs: string[]; evidenceRefs: string[]; versionRef?: string; recordedAt: string }

export interface AttemptRecord { id: string; workItemId: string; status: string; outputHash: string; recordedAt: string }

export function createTraceLink(input: Omit<TraceLink, "recordedAt">): TraceLink {
  if (!input.requirementId || !input.workItemId || !input.attemptId) throw new Error("Trace links require requirement, work item, and attempt IDs.");
  if (input.artifactRefs.length === 0 && input.evidenceRefs.length === 0) throw new Error("Trace links require artifact or evidence references.");
  if (!input.versionRef?.trim()) throw new Error("Trace links require a version reference.");
  return { ...input, recordedAt: new Date().toISOString() };
}

export function appendAttempt(history: AttemptRecord[], attempt: AttemptRecord): AttemptRecord[] {
  if (history.some((item) => item.id === attempt.id)) throw new Error("Attempt IDs must be immutable and unique.");
  return [...history, attempt];
}

export function hasVersionedOutput(link: TraceLink): boolean {
  return typeof link.versionRef === "string" && link.versionRef.trim().length > 0;
}

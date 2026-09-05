import type { MemoryStore } from "../../persistence/memory-store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";
import type { JobResultRecord } from "../../persistence/store.js";

const MAX_RECALL = 5;

export function recallLearningsForJob(
  memoryStore: MemoryStore | undefined,
  workItem: WorkItemRecord,
): string | undefined {
  if (!memoryStore || !workItem.assigneeAgentId) return undefined;

  const hits = memoryStore.list({
    agentId: workItem.assigneeAgentId,
    kind: "learning",
    projectId: workItem.projectId,
    limit: MAX_RECALL,
    recordAccess: true,
  });

  if (hits.length === 0) return undefined;

  const lines = [
    "Relevant learnings from prior jobs on this project:",
    ...hits.map((hit) => `- ${hit.title}: ${hit.summary ?? hit.body}`.slice(0, 280)),
  ];
  return lines.join("\n");
}

export function recordWorkerFailureLearning(
  memoryStore: MemoryStore | undefined,
  workItem: WorkItemRecord,
  result: JobResultRecord,
): void {
  if (!memoryStore || !workItem.assigneeAgentId) return;
  const error = (result.error ?? {}) as Record<string, unknown>;
  const code = typeof error.code === "string" ? error.code : "WORKER_FAILURE";
  if (!code.startsWith("WORKER_") && code !== "FREELLMAPI_INITIAL_TIMEOUT") return;

  const message = typeof error.message === "string" ? error.message : "Worker job failed.";
  memoryStore.create({
    agentId: workItem.assigneeAgentId,
    kind: "learning",
    title: `${code} on ${workItem.title}`.slice(0, 120),
    body: [
      `Work item: ${workItem.title}`,
      `Error: ${code}`,
      message,
      "Next attempt: narrow file scope, keep acceptance criteria as exact npm commands, and run required checks before finish.",
    ].join("\n"),
    summary: `${code}: ${message}`.slice(0, 240),
    relevance: 5,
    projectId: workItem.projectId,
    workItemId: workItem.id,
    metadata: { code, jobId: result.jobId, source: "worker_failure" },
  });
}

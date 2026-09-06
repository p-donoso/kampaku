import { randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runControlledBatch } from "../../../application/jobs/controlled-batch.js";
import type { KampakuToolContext } from "./index.js";

export interface StartDurableExecutionArgs {
  project_slug_or_id: string;
  /** Operation kind — currently only controlled_batch. */
  operation?: "controlled_batch";
  /** Number of small files to write (default 20, max 500). */
  count?: number;
  /** Delay between writes in ms (default 100). */
  delay_ms?: number;
  /** Relative directory under the stranger repo (default interrupt-lab). */
  relative_dir?: string;
  work_item_title?: string;
}

function assertOutsideHostMonorepo(repositoryPath: string, workspaceRoot: string): string {
  const resolved = resolve(repositoryPath);
  const root = resolve(workspaceRoot);
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Refusing durable execution inside the Kampaku monorepo (${root}). Use a stranger project path only.`,
    );
  }
  return resolved;
}

function resolveStrangerRepoPath(
  project: { repositories: Array<{ url: string }> },
  workspaceRoot: string,
): string {
  const primary = project.repositories.find((repo) => repo.url.startsWith("file://"));
  if (!primary) {
    throw new Error("Project must have a linked file:// repository before durable execution.");
  }
  return assertOutsideHostMonorepo(fileURLToPath(primary.url), workspaceRoot);
}

/**
 * Start an interruptible durable execution on a stranger file:// project.
 * Returns while the job is running; cancel via jobs cancel / cancel_execution.
 */
export function executeStartDurableExecution(
  ctx: KampakuToolContext,
  args: StartDurableExecutionArgs,
) {
  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error("Refusing durable execution on the platform project.");
  }

  const operation = args.operation ?? "controlled_batch";
  if (operation !== "controlled_batch") {
    throw new Error(`Unsupported durable execution operation "${operation}".`);
  }

  const repoPath = resolveStrangerRepoPath(project, ctx.config.workspaceRoot);
  const count = args.count ?? 20;
  const delayMs = args.delay_ms ?? 100;
  const relativeDir = args.relative_dir?.trim() || "interrupt-lab";

  const kampaku = ctx.agentStore.getKampakuAgent();
  const leadId = project.projectLeadAgentId ?? kampaku.id;
  const now = new Date().toISOString();
  const workItemId = randomUUID();
  const goalId = randomUUID();
  const taskId = randomUUID();
  const jobId = randomUUID();
  const title =
    args.work_item_title?.trim() ||
    `Durable interruptible batch (${count} files under ${relativeDir})`;

  ctx.pmStore.createWorkItem({
    id: workItemId,
    projectId: project.id,
    title,
    description: `Interruptible controlled_batch on ${repoPath}. Cancel should stop further writes.`,
    status: "in_progress",
    priority: "medium",
    sortOrder: ctx.pmStore.listWorkItemsByProject(project.id).length,
    assigneeAgentId: leadId,
    assignedByAgentId: kampaku.id,
    routingReason: "Emperor-directed durable interruptible execution",
    acceptanceCriteria: [
      "Job reaches a truthful terminal status (succeeded, cancelled, expired, or failed)",
      "Cancel stops further writes under the relative directory",
      "After process restart, orphan running jobs are not reported as still running",
    ],
    dependsOn: [],
    jobId,
    createdAt: now,
    updatedAt: now,
  });

  ctx.store.createGoal({
    id: goalId,
    projectId: project.id,
    objective: `Durable controlled_batch on ${project.slug}: ${count} files`,
    priority: 0,
    status: "active",
    createdAt: now,
  });
  ctx.store.createTask({
    id: taskId,
    goalId,
    title,
    status: "ready",
    input: {
      executor: "controlled_batch",
      repositoryPath: repoPath,
      projectSlug: project.slug,
      workItemId,
      count,
      delayMs,
      relativeDir,
    },
  });
  ctx.store.createJob({
    id: jobId,
    taskId,
    status: "queued",
    capabilities: ["code.agent"],
    input: {
      executor: "controlled_batch",
      repositoryPath: repoPath,
      projectSlug: project.slug,
      workItemId,
      count,
      delayMs,
      relativeDir,
    },
    idempotencyKey: jobId,
    leaseId: `durable-${jobId}`,
    workerId: "core-controlled-batch",
  });
  ctx.store.markJobRunning(jobId);
  ctx.store.appendJobLog(jobId, `Durable execution started for ${project.slug}`);

  void runControlledBatch({
    store: ctx.store,
    pmStore: ctx.pmStore,
    jobId,
    workItemId,
    repositoryPath: repoPath,
    spec: { count, delayMs, relativeDir },
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const job = ctx.store.getJob(jobId);
    if (job && (job.status === "running" || job.status === "leased" || job.status === "queued")) {
      ctx.store.appendJobLog(jobId, `Controlled batch failed: ${message}`);
      ctx.store.submitJobResult({
        jobId,
        leaseId: `controlled-batch-${jobId}`,
        status: "failed",
        error: { code: "CONTROLLED_BATCH_FAILED", message },
        finishedAt: new Date().toISOString(),
      });
    }
  });

  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    workItem: { id: workItemId, title, status: "in_progress" },
    jobId,
    jobStatus: "running",
    repositoryPath: repoPath,
    operation: "controlled_batch",
    count,
    delayMs,
    relativeDir,
    summary: `Durable execution running: job ${jobId} writing up to ${count} files under ${relativeDir}. Cancel with cancel_execution or POST /api/v1/jobs/${jobId}/cancel.`,
  };
}

export const START_DURABLE_EXECUTION_TOOL = {
  type: "function" as const,
  function: {
    name: "start_durable_execution",
    description:
      "Start an interruptible durable batch on a stranger file:// project (writes many small files with delay). Returns job id while running. Cancel stops further writes. Does not touch the Kampaku monorepo or platform project. Scenario counts/paths belong in args. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: { type: "string" },
        operation: { type: "string", enum: ["controlled_batch"] },
        count: { type: "number" },
        delay_ms: { type: "number" },
        relative_dir: { type: "string" },
        work_item_title: { type: "string" },
      },
      required: ["project_slug_or_id"],
    },
  },
};

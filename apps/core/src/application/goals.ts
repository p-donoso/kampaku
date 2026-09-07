import type { AppConfig, RepositoryRole } from "../config.js";
import type { GoalRecord, JobRecord, JobResultRecord, Store, TaskRecord } from "../persistence/store.js";
import { toContractJob as formatJob } from "../persistence/store.js";
import { createGoalWithPlan } from "../planner/create-goal.js";

export interface CreateGoalInput {
  projectId: string;
  objective: string;
  priority?: number;
  repositoryRole?: RepositoryRole;
}

export interface GoalAuditJob {
  id: string;
  taskId: string;
  status: JobRecord["status"];
  capabilities?: string[];
  input?: Record<string, unknown>;
  leaseId?: string;
  leaseExpiresAt?: string;
  startedAt?: string;
  logs: Array<{ occurredAt: string; line: string }>;
}

export interface GoalAudit {
  goal: GoalRecord;
  tasks: TaskRecord[];
  jobs: GoalAuditJob[];
  results: JobResultRecord[];
}

export async function createGoal(store: Store, config: AppConfig, input: CreateGoalInput) {
  return createGoalWithPlan(store, config, input);
}

export function getGoalAudit(store: Store, goalId: string): GoalAudit | undefined {
  const goal = store.getGoal(goalId);
  if (!goal) return undefined;

  const tasks = store.getTasksByGoal(goalId);
  const taskIds = tasks.map((task) => task.id);
  const jobs = store.getJobsByTaskIds(taskIds);
  const jobIds = jobs.map((job) => job.id);
  const results = store.getResultsByJobIds(jobIds);

  return {
    goal,
    tasks,
    jobs: jobs.map((job) => ({
      ...(job.leaseId
        ? formatJob(job)
        : {
            id: job.id,
            taskId: job.taskId,
            capabilities: job.capabilities,
            input: job.input,
          }),
      status: job.status,
      startedAt: store.getJobStartedAt(job.id),
      logs: store.listJobLogs(job.id),
    })),
    results,
  };
}

export function listGoals(store: Store, options: { limit?: number } = {}): GoalRecord[] {
  return store.listGoals(options.limit ?? 50);
}

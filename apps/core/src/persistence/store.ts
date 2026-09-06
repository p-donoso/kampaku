import { and, eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "./db.js";
import {
  bootstrapState,
  events,
  goals,
  jobResults,
  jobs,
  projects,
  tasks,
  workers,
} from "./schema.js";
import type { RepositoryRole } from "../config.js";
import type { PlanGranularity } from "../delegator/plan-granularity.js";
import { parsePlanGranularity } from "../delegator/plan-granularity.js";
import type { PlannedProject } from "../delegator/types.js";

export interface RepositoryReference {
  url: string;
  defaultBranch?: string;
  role?: string;
}

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  projectLeadAgentId?: string;
  coherenceStrategy?: string;
  planGranularity?: PlanGranularity;
  wikiSyncRequired?: boolean;
  wikiSyncPageSlug?: string;
  wikiSyncPhasePages?: Record<string, string>;
  repositories: RepositoryReference[];
  createdAt: string;
  updatedAt: string;
}

export interface GoalRecord {
  id: string;
  projectId: string;
  objective: string;
  priority: number;
  status: "proposed" | "active" | "paused" | "completed" | "cancelled";
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  goalId: string;
  title: string;
  status: "ready" | "running" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  acceptanceCriteria?: string[];
}

export interface JobRecord {
  id: string;
  taskId: string;
  status: "queued" | "leased" | "running" | "paused" | "succeeded" | "failed" | "cancelled" | "expired";
  leaseId?: string;
  leaseExpiresAt?: string;
  workerId?: string;
  capabilities: string[];
  input: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface JobResultRecord {
  jobId: string;
  leaseId: string;
  status: "succeeded" | "failed" | "cancelled" | "expired";
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  finishedAt: string;
}

export interface WorkerRecord {
  id: string;
  name?: string;
  version?: string;
  capabilities: string[];
  contractVersion: string;
  registeredAt: string;
}

export class ProjectStoreError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "ProjectStoreError";
  }
}

export class Store {
  constructor(private readonly db: Db) {}

  recordPlanApproval(input: { projectSlug: string; approvalReference: string; planFingerprint: string; planContentHash: string; agentId: string; expiresAt?: string }): void {
    this.recordEvent("plan.approved", input.projectSlug, input);
  }

  hasPlanApproval(projectSlug: string, approvalReference: string, planFingerprint: string, planContentHash: string): boolean {
    const rows = this.db.select().from(events).where(eq(events.eventType, "plan.approved")).all();
    const approved = rows.find((row) => {
      if (row.correlationId !== projectSlug) return false;
      try {
        const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
        if (payload.approvalReference !== approvalReference || payload.planFingerprint !== planFingerprint || payload.planContentHash !== planContentHash) return false;
        return typeof payload.expiresAt !== "string" || Date.parse(payload.expiresAt) > Date.now();
      } catch {
        return false;
      }
    });
    if (!approved) return false;
    const revocations = this.db.select().from(events).where(eq(events.eventType, "plan.revoked")).all();
    return !revocations.some((row) => {
      try {
        const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
        return payload.approvalReference === approvalReference && payload.planFingerprint === planFingerprint && (!payload.planContentHash || payload.planContentHash === planContentHash);
      } catch { return false; }
    });
  }

  revokePlanApproval(input: { projectSlug: string; approvalReference: string; planFingerprint: string; planContentHash?: string; agentId: string }): void {
    this.recordEvent("plan.revoked", input.projectSlug, input);
  }

  recordPlanPreview(input: { projectSlug: string; approvalReference: string; planFingerprint: string; planContentHash: string; plan: PlannedProject; plannerUsed: "llm" | "stub" }): void {
    this.recordEvent("plan.previewed", input.approvalReference, input);
  }

  getPlanPreview(approvalReference: string): { projectSlug: string; planFingerprint: string; planContentHash: string; plan: PlannedProject; plannerUsed: "llm" | "stub" } | undefined {
    const row = this.db.select().from(events).where(eq(events.eventType, "plan.previewed")).all().find((entry) => entry.correlationId === approvalReference);
    if (!row) return undefined;
    try {
      const payload = JSON.parse(row.payloadJson) as { projectSlug: string; planFingerprint: string; planContentHash: string; plan: PlannedProject; plannerUsed: "llm" | "stub" };
      return payload;
    } catch { return undefined; }
  }

  createProject(project: ProjectRecord): ProjectRecord {
    this.db.insert(projects).values({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description ?? null,
      status: project.status,
      projectLeadAgentId: project.projectLeadAgentId ?? null,
      coherenceStrategy: project.coherenceStrategy ?? null,
      wikiSyncRequired: project.wikiSyncRequired ? 1 : 0,
      wikiSyncPageSlug: project.wikiSyncPageSlug ?? null,
      wikiSyncPhasePagesJson: JSON.stringify(project.wikiSyncPhasePages ?? {}),
      repositoriesJson: JSON.stringify(project.repositories),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }).run();
    this.recordEvent("project.registered", project.id, { projectId: project.id, slug: project.slug });
    return project;
  }

  updateProject(
    idOrSlug: string,
    patch: Partial<Pick<ProjectRecord, "name" | "description" | "status" | "repositories" | "wikiSyncRequired" | "wikiSyncPageSlug" | "wikiSyncPhasePages">>,
  ): ProjectRecord {
    const project = this.getProjectByIdOrSlug(idOrSlug);
    if (!project) {
      throw new ProjectStoreError("Project not found.", "NOT_FOUND");
    }

    const updated: ProjectRecord = {
      ...project,
      name: patch.name ?? project.name,
      description: patch.description !== undefined ? patch.description : project.description,
      status: patch.status ?? project.status,
      repositories: patch.repositories ?? project.repositories,
      wikiSyncRequired: patch.wikiSyncRequired ?? project.wikiSyncRequired,
      wikiSyncPageSlug: patch.wikiSyncPageSlug ?? project.wikiSyncPageSlug,
      wikiSyncPhasePages: patch.wikiSyncPhasePages ?? project.wikiSyncPhasePages,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .update(projects)
      .set({
        name: updated.name,
        description: updated.description ?? null,
        status: updated.status,
        repositoriesJson: JSON.stringify(updated.repositories),
        wikiSyncRequired: updated.wikiSyncRequired ? 1 : 0,
        wikiSyncPageSlug: updated.wikiSyncPageSlug ?? null,
        wikiSyncPhasePagesJson: JSON.stringify(updated.wikiSyncPhasePages ?? {}),
        updatedAt: updated.updatedAt,
      })
      .where(eq(projects.id, project.id))
      .run();

    this.recordEvent("project.updated", project.id, { projectId: project.id, slug: project.slug });
    return updated;
  }

  deleteProject(idOrSlug: string, options?: { protectProjectId?: string }): void {
    const project = this.getProjectByIdOrSlug(idOrSlug);
    if (!project) {
      throw new ProjectStoreError("Project not found.", "NOT_FOUND");
    }
    if (
      project.slug === "kampaku" ||
      (options?.protectProjectId && project.id === options.protectProjectId)
    ) {
      throw new ProjectStoreError("The default project cannot be deleted.", "FORBIDDEN");
    }

    this.deleteGoalsByProject(project.id);
    this.db.delete(projects).where(eq(projects.id, project.id)).run();
    this.recordEvent("project.deleted", project.id, { projectId: project.id, slug: project.slug });
  }

  deleteGoalsByProject(projectId: string): void {
    const projectGoals = this.db.select().from(goals).where(eq(goals.projectId, projectId)).all();
    for (const goal of projectGoals) {
      const goalTasks = this.db.select().from(tasks).where(eq(tasks.goalId, goal.id)).all();
      for (const task of goalTasks) {
        const taskJobs = this.db.select().from(jobs).where(eq(jobs.taskId, task.id)).all();
        for (const job of taskJobs) {
          this.db.delete(jobResults).where(eq(jobResults.jobId, job.id)).run();
          this.db.delete(jobs).where(eq(jobs.id, job.id)).run();
        }
        this.db.delete(tasks).where(eq(tasks.id, task.id)).run();
      }
      this.db.delete(goals).where(eq(goals.id, goal.id)).run();
    }
  }

  updateProjectPlanning(
    id: string,
    patch: {
      projectLeadAgentId?: string | null;
      coherenceStrategy?: string | null;
      planGranularity?: PlanGranularity | null;
    },
  ): void {
    const set: {
      projectLeadAgentId?: string | null;
      coherenceStrategy?: string | null;
      planGranularity?: string | null;
      updatedAt: string;
    } = {
      updatedAt: new Date().toISOString(),
    };

    if (patch.projectLeadAgentId !== undefined) {
      set.projectLeadAgentId = patch.projectLeadAgentId;
    }
    if (patch.coherenceStrategy !== undefined) {
      set.coherenceStrategy = patch.coherenceStrategy;
    }
    if (patch.planGranularity !== undefined) {
      set.planGranularity = patch.planGranularity;
    }

    this.db.update(projects).set(set).where(eq(projects.id, id)).run();
  }

  getProject(id: string): ProjectRecord | undefined {
    const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
    if (!row) return undefined;
    return this.mapProject(row);
  }

  getProjectBySlug(slug: string): ProjectRecord | undefined {
    const row = this.db.select().from(projects).where(eq(projects.slug, slug)).get();
    if (!row) return undefined;
    return this.mapProject(row);
  }

  getProjectByIdOrSlug(idOrSlug: string): ProjectRecord | undefined {
    return this.getProject(idOrSlug) ?? this.getProjectBySlug(idOrSlug);
  }

  listProjects(): ProjectRecord[] {
    return this.db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt))
      .all()
      .map((row) => this.mapProject(row));
  }

  private mapProject(row: typeof projects.$inferSelect): ProjectRecord {
    return {
      id: row.id,
      slug: row.slug ?? row.id.slice(0, 8),
      name: row.name,
      description: row.description ?? undefined,
      status: (row.status ?? "planning") as ProjectStatus,
      projectLeadAgentId: row.projectLeadAgentId ?? undefined,
      coherenceStrategy: row.coherenceStrategy ?? undefined,
      planGranularity: parsePlanGranularity(row.planGranularity),
      wikiSyncRequired: Boolean(row.wikiSyncRequired),
      wikiSyncPageSlug: row.wikiSyncPageSlug ?? undefined,
      wikiSyncPhasePages: row.wikiSyncPhasePagesJson ? JSON.parse(row.wikiSyncPhasePagesJson) as Record<string, string> : {},
      repositories: JSON.parse(row.repositoriesJson) as RepositoryReference[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
    };
  }

  getFirstProject(): ProjectRecord | undefined {
    const row = this.db.select().from(projects).limit(1).get();
    if (!row) return undefined;
    return this.getProject(row.id);
  }

  createGoal(goal: GoalRecord): GoalRecord {
    this.db.insert(goals).values({
      id: goal.id,
      projectId: goal.projectId,
      objective: goal.objective,
      priority: goal.priority,
      status: goal.status,
      createdAt: goal.createdAt,
    }).run();
    this.recordEvent("goal.created", goal.id, { goalId: goal.id });
    return goal;
  }

  updateGoalStatus(goalId: string, status: GoalRecord["status"]): void {
    this.db.update(goals).set({ status }).where(eq(goals.id, goalId)).run();
  }

  getGoal(id: string): GoalRecord | undefined {
    const row = this.db.select().from(goals).where(eq(goals.id, id)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.projectId,
      objective: row.objective,
      priority: row.priority ?? 0,
      status: row.status as GoalRecord["status"],
      createdAt: row.createdAt,
    };
  }

  getLatestGoal(): GoalRecord | undefined {
    return this.listGoals(1)[0];
  }

  listGoals(limit = 50): GoalRecord[] {
    return this.db
      .select()
      .from(goals)
      .orderBy(desc(goals.createdAt))
      .limit(limit)
      .all()
      .map((row) => ({
        id: row.id,
        projectId: row.projectId,
        objective: row.objective,
        priority: row.priority ?? 0,
        status: row.status as GoalRecord["status"],
        createdAt: row.createdAt,
      }));
  }

  createTask(task: TaskRecord): TaskRecord {
    this.db.insert(tasks).values({
      id: task.id,
      goalId: task.goalId,
      title: task.title,
      status: task.status,
      inputJson: JSON.stringify(task.input),
      acceptanceCriteriaJson: task.acceptanceCriteria
        ? JSON.stringify(task.acceptanceCriteria)
        : null,
    }).run();
    this.recordEvent("task.ready", task.goalId, { taskId: task.id });
    return task;
  }

  getTasksByGoal(goalId: string): TaskRecord[] {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.goalId, goalId))
      .all()
      .map((row) => ({
        id: row.id,
        goalId: row.goalId,
        title: row.title,
        status: row.status as TaskRecord["status"],
        input: JSON.parse(row.inputJson) as Record<string, unknown>,
        acceptanceCriteria: row.acceptanceCriteriaJson
          ? (JSON.parse(row.acceptanceCriteriaJson) as string[])
          : undefined,
      }));
  }

  createJob(job: JobRecord): JobRecord {
    this.db.insert(jobs).values({
      id: job.id,
      taskId: job.taskId,
      status: job.status,
      leaseId: job.leaseId ?? null,
      leaseExpiresAt: job.leaseExpiresAt ?? null,
      workerId: job.workerId ?? null,
      capabilitiesJson: JSON.stringify(job.capabilities),
      inputJson: JSON.stringify(job.input),
      idempotencyKey: job.idempotencyKey ?? null,
    }).run();
    return job;
  }

  getJobsByTaskIds(taskIds: string[]): JobRecord[] {
    if (taskIds.length === 0) return [];
    const allJobs = this.db.select().from(jobs).all();
    return allJobs
      .filter((row) => taskIds.includes(row.taskId))
      .map((row) => this.mapJob(row));
  }

  getJob(jobId: string): JobRecord | undefined {
    const row = this.db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!row) return undefined;
    return this.mapJob(row);
  }

  countJobsByStatus(status: JobRecord["status"]): number {
    return this.db.select().from(jobs).where(eq(jobs.status, status)).all().length;
  }

  listExpiredActiveJobs(): JobRecord[] {
    const now = new Date().toISOString();
    return this.db
      .select()
      .from(jobs)
      .all()
      .filter(
        (row) =>
          (row.status === "leased" || row.status === "running") &&
          Boolean(row.leaseExpiresAt) &&
          row.leaseExpiresAt! < now,
      )
      .map((row) => this.mapJob(row));
  }

  getJobResult(jobId: string): JobResultRecord | undefined {
    return this.getResultsByJobIds([jobId])[0];
  }

  /** Expire jobs whose lease elapsed while still leased or running. */
  reclaimExpiredLeases(): number {
    const expired = this.listExpiredActiveJobs();
    for (const job of expired) {
      this.appendJobLog(job.id, "Lease expired; zombie job cancelled.");
      this.submitJobResult({
        jobId: job.id,
        leaseId: job.leaseId ?? `expired-${job.id}`,
        status: "expired",
        error: {
          code: "LEASE_EXPIRED",
          message: "Job lease expired before the worker submitted a result.",
        },
        finishedAt: new Date().toISOString(),
      });
    }
    return expired.length;
  }

  workerHasActiveJob(workerId: string): boolean {
    return this.db
      .select()
      .from(jobs)
      .all()
      .some(
        (row) =>
          row.workerId === workerId &&
          (row.status === "leased" || row.status === "running"),
      );
  }

  leaseNextJob(
    workerId: string,
    workerCapabilities: string[],
    leaseDurationMs = 30 * 60 * 1000,
  ): JobRecord | undefined {
    this.reclaimExpiredLeases();
    if (this.workerHasActiveJob(workerId)) return undefined;

    const queued = this.db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .all()
      .map((row) => this.mapJob(row))
      .find((job) => job.capabilities.every((cap) => workerCapabilities.includes(cap)));

    if (!queued) return undefined;

    const leaseId = uuidv4();
    const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

    this.db
      .update(jobs)
      .set({
        status: "leased",
        leaseId,
        leaseExpiresAt,
        workerId,
      })
      .where(eq(jobs.id, queued.id))
      .run();

    this.recordEvent("job.leased", queued.id, { jobId: queued.id, workerId, leaseId });

    return {
      ...queued,
      status: "leased",
      leaseId,
      leaseExpiresAt,
      workerId,
    };
  }

  markJobRunning(jobId: string): void {
    this.db.update(jobs).set({ status: "running" }).where(eq(jobs.id, jobId)).run();
    this.recordEvent("job.started", jobId, { jobId });
    this.appendJobLog(jobId, "Job marked as running on core.");
  }

  pauseJob(jobId: string): void {
    this.db
      .update(jobs)
      .set({
        status: "paused",
        leaseId: null,
        leaseExpiresAt: null,
        workerId: null,
      })
      .where(eq(jobs.id, jobId))
      .run();
    this.recordEvent("job.paused", jobId, { jobId });
    this.appendJobLog(jobId, "Job paused.");
  }

  resumeJob(jobId: string): void {
    this.db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, jobId)).run();
    this.recordEvent("job.resumed", jobId, { jobId });
    this.appendJobLog(jobId, "Job resumed.");
  }

  cancelJobWithoutLease(jobId: string): void {
    this.db
      .update(jobs)
      .set({
        status: "cancelled",
        leaseId: null,
        leaseExpiresAt: null,
        workerId: null,
      })
      .where(eq(jobs.id, jobId))
      .run();
  }

  appendJobLog(jobId: string, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.recordEvent("job.log", jobId, { line: trimmed });
  }

  listJobLogs(jobId: string, limit = 500): Array<{ occurredAt: string; line: string }> {
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.correlationId, jobId), eq(events.eventType, "job.log")))
      .all()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(-limit)
      .map((row) => ({
        occurredAt: row.occurredAt,
        line: (JSON.parse(row.payloadJson) as { line: string }).line,
      }));
  }

  getJobStartedAt(jobId: string): string | undefined {
    const started = this.db
      .select()
      .from(events)
      .where(and(eq(events.correlationId, jobId), eq(events.eventType, "job.started")))
      .get();
    if (started) return started.occurredAt;

    const leased = this.db
      .select()
      .from(events)
      .where(and(eq(events.correlationId, jobId), eq(events.eventType, "job.leased")))
      .get();
    return leased?.occurredAt;
  }

  submitJobResult(result: JobResultRecord): JobResultRecord {
    const existing = this.db
      .select()
      .from(jobResults)
      .where(eq(jobResults.jobId, result.jobId))
      .get();

    if (existing && existing.leaseId === result.leaseId) {
      return {
        jobId: existing.jobId,
        leaseId: existing.leaseId,
        status: existing.status as JobResultRecord["status"],
        output: existing.outputJson
          ? (JSON.parse(existing.outputJson) as Record<string, unknown>)
          : undefined,
        error: existing.errorJson
          ? (JSON.parse(existing.errorJson) as Record<string, unknown>)
          : undefined,
        finishedAt: existing.finishedAt,
      };
    }

    this.db.insert(jobResults).values({
      id: uuidv4(),
      jobId: result.jobId,
      leaseId: result.leaseId,
      status: result.status,
      outputJson: result.output ? JSON.stringify(result.output) : null,
      errorJson: result.error ? JSON.stringify(result.error) : null,
      finishedAt: result.finishedAt,
    }).run();

    const terminalStatus =
      result.status === "succeeded"
        ? "succeeded"
        : result.status === "cancelled"
          ? "cancelled"
          : result.status === "expired"
            ? "expired"
            : "failed";

    this.db
      .update(jobs)
      .set({ status: terminalStatus })
      .where(eq(jobs.id, result.jobId))
      .run();

    const job = this.db.select().from(jobs).where(eq(jobs.id, result.jobId)).get();
    if (job) {
      const task = this.db.select().from(tasks).where(eq(tasks.id, job.taskId)).get();
      if (task) {
        const taskStatus = result.status === "succeeded" ? "completed" : "failed";
        this.db.update(tasks).set({ status: taskStatus }).where(eq(tasks.id, task.id)).run();
        const goal = this.getGoal(task.goalId);
        if (goal) {
          const goalStatus = result.status === "succeeded" ? "completed" : "active";
          this.updateGoalStatus(goal.id, goalStatus);
        }
      }
    }

    this.recordEvent(
      result.status === "succeeded" ? "job.completed" : "job.failed",
      result.jobId,
      { ...result },
    );

    return result;
  }

  getResultsByJobIds(jobIds: string[]): JobResultRecord[] {
    if (jobIds.length === 0) return [];
    return this.db
      .select()
      .from(jobResults)
      .all()
      .filter((row) => jobIds.includes(row.jobId))
      .map((row) => ({
        jobId: row.jobId,
        leaseId: row.leaseId,
        status: row.status as JobResultRecord["status"],
        output: row.outputJson
          ? (JSON.parse(row.outputJson) as Record<string, unknown>)
          : undefined,
        error: row.errorJson
          ? (JSON.parse(row.errorJson) as Record<string, unknown>)
          : undefined,
        finishedAt: row.finishedAt,
      }));
  }

  upsertWorker(worker: WorkerRecord): WorkerRecord {
    this.db
      .insert(workers)
      .values({
        id: worker.id,
        name: worker.name ?? null,
        version: worker.version ?? null,
        capabilitiesJson: JSON.stringify(worker.capabilities),
        contractVersion: worker.contractVersion,
        registeredAt: worker.registeredAt,
      })
      .onConflictDoUpdate({
        target: workers.id,
        set: {
          name: worker.name ?? null,
          version: worker.version ?? null,
          capabilitiesJson: JSON.stringify(worker.capabilities),
          contractVersion: worker.contractVersion,
          registeredAt: worker.registeredAt,
        },
      })
      .run();
    this.recordEvent("worker.registered", worker.id, { workerId: worker.id });
    return worker;
  }

  getWorker(id: string): WorkerRecord | undefined {
    const row = this.db.select().from(workers).where(eq(workers.id, id)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name ?? undefined,
      version: row.version ?? undefined,
      capabilities: JSON.parse(row.capabilitiesJson) as string[],
      contractVersion: row.contractVersion,
      registeredAt: row.registeredAt,
    };
  }

  listWorkers(): WorkerRecord[] {
    return this.db
      .select()
      .from(workers)
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name ?? undefined,
        version: row.version ?? undefined,
        capabilities: JSON.parse(row.capabilitiesJson) as string[],
        contractVersion: row.contractVersion,
        registeredAt: row.registeredAt,
      }));
  }

  setBootstrapState(key: string, value: unknown): void {
    this.db
      .insert(bootstrapState)
      .values({ key, valueJson: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: bootstrapState.key,
        set: { valueJson: JSON.stringify(value) },
      })
      .run();
  }

  getBootstrapState<T>(key: string): T | undefined {
    const row = this.db.select().from(bootstrapState).where(eq(bootstrapState.key, key)).get();
    if (!row) return undefined;
    return JSON.parse(row.valueJson) as T;
  }

  private mapJob(row: typeof jobs.$inferSelect): JobRecord {
    return {
      id: row.id,
      taskId: row.taskId,
      status: row.status as JobRecord["status"],
      leaseId: row.leaseId ?? undefined,
      leaseExpiresAt: row.leaseExpiresAt ?? undefined,
      workerId: row.workerId ?? undefined,
      capabilities: JSON.parse(row.capabilitiesJson) as string[],
      input: JSON.parse(row.inputJson) as Record<string, unknown>,
      idempotencyKey: row.idempotencyKey ?? undefined,
    };
  }

  private recordEvent(
    eventType: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): void {
    this.db.insert(events).values({
      id: uuidv4(),
      eventType,
      correlationId,
      payloadJson: JSON.stringify(payload),
      occurredAt: new Date().toISOString(),
    }).run();
  }
}

export function toContractJob(job: JobRecord) {
  return {
    id: job.id,
    taskId: job.taskId,
    leaseId: job.leaseId!,
    leaseExpiresAt: job.leaseExpiresAt!,
    capabilities: job.capabilities,
    input: job.input,
    idempotencyKey: job.idempotencyKey,
  };
}

export type JobInput = {
  prompt: string;
  repositoryRole: RepositoryRole;
  context?: { goalId?: string; taskId?: string };
};

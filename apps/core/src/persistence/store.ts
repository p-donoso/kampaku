import { and, eq, desc, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
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

/**
 * How long a lead's plan approval stays usable when the caller does not say. Long enough for the operator to
 * read the plan and release it, short enough that an approval is not a permanent licence for one plan.
 */
export const DEFAULT_PLAN_APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  /**
   * When the job was queued, ISO-8601.
   *
   * Optional because a row written before the column existed has no value, and the job list reports that
   * as `null` rather than filling it in (BOARD F-078).
   */
  createdAt?: string;
}

export interface JobResultRecord {
  jobId: string;
  leaseId: string;
  status: "succeeded" | "failed" | "cancelled" | "expired";
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  finishedAt: string;
}

export interface EvidenceRecord {
  kind: string;
  subject: string;
  passed: boolean;
  observedAt: string;
  criterionId?: string;
  sourceTool?: string;
  jobId: string;
}

export interface WorkerRecord {
  id: string;
  name?: string;
  version?: string;
  capabilities: string[];
  contractVersion: string;
  registeredAt: string;
  /**
   * The last time Core heard from this worker. Registration is a sighting, and so is every job poll
   * (`touchWorker`), which is what makes a worker that has gone away stop counting as online.
   * Absent on a row written before the column existed, which reads as never seen since.
   */
  lastSeenAt?: string;
}

export class ProjectStoreError extends Error {
  constructor(
    message: string,
    /**
     * `CONFLICT` exists so a duplicate is not reported as a crash.
     *
     * Measured: `POST /api/v1/projects` with a slug that already existed answered **500 Internal Server
     * Error** with a bare body (BOARD F-035), because the route had no mapping and the unique constraint
     * surfaced as a raw SQLite throw. A caller retrying a create could not tell a duplicate from a broken
     * server. It is a conflict, and it now says so.
     */
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = "ProjectStoreError";
  }
}

export class Store extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  /**
   * Records an approval for an exact previewed plan.
   *
   * The approval must correspond to a **persisted preview**: an approval whose fingerprint no preview
   * ever produced can never be applied, because the apply path re-derives both values and compares them
   * (`plan-and-delegate.ts`). Recording one anyway used to succeed silently and report "persisted", so
   * an operator or an agent could approve a fabricated or mistyped fingerprint, receive a green
   * acknowledgement, and only discover the problem two steps later at apply time with a generic error.
   *
   * The check lives here, at the single point both the `approve_plan` tool and the REST/CLI path write
   * through, so no entry point can bypass it. It also makes the approval step *verifiable*: an approval
   * that exists is one that can be applied.
   */
  /**
   * Persist a lead's approval for one exact previewed plan.
   *
   * **The expiry is validated, not recorded.** Measured 2026-09-26 taking suite 07 (run 4): the lead called
   * `approve_plan` with `expires_at: "2025-12-31T23:59:59Z"` — nine months in the **past**, a date the model
   * chose for itself. Every other field matched the preview, so the approval was recorded and the tool
   * answered `{"status": "approved"}`. It was dead on arrival: `hasPlanApproval` compares
   * `Date.parse(expiresAt) > Date.now()`, so the apply that follows was refused with *"Plan apply requires a
   * non-expired persisted approval"*. The effect on the oracle was total — `plan.previewed` and
   * `plan.approved` are both in the event log with identical fingerprints, no `plan.applied` follows, and
   * durable state held **0 work items**. A tool that reports `approved` for an approval that cannot be used
   * is the same defect shape this suite keeps measuring: the letter of a signal satisfied while the thing it
   * stands for is absent.
   *
   * So an expiry that is absent, unparseable or already past is refused here, with a message the caller can
   * act on — and a caller that omits it gets {@link DEFAULT_PLAN_APPROVAL_WINDOW_MS}, so the common case
   * cannot be got wrong by a model choosing a timestamp.
   */
  recordPlanApproval(input: { projectSlug: string; approvalReference: string; planFingerprint: string; planContentHash: string; agentId: string; expiresAt?: string }): void {
    const preview = this.getPlanPreview(input.approvalReference);
    if (!preview) {
      throw new ProjectStoreError(
        `No previewed plan found for approval reference "${input.approvalReference}". Run submit_intent in preview mode and approve the fingerprint it returned.`,
        "VALIDATION",
      );
    }
    if (preview.planFingerprint !== input.planFingerprint) {
      throw new ProjectStoreError(
        `Approval fingerprint does not match the previewed plan. Preview returned "${preview.planFingerprint}", approval passed "${input.planFingerprint}".`,
        "VALIDATION",
      );
    }
    if (preview.planContentHash !== input.planContentHash) {
      throw new ProjectStoreError(
        `Approval content hash does not match the previewed plan. Preview returned "${preview.planContentHash}", approval passed "${input.planContentHash}".`,
        "VALIDATION",
      );
    }
    if (preview.projectSlug !== input.projectSlug) {
      throw new ProjectStoreError(
        `Approval project does not match the previewed plan. Preview was for "${preview.projectSlug}", approval is for "${input.projectSlug}".`,
        "VALIDATION",
      );
    }
    // The expiry is part of what makes an approval usable, so it is checked before anything is recorded.
    // An approval filed with a past expiry is not a weaker approval; it is not an approval.
    const expiresAt = input.expiresAt?.trim();
    let resolvedExpiry: string;
    if (!expiresAt) {
      resolvedExpiry = new Date(Date.now() + DEFAULT_PLAN_APPROVAL_WINDOW_MS).toISOString();
    } else {
      const parsed = Date.parse(expiresAt);
      if (Number.isNaN(parsed)) {
        throw new ProjectStoreError(
          `Approval expiry "${expiresAt}" is not a date this platform can read. Pass an ISO-8601 timestamp in the future, or omit it for the default ${Math.round(DEFAULT_PLAN_APPROVAL_WINDOW_MS / 3_600_000)}-hour window.`,
          "VALIDATION",
        );
      }
      if (parsed <= Date.now()) {
        throw new ProjectStoreError(
          `Approval expiry "${expiresAt}" has already passed, so the approval could never be applied. Pass a timestamp in the future, or omit it for the default ${Math.round(DEFAULT_PLAN_APPROVAL_WINDOW_MS / 3_600_000)}-hour window.`,
          "VALIDATION",
        );
      }
      resolvedExpiry = new Date(parsed).toISOString();
    }
    this.recordEvent("plan.approved", input.projectSlug, { ...input, expiresAt: resolvedExpiry });
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

  recordObjectiveRequirements(projectId: string, objective: string, requirements: unknown[]): void {
    this.recordEvent("project.objective_requirements", projectId, { projectId, objective, requirements });
  }

  recordObjectiveAudit(projectId: string, report: unknown): void {
    this.recordEvent("project.objective_audit", projectId, { projectId, report });
  }

  hasPassingObjectiveAudit(projectId: string): boolean {
    const rows = this.db.select().from(events).where(and(eq(events.correlationId, projectId), eq(events.eventType, "project.objective_audit"))).all();
    return rows.some((row) => {
      try { return (JSON.parse(row.payloadJson) as { report?: { verdict?: unknown } }).report?.verdict === "pass"; } catch { return false; }
    });
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
    const createdAt = job.createdAt ?? new Date().toISOString();
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
      createdAt,
    }).run();
    return { ...job, createdAt };
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

  /**
   * Every job the store holds, oldest first by id.
   *
   * Added for the operator-facing ledger of what a container's jobs landed (BOARD F-053). The project's
   * work items are **not** a usable index for that question: an item that paused on a gate has its `jobId`
   * cleared and a cancelled item's job was never linked, so listing by pointer hides exactly the jobs whose
   * writes are unaccounted for. This reads the jobs themselves.
   *
   * Read by two surfaces that then resolve it against work items and projects: the read-only
   * `get_job_ledger` tool (F-053) and, since 2026-10-05, the public job list
   * (`GET /api/v1/jobs`, `kampaku jobs list` — [F-078](../../../../docs/eval/results/BOARD.md)).
   */
  listJobs(): JobRecord[] {
    return this.db
      .select()
      .from(jobs)
      .all()
      .map((row) => this.mapJob(row));
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

  /**
   * Whether this worker holds a job whose lease has not run out — i.e. whether it is **busy**.
   *
   * Separate from `workerHasActiveJob`, which is true for a lease that has already expired and is
   * therefore the zombie case rather than the working one. Read by `getRuntimeStatus` to keep a worker
   * that is mid-job counting as online while its heartbeat is, by construction, not being sent: the
   * heartbeat is the poll (`touchWorker`), and the poll does not happen until the job finishes.
   *
   * Measured 2026-10-04 on suite 08's fourth re-run (`s08r11`): a worker that had leased a job and was
   * four minutes into it read as `workersOnline: 0` beside `runningJobs: 1` — the operator's own runtime
   * card reporting an execution plane that had gone away, while it was the thing doing the work.
   *
   * A lease with no recorded expiry is treated as live: the point of the rule is that a working worker
   * is not called gone, and an absent expiry is a missing bound rather than evidence of death. The
   * expiry is what stops a truly dead worker reading as online forever, which is why it is the one
   * signal this reads.
   */
  workerHoldsLiveLease(workerId: string, now: Date = new Date()): boolean {
    const nowIso = now.toISOString();
    return this.db
      .select()
      .from(jobs)
      .all()
      .some(
        (row) =>
          row.workerId === workerId &&
          (row.status === "leased" || row.status === "running") &&
          (!row.leaseExpiresAt || row.leaseExpiresAt >= nowIso),
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

  /**
   * When each of these jobs was first leased or started, by job id — one read, for a list.
   *
   * `getJobStartedAt` answers the same question one job at a time, which is right for a caller that holds
   * one id. A job list holds every id it is about to render, so asking per job would scan the event table
   * once per row (BOARD F-078). `job.started` wins over `job.leased` for a job that has both, which is the
   * order `getJobStartedAt` already defines.
   */
  listJobStartedAt(jobIds: string[]): Map<string, string> {
    const result = new Map<string, string>();
    if (jobIds.length === 0) return result;
    const rows = this.db
      .select()
      .from(events)
      .where(
        and(
          inArray(events.correlationId, jobIds),
          inArray(events.eventType, ["job.started", "job.leased"]),
        ),
      )
      .all()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const leased = new Map<string, string>();
    const started = new Map<string, string>();
    for (const row of rows) {
      if (!row.correlationId) continue;
      if (row.eventType === "job.started") {
        started.set(row.correlationId, row.occurredAt);
      } else if (!leased.has(row.correlationId)) {
        leased.set(row.correlationId, row.occurredAt);
      }
    }
    for (const jobId of jobIds) {
      const at = started.get(jobId) ?? leased.get(jobId);
      if (at) result.set(jobId, at);
    }
    return result;
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

    const evidence = result.output?.evidence;
    if (Array.isArray(evidence) && evidence.length > 0) {
      this.recordEvent("job.evidence_recorded", result.jobId, {
        jobId: result.jobId,
        evidence,
        recordedAt: result.finishedAt,
      });
    }

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

  listJobEvidence(jobId: string): EvidenceRecord[] {
    return this.db.select().from(events)
      .where(and(eq(events.correlationId, jobId), eq(events.eventType, "job.evidence_recorded")))
      .all()
      .flatMap((row) => {
        try {
          const payload = JSON.parse(row.payloadJson) as { evidence?: unknown };
          if (!Array.isArray(payload.evidence)) return [];
          return payload.evidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
            .filter((item) => typeof item.kind === "string" && typeof item.subject === "string" && typeof item.passed === "boolean" && typeof item.observedAt === "string")
            .map((item) => ({ jobId, kind: item.kind as string, subject: item.subject as string, passed: item.passed as boolean, observedAt: item.observedAt as string, criterionId: typeof item.criterionId === "string" ? item.criterionId : undefined, sourceTool: typeof item.sourceTool === "string" ? item.sourceTool : undefined }));
        } catch { return []; }
      });
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
    const seenAt = worker.lastSeenAt ?? worker.registeredAt;
    this.db
      .insert(workers)
      .values({
        id: worker.id,
        name: worker.name ?? null,
        version: worker.version ?? null,
        capabilitiesJson: JSON.stringify(worker.capabilities),
        contractVersion: worker.contractVersion,
        registeredAt: worker.registeredAt,
        lastSeenAt: seenAt,
      })
      .onConflictDoUpdate({
        target: workers.id,
        set: {
          name: worker.name ?? null,
          version: worker.version ?? null,
          capabilitiesJson: JSON.stringify(worker.capabilities),
          contractVersion: worker.contractVersion,
          registeredAt: worker.registeredAt,
          lastSeenAt: seenAt,
        },
      })
      .run();
    this.recordEvent("worker.registered", worker.id, { workerId: worker.id });
    return { ...worker, lastSeenAt: seenAt };
  }

  /**
   * Records that a worker was heard from.
   *
   * The worker polls for work every couple of seconds, so the poll is its heartbeat and there is no
   * separate one to maintain. This is what makes `workersOnline` mean "executing" rather than "has
   * ever registered" — measured 2026-09-29 (BOARD F-074): a worker killed 25 s earlier still counted
   * as online, so the operator's own runtime card reported a live execution plane that was gone, and
   * `scripts/start.sh` could not use the number to tell a started worker from a dead one.
   */
  touchWorker(id: string, at: string): void {
    this.db.update(workers).set({ lastSeenAt: at }).where(eq(workers.id, id)).run();
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
      lastSeenAt: row.lastSeenAt ?? undefined,
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
        lastSeenAt: row.lastSeenAt ?? undefined,
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
      createdAt: row.createdAt ?? undefined,
    };
  }

  /**
   * A destructive request, confirmed in two steps.
   *
   * Measured 2026-09-24 in the suite-04 run: `DELETE /api/v1/agents/s4-lead`,
   * `DELETE /api/v1/projects/s4-demo` and a `PATCH` that reassigned the lead and rewrote the repository
   * list all succeeded with **no actor and no confirmation** — 204, 204, and 200. The tool path had
   * refused the same operations for months, so the boundary held on chat and nowhere else: *"a tool that
   * is denied to an agent but reachable through an ungated REST route is a finding"*.
   *
   * The [security model](../../../../docs/security/security-model.md) says what to do about it, and it does
   * not leave the choice open: these are **gated**, and a gate is *"a named, recorded approval that states
   * the consequence. One unconfirmed turn is never enough."* It also says *"a prohibition that lives only
   * in a prompt is not a prohibition"*, so the gate is here rather than in a reply.
   *
   * The shape is `plan.approved`'s, reused rather than reinvented: a request records what would happen and
   * returns a **token derived from the exact payload**, and consuming it requires re-deriving the same
   * token. So a confirmation cannot be replayed against a different payload, and a token minted for one
   * project cannot delete another.
   */
  recordDestructiveRequest(input: {
    action: string;
    target: string;
    payloadHash: string;
    consequence: string;
  }): { reference: string; confirmationToken: string } {
    const reference = uuidv4();
    const confirmationToken = destructiveToken(reference, input.action, input.target, input.payloadHash);
    this.recordEvent("destructive.requested", reference, { ...input, reference, confirmationToken });
    return { reference, confirmationToken };
  }

  /**
   * The gate. Returns the recorded consequence when the token matches, and `null` otherwise.
   *
   * A `null` return is the ordinary case — an unconfirmed request — so the caller answers with the token it
   * needs rather than with a refusal that says nothing about how to proceed.
   */
  confirmDestructiveAction(input: {
    reference: string;
    confirmationToken: string;
    action: string;
    target: string;
    payloadHash: string;
  }): { consequence: string } | null {
    const requested = this.db
      .select()
      .from(events)
      .where(and(eq(events.eventType, "destructive.requested"), eq(events.correlationId, input.reference)))
      .all();
    const row = requested[0];
    if (!row) return null;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    } catch {
      return null;
    }
    // Every field is compared, so a token minted for one action cannot confirm another, and a payload that
    // changed between the request and the confirmation is not the payload that was confirmed.
    if (payload.action !== input.action) return null;
    if (payload.target !== input.target) return null;
    if (payload.payloadHash !== input.payloadHash) return null;

    const expected = destructiveToken(input.reference, input.action, input.target, input.payloadHash);
    if (expected !== input.confirmationToken) return null;
    if (payload.confirmationToken !== input.confirmationToken) return null;

    // Single use. Without this, one confirmation would authorise the same action forever.
    const consumed = this.db
      .select()
      .from(events)
      .where(eq(events.eventType, "destructive.consumed"))
      .all()
      .some((entry) => entry.correlationId === input.reference);
    if (consumed) return null;

    return { consequence: String(payload.consequence ?? "") };
  }

  /** Marks a confirmation used, so it cannot authorise a second action. */
  consumeDestructiveAction(reference: string, confirmedBy: string): void {
    this.recordEvent("destructive.consumed", reference, { reference, confirmedBy });
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

/**
 * The confirmation token for a destructive action.
 *
 * Derived from the reference **and** the exact payload, so it authorises one action against one target and
 * nothing else. Not a secret and not a signature — it is a commitment: to confirm, the caller has to have
 * seen the request this token belongs to.
 */
export function destructiveToken(
  reference: string,
  action: string,
  target: string,
  payloadHash: string,
): string {
  return createHash("sha256")
    .update([reference, action, target, payloadHash].join("\u0000"))
    .digest("hex");
}

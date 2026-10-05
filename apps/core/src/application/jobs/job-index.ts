import type { JobRecord, Store } from "../../persistence/store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";

/**
 * The public job list (BOARD F-078).
 *
 * The defect this closes was measured three times on suite 08's live instances: a job was readable **by
 * id** — `GET /api/v1/jobs/:jobId` answers 200 — and there was no way to enumerate jobs at all
 * (`GET /api/v1/jobs` → 404), while `GET /api/v1/runtime/status` reported `queuedJobs` and `runningJobs`
 * as bare counts. So the only route to the execution plane was an id the operator already had, and the
 * product's own status surface could not resolve its numbers into the things they counted.
 *
 * Two shapes of job are why a client-side index is not a substitute. `s08-snapshot.sh` — the suite's own
 * instrument — walks the **project tree** and harvests `jobId` off each work item, then reads each job one
 * at a time. That works only while every job is pointed at by an item somebody can walk, and it fails in
 * exactly the cases an operator wants a job list for. Measured on the specimen of the fifth re-run
 * (`.kampaku/runs/s08r12`, 2026-10-04): `s08r12-final.json` records `jobs: {}` — **all three jobs gone
 * from the client-side index**, because each item's `job_id` is cleared once its job settles.
 *
 * So this reads the jobs themselves and, for each one, resolves what it is about from the job's own
 * durable input (`input.context.workItemId`, written at dispatch) rather than from the item's pointer,
 * which can be cleared. What it cannot resolve it reports as `null` and keeps the row: an orphan is a
 * finding, not a row to drop.
 */

export interface JobIndexEntry {
  id: string;
  status: JobRecord["status"];
  taskId: string;
  /** When it was queued; `null` for rows written before the column existed. */
  createdAt: string | null;
  /** First `job.started`, else `job.leased`; `null` while it has never been taken. */
  startedAt: string | null;
  /** The result's `finishedAt`; `null` while the job has no result. */
  finishedAt: string | null;
  leaseExpiresAt: string | null;
  /** The work item the job was dispatched for, resolved from the job's own input. */
  workItemId: string | null;
  workItemTitle: string | null;
  projectId: string | null;
  projectSlug: string | null;
  goalId: string | null;
  workerId: string | null;
  capabilities: string[];
  /** The failure the job recorded, as the per-job route reports it. */
  error: Record<string, unknown> | null;
}

export interface JobIndexPage {
  /** Jobs matching the filters, before `limit`. */
  total: number;
  returned: number;
  /**
   * Every job the store holds by status, filters ignored.
   *
   * This is the half that makes a count resolvable: `runtime/status` says `runningJobs: 1`, and these
   * totals say which status bucket the store is counting at all, so a number that cannot be listed is a
   * number that can be seen to be absent.
   */
  totals: Record<string, number>;
  jobs: JobIndexEntry[];
}

export interface JobIndexFilters {
  /** One or more statuses, or an alias — see `JOB_STATUS_ALIASES`. */
  status?: string[];
  /** A project slug or id. Unattached jobs are found by not passing this. */
  project?: string;
  limit?: number;
  offset?: number;
}

/**
 * Statuses an operator asks for by intent rather than by row value.
 *
 * `runningJobs` on the runtime status route counts `running` **and** `leased`, so an operator who reads
 * `runningJobs: 1` and asks for `status=running` must get the job that is locked by a worker — otherwise
 * the one call the count invites returns an empty list while a job is in flight.
 */
export const JOB_STATUS_ALIASES: Record<string, JobRecord["status"][]> = {
  active: ["queued", "leased", "running", "paused"],
  running: ["leased", "running"],
  done: ["succeeded"],
  terminal: ["succeeded", "failed", "cancelled", "expired"],
};

export const JOB_STATUS_VALUES: JobRecord["status"][] = [
  "queued",
  "leased",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
];

export const JOB_LIST_DEFAULT_LIMIT = 50;
export const JOB_LIST_MAX_LIMIT = 500;

/** Unknown statuses, so the route can refuse rather than answer an empty list that reads like "none". */
export class JobIndexError extends Error {
  constructor(
    message: string,
    readonly code: "VALIDATION" | "NOT_FOUND",
  ) {
    super(message);
    this.name = "JobIndexError";
  }
}

function resolveStatuses(status: string[] | undefined): Set<JobRecord["status"]> | undefined {
  if (!status || status.length === 0) return undefined;
  const wanted = new Set<JobRecord["status"]>();
  for (const raw of status) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const alias = JOB_STATUS_ALIASES[value];
    if (alias) {
      for (const s of alias) wanted.add(s);
      continue;
    }
    if (!JOB_STATUS_VALUES.includes(value as JobRecord["status"])) {
      throw new JobIndexError(
        `Unknown status "${raw}". Known statuses: ${JOB_STATUS_VALUES.join(", ")}; ` +
          `aliases: ${Object.keys(JOB_STATUS_ALIASES).join(", ")}.`,
        "VALIDATION",
      );
    }
    wanted.add(value as JobRecord["status"]);
  }
  return wanted.size > 0 ? wanted : undefined;
}

function stringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The job's own durable linkage: what it was dispatched for. */
function jobContext(job: JobRecord): Record<string, unknown> {
  const context = job.input?.context;
  return typeof context === "object" && context !== null
    ? (context as Record<string, unknown>)
    : {};
}

export function listJobIndex(
  store: Store,
  pmStore: PmStore,
  filters: JobIndexFilters = {},
): JobIndexPage {
  const wanted = resolveStatuses(filters.status);

  const all = store.listJobs();
  const totals: Record<string, number> = {};
  for (const status of JOB_STATUS_VALUES) totals[status] = 0;
  for (const job of all) totals[job.status] = (totals[job.status] ?? 0) + 1;

  let projectId: string | null = null;
  if (filters.project) {
    const project = store.getProjectByIdOrSlug(filters.project);
    if (!project) {
      throw new JobIndexError(`Project "${filters.project}" not found.`, "NOT_FOUND");
    }
    projectId = project.id;
  }

  // One pass over the items, and the two pointers a job can have: its own input (durable) and the item's
  // `jobId` (cleared when the item settles or pauses on a gate). The input wins.
  const items = pmStore.listAllWorkItems();
  const itemById = new Map<string, WorkItemRecord>();
  const itemByJobId = new Map<string, WorkItemRecord>();
  const projectSlugById = new Map<string, string>(
    store.listProjects().map((project) => [project.id, project.slug]),
  );
  for (const item of items) {
    itemById.set(item.id, item);
    if (item.jobId) itemByJobId.set(item.jobId, item);
  }

  const startedAtByJob = store.listJobStartedAt(all.map((job) => job.id));

  const rows: JobIndexEntry[] = [];
  for (const job of all) {
    if (wanted && !wanted.has(job.status)) continue;
    const context = jobContext(job);
    const contextItemId = stringField(context, "workItemId");
    const item =
      (contextItemId ? itemById.get(contextItemId) : undefined) ?? itemByJobId.get(job.id) ?? undefined;
    const goalId = stringField(context, "goalId") ?? item?.goalId ?? null;
    // A goal-level job (`kampaku run`, `POST /api/v1/goals`) carries no work item, so the item is not the
    // only place its project lives — the goal names one. A job with neither stays unattached.
    const rowProjectId =
      item?.projectId ?? (goalId ? (store.getGoal(goalId)?.projectId ?? null) : null);

    // A project filter is a narrowing the operator asked for. A job with no item and no goal carries no
    // project, so it is *not* in a project-filtered list — it is found by asking for the list without a
    // filter, which is the default (`GET /api/v1/jobs`). Stated in the route's doc and asserted by the
    // lock.
    if (projectId && rowProjectId !== projectId) continue;

    const result = store.getJobResult(job.id);
    rows.push({
      id: job.id,
      status: job.status,
      taskId: job.taskId,
      createdAt: job.createdAt ?? null,
      startedAt: startedAtByJob.get(job.id) ?? null,
      finishedAt: result?.finishedAt ?? null,
      leaseExpiresAt: job.leaseExpiresAt ?? null,
      workItemId: item?.id ?? contextItemId ?? null,
      workItemTitle: item?.title ?? null,
      projectId: rowProjectId,
      projectSlug: rowProjectId ? (projectSlugById.get(rowProjectId) ?? null) : null,
      goalId,
      workerId: job.workerId ?? null,
      capabilities: job.capabilities,
      error: result?.error ?? null,
    });
  }

  // Newest first, by the time it was queued — falling back to the first time it was taken, then to when
  // it finished, for rows written before the queue time was recorded. Ties break on id, so the order is
  // stable across calls.
  const sortKey = (row: JobIndexEntry) => row.createdAt ?? row.startedAt ?? row.finishedAt ?? "";
  rows.sort((a, b) => {
    const byTime = sortKey(b).localeCompare(sortKey(a));
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });

  const total = rows.length;
  const limit = Math.min(
    Math.max(1, Math.trunc(filters.limit ?? JOB_LIST_DEFAULT_LIMIT)),
    JOB_LIST_MAX_LIMIT,
  );
  const offset = Math.max(0, Math.trunc(filters.offset ?? 0));
  const page = rows.slice(offset, offset + limit);

  return { total, returned: page.length, totals, jobs: page };
}

/** Parses `status` (`a` or `a,b`, repeatable) and `limit`/`offset` off a query, refusing what it cannot. */
export function parseJobIndexQuery(query: {
  status?: string | string[];
  project?: string;
  limit?: string;
  offset?: string;
}): JobIndexFilters {
  const rawStatus = query.status;
  const statusList =
    rawStatus === undefined
      ? undefined
      : (Array.isArray(rawStatus) ? rawStatus : [rawStatus])
          .flatMap((value) => value.split(","))
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

  const number = (value: string | undefined, field: string): number | undefined => {
    if (value === undefined || value === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new JobIndexError(`${field} must be a non-negative number.`, "VALIDATION");
    }
    return parsed;
  };

  return {
    status: statusList,
    project: query.project?.trim() || undefined,
    limit: number(query.limit, "limit"),
    offset: number(query.offset, "offset"),
  };
}

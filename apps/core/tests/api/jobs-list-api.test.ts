import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { CoreClient } from "../../src/client/core-client.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore, type WorkItemRecord } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * The public job list — BOARD F-078, the oracle bullet suite 08 has failed on three runs.
 *
 * Measured 2026-09-30 and again on 2026-10-04 (`s08r12`): `GET /api/v1/jobs` → **404**,
 * `GET /api/v1/jobs?status=running` → 404, `kampaku jobs --help` offered only `show <jobId>` and
 * `watch <jobId>`, while `GET /api/v1/runtime/status` reported `queuedJobs`/`runningJobs` as counts. A job
 * was readable exactly when you already had its id — the suite's own sentence for that is *"a job that
 * exists only by id is a finding"*.
 *
 * Three shapes are asserted, each measured on that specimen rather than invented here:
 *
 * 1. **The count resolves.** `runningJobs` counts `running` + `leased`, so `?status=running` must return
 *    the job a worker holds, or the one call the count invites comes back empty while work is in flight.
 * 2. **A settled job whose item no longer points at it is still listed.** On `s08r12` every work item's
 *    `job_id` is `null` once its job settles — `s08r12-final.json` records `jobs: {}` from the suite's
 *    client-side index, which walks the tree and harvests `jobId` — so the linkage is read from the job's
 *    own input (`input.context.workItemId`, written at dispatch).
 * 3. **A job no work item points at is still reachable**, with `workItemId: null`, and it is found by not
 *    filtering: a project filter narrows to that project's items and an unattached job belongs to none.
 *    That is precisely the case the client-side index cannot reach, and the reason an operator wants a
 *    list at all.
 */

describe("public job list (BOARD F-078)", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-jobs-list-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
      coreUrl: "http://test",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    bootstrapProject(store, config);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
    const fetchFn: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      return app.request(url.replace("http://test", ""), init);
    };
    const client = new CoreClient({ baseUrl: "http://test", fetch: fetchFn });
    return { app, client, store, pmStore };
  }

  function openProject(
    f: ReturnType<typeof fixture>,
    slug: string,
  ): { projectId: string } {
    const now = new Date().toISOString();
    const id = `${slug}-project`;
    f.store.createProject({
      id,
      slug,
      name: slug,
      status: "planning",
      repositories: [{ url: `file:///tmp/${slug}`, role: "core" }],
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: id };
  }

  function workItem(projectId: string, id: string, title: string, jobId?: string): WorkItemRecord {
    const now = new Date().toISOString();
    return {
      id,
      projectId,
      title,
      status: "done",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      frozenPaths: [],
      dependsOn: [],
      jobId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** A queued job, dispatched for a work item — the shape `createGoalWithPlan` writes. */
  function queueJob(
    f: ReturnType<typeof fixture>,
    jobId: string,
    context: { workItemId?: string; goalId?: string },
    createdAt: string,
  ): string {
    f.store.createJob({
      id: jobId,
      taskId: `task-${jobId}`,
      status: "queued",
      capabilities: ["code.agent"],
      input: { prompt: "do the thing", repositoryRole: "core", context },
      idempotencyKey: jobId,
      createdAt,
    });
    return jobId;
  }

  function settle(
    f: ReturnType<typeof fixture>,
    jobId: string,
    status: "succeeded" | "failed",
    finishedAt: string,
    error?: Record<string, unknown>,
  ): void {
    f.store.markJobRunning(jobId);
    f.store.submitJobResult({
      jobId,
      leaseId: `${jobId}-lease`,
      status,
      output: { summary: "done" },
      error,
      finishedAt,
    });
  }

  it("lists a job with no id in hand, naming the item it was for and its times", async () => {
    const f = fixture();
    const { projectId } = openProject(f, "listing");
    // The measured shape: the item settled, so its pointer to the job is gone.
    f.pmStore.createWorkItem(workItem(projectId, "wi-1", "Implement the CLI entry point"));
    queueJob(
      f,
      "job-settled",
      { workItemId: "wi-1", goalId: "goal-1" },
      "2026-10-04T23:45:00.000Z",
    );
    settle(f, "job-settled", "succeeded", "2026-10-04T23:46:25.361Z");
    expect(f.pmStore.getWorkItemByJobId("job-settled"), "the item no longer points at the job").toBeUndefined();

    const response = await f.app.request("/api/v1/jobs");
    expect(response.status, "GET /api/v1/jobs answers").toBe(200);
    const body = (await response.json()) as {
      total: number;
      returned: number;
      totals: Record<string, number>;
      jobs: Array<Record<string, unknown>>;
    };

    expect(body.jobs.map((job) => job.id)).toContain("job-settled");
    const row = body.jobs.find((job) => job.id === "job-settled")!;
    expect(row.status).toBe("succeeded");
    expect(row.workItemId).toBe("wi-1");
    expect(row.workItemTitle).toBe("Implement the CLI entry point");
    expect(row.projectSlug).toBe("listing");
    expect(row.goalId).toBe("goal-1");
    expect(row.createdAt).toBe("2026-10-04T23:45:00.000Z");
    expect(row.startedAt, "the start comes from the job's own lifecycle event").toBeTruthy();
    expect(row.finishedAt).toBe("2026-10-04T23:46:25.361Z");
    expect(body.totals.succeeded, "the counts are resolvable").toBeGreaterThanOrEqual(1);
  });

  it("resolves runningJobs into the job that is running", async () => {
    const f = fixture();
    const { projectId } = openProject(f, "running");
    f.pmStore.createWorkItem(workItem(projectId, "wi-run", "Long running leaf"));
    f.store.createJob({
      id: "job-held",
      taskId: "task-held",
      status: "leased",
      leaseId: "lease-held",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workerId: "worker-1",
      capabilities: ["code.agent"],
      input: { prompt: "work", repositoryRole: "core", context: { workItemId: "wi-run" } },
      createdAt: new Date().toISOString(),
    });

    const runtime = (await (await f.app.request("/api/v1/runtime/status")).json()) as {
      runningJobs: number;
    };
    expect(runtime.runningJobs, "the status route counts the job").toBe(1);

    const response = await f.app.request("/api/v1/jobs?status=running");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { total: number; jobs: Array<{ id: string; status: string }> };
    // `leased` is what a worker holds; the runtime count adds it to `running`, so the alias must too.
    expect(body.jobs.map((job) => job.id)).toEqual(["job-held"]);
    expect(body.jobs[0].status).toBe("leased");
    expect(body.total).toBe(1);
  });

  it("still lists a job no work item points at, and says it is unattached", async () => {
    const f = fixture();
    const { projectId } = openProject(f, "orphans");
    f.pmStore.createWorkItem(workItem(projectId, "wi-2", "A leaf of this project"));
    queueJob(f, "job-attached", { workItemId: "wi-2" }, "2026-10-04T23:40:00.000Z");
    // No work item anywhere carries this job id, and its own input names no item: an orphan.
    queueJob(f, "job-orphan", {}, "2026-10-04T23:41:00.000Z");

    const all = (await (await f.app.request("/api/v1/jobs")).json()) as {
      jobs: Array<{ id: string; workItemId: string | null; projectSlug: string | null }>;
    };
    const orphan = all.jobs.find((job) => job.id === "job-orphan");
    expect(orphan, "the unfiltered list is where an unattached job is found").toBeDefined();
    expect(orphan!.workItemId).toBeNull();
    expect(orphan!.projectSlug).toBeNull();

    // A project filter is a narrowing the operator asked for, so it does not contain the orphan — which is
    // why the route's default (no filter) is the complete list.
    const filtered = (await (await f.app.request("/api/v1/jobs?project=orphans")).json()) as {
      jobs: Array<{ id: string }>;
    };
    expect(filtered.jobs.map((job) => job.id)).toEqual(["job-attached"]);
  });

  it("attributes a goal-level job to its goal's project, and leaves a true orphan unattached", async () => {
    const f = fixture();
    const { projectId } = openProject(f, "goal-run");
    // The shape `kampaku run` and `POST /api/v1/goals` produce: a goal on a project, a job under it, and
    // no work item anywhere — measured live on the s08r12 instance, where `GET /api/v1/jobs?status=running`
    // returned exactly this row while a job was in flight (probe job `96eece88`, `workItemTitle: null`).
    f.store.createGoal({
      id: "goal-run-1",
      projectId,
      objective: "Add a probe note",
      priority: 0,
      status: "active",
      createdAt: "2026-10-05T00:34:00.000Z",
    });
    queueJob(f, "job-goal", { goalId: "goal-run-1" }, "2026-10-05T00:34:06.000Z");

    const all = (await (await f.app.request("/api/v1/jobs")).json()) as {
      jobs: Array<{ id: string; workItemId: string | null; workItemTitle: string | null; projectSlug: string | null }>;
    };
    const row = all.jobs.find((job) => job.id === "job-goal")!;
    expect(row.workItemId, "still no work item points at it").toBeNull();
    expect(row.workItemTitle).toBeNull();
    expect(row.projectSlug, "but its goal names the project it belongs to").toBe("goal-run");

    const filtered = (await (await f.app.request("/api/v1/jobs?project=goal-run")).json()) as {
      jobs: Array<{ id: string }>;
    };
    expect(filtered.jobs.map((job) => job.id)).toEqual(["job-goal"]);
  });

  it("agrees with the CLI, which reads the same route", async () => {
    const f = fixture();
    const { projectId } = openProject(f, "agree");
    f.pmStore.createWorkItem(workItem(projectId, "wi-3", "A leaf"));
    queueJob(f, "job-a", { workItemId: "wi-3" }, "2026-10-04T23:42:00.000Z");
    settle(f, "job-a", "failed", "2026-10-04T23:43:00.000Z", { code: "BOOM", message: "check failed" });

    const route = (await (await f.app.request("/api/v1/jobs")).json()) as { jobs: Array<{ id: string }> };
    const cli = await f.client.listJobs();
    expect(cli.jobs.map((job) => job.id)).toEqual(route.jobs.map((job) => job.id));
    const row = cli.jobs.find((job) => job.id === "job-a")!;
    expect(row.status).toBe("failed");
    expect(row.error, "the failure a job recorded rides in the list").toMatchObject({ code: "BOOM" });

    const filtered = await f.client.listJobs({ status: "failed", project: "agree" });
    expect(filtered.jobs.map((job) => job.id)).toEqual(["job-a"]);
  });

  it("refuses a status or a project it cannot resolve instead of answering an empty list", async () => {
    const f = fixture();
    openProject(f, "refusals");

    const badStatus = await f.app.request("/api/v1/jobs?status=almost-done");
    expect(badStatus.status).toBe(400);
    const statusBody = (await badStatus.json()) as { error: string; code: string };
    expect(statusBody.code).toBe("VALIDATION");
    expect(statusBody.error, "the refusal names what is accepted").toContain("running");

    const badProject = await f.app.request("/api/v1/jobs?project=no-such-project");
    expect(badProject.status).toBe(404);
    expect(((await badProject.json()) as { code: string }).code).toBe("NOT_FOUND");
  });
});

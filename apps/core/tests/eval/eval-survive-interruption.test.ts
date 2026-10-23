import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store, type JobRecord } from "../../src/persistence/store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { createProject } from "../../src/application/projects.js";
import {
  LEASE_ABANDONED_CODE,
  recoverAbandonedJobsForWorker,
  recoverAbandonedJobsOnBoot,
} from "../../src/application/jobs/job-recovery.js";
import {
  WORK_ITEM_CANCELLED_CODE,
  cancelJobsForWorkItem,
  isCancellableJobStatus,
} from "../../src/application/jobs/work-item-jobs.js";
import { executeUpdateWorkItem } from "../../src/agents/runtime/tools/update-work-item.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import {
  missingExpectedLines,
  normalizeStatedLine,
} from "../../src/application/pm/verify-work-item.js";

/**
 * Suite 13 — **survive interruption**. The suite's own lock, for the boxes its first run left open.
 *
 * Measured 2026-10-23 on run `s13r1` (fresh data dir, git `33ef016`, `deepseek-flash`, fixture
 * `/home/pdonoso/projects/eval-seed-py`), driving the suite's own beats: a plan of eight work items was
 * applied and executed, the platform was paused and resumed, and then the worker and Core were `kill -9`ed
 * with job `478faa26` in flight and the stack was relaunched ten seconds later. What the run measured:
 *
 * 1. **The killed job still read `running` after the restart**, with no `finishedAt` and no `error`, on every
 *    surface — `GET /api/v1/jobs`, `GET /api/v1/projects/textstats/execution`, chat, and the CLI. The suite's
 *    promise is that this state is truthful *after a restart*: `expired`, lost, or explicitly unknown.
 *    Nothing on serve reconciled it; the `recoverJobsAfterRestart` the suite's automated-tests row names did
 *    not exist in the tree.
 * 2. **The dead job wedged the execution plane.** A replacement job queued for the same leaf could not be
 *    leased, because `leaseNextJob` returns early while `workerHasActiveJob(workerId)` is true — and the
 *    killed job was still "active" under the same worker id. Measured 1 m 43 s of a queue that never moved,
 *    with the worker online and polling; with the shipped 30-minute lease it would have been half an hour.
 * 3. **`zombieJobs` answered `0`** in the same `runtime/status` object that said `runningJobs: 1`, because it
 *    counts only leases that have already expired.
 * 4. **Cancel did not stop the job.** Asked to cancel the running work, the front office cancelled the leaf
 *    and its container through the lead — and the job in flight kept running, because no surface in the line
 *    holds a job-cancel operation. (The web UI's job controls and `POST /api/v1/jobs/:id/cancel` do; the CLI
 *    had no verb at all, so *"cancel is reachable from chat, CLI and web"* failed on two of three.)
 * 5. **A verification that passed was reported as failed.** Leaf `dca26c54`'s criterion states its expected
 *    stdout as `one<TAB>2` / `two<TAB>1`; `kampaku projects verify` ran the pipeline, the checkout printed
 *    `one\t2` / `two\t1`, and the surface answered *"exited 0 but did not print `one<TAB>2`, `two<TAB>1`"* —
 *    a false accusation about an artifact that is right, which this lab treats as worse than a miss.
 *
 * Each case below is one of those five, asserted against the mechanism rather than against a run's prose.
 */

describe("work survives the process that ran it, or is reported lost", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-survive-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const skillStore = new SkillStore(db);
    const journalStore = new JournalStore(db);
    return { store, pmStore, agentStore, skillStore, journalStore, config };
  }

  const WORKER_ID = "00000000-0000-4000-8000-000000000001";

  function seedLeaf(
    deps: ReturnType<typeof createStores>,
    slug: string,
  ): { projectId: string; leafId: string } {
    const { store, pmStore, agentStore } = deps;
    const project = createProject(store, { slug, name: slug, status: "active" });
    const kampaku = agentStore.getKampakuAgent();
    const leafId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: leafId,
      projectId: project.id,
      title: `leaf ${slug}`,
      description: "a leaf",
      status: "in_progress",
      priority: 1,
      sortOrder: 1,
      assigneeAgentId: kampaku?.id,
      assignedByAgentId: kampaku?.id,
      acceptanceCriteria: ["`make check` exits 0."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: project.id, leafId };
  }

  function job(deps: ReturnType<typeof createStores>, workItemId: string | undefined): JobRecord {
    const id = uuidv4();
    const record: JobRecord = {
      id,
      taskId: uuidv4(),
      status: "running",
      capabilities: ["code.agent"],
      input: {
        context: workItemId ? { workItemId } : {},
      } as JobRecord["input"],
      workerId: WORKER_ID,
      leaseId: uuidv4(),
      // Deliberately **not** expired: the whole point is a lease that has not run out yet.
      leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    return deps.store.createJob(record);
  }

  it("expires a job a dead process left running, and stops claiming the item is in flight", () => {
    const deps = createStores();
    const { leafId } = seedLeaf(deps, "survive-boot");
    const killed = job(deps, leafId);
    // The item points at the job it dispatched, which is how a settle reaches it.
    deps.pmStore.updateWorkItem(leafId, { jobId: killed.id });
    expect(deps.store.getJob(killed.id)?.status).toBe("running");

    const recovery = recoverAbandonedJobsOnBoot({
      store: deps.store,
      pmStore: deps.pmStore,
      journalStore: deps.journalStore,
      completionCtx: { agentStore: deps.agentStore, store: deps.store },
    });

    const after = deps.store.getJob(killed.id);
    expect(after?.status).toBe("expired");
    const result = deps.store.getJobResult(killed.id);
    expect((result?.error as { code?: string } | undefined)?.code).toBe(LEASE_ABANDONED_CODE);
    // Lost work is reported as lost, and the item stops reading as work in flight.
    expect(recovery.recoveredJobs).toContain(killed.id);
    expect(deps.pmStore.getWorkItem(leafId)?.status).not.toBe("in_progress");
    // The item keeps naming the job it lost, so the operator can read what happened to it rather than infer it.
    expect(deps.pmStore.getWorkItem(leafId)?.jobId).toBe(killed.id);
  });

  it("leaves a settled job's record alone, which is the control", () => {
    const deps = createStores();
    const { leafId } = seedLeaf(deps, "survive-control");
    const settled = job(deps, leafId);
    deps.store.submitJobResult({
      jobId: settled.id,
      leaseId: settled.leaseId!,
      status: "succeeded",
      output: { summary: "done" },
      finishedAt: new Date().toISOString(),
    });

    recoverAbandonedJobsOnBoot({ store: deps.store, pmStore: deps.pmStore });

    expect(deps.store.getJob(settled.id)?.status).toBe("succeeded");
  });

  it("lets a worker that re-registers lease again, instead of refusing it the whole lease", () => {
    const deps = createStores();
    const { leafId } = seedLeaf(deps, "survive-queue");
    const killed = job(deps, leafId);

    // The measured stall: while the killed job is "active" under this worker id, `leaseNextJob` refuses.
    const queued = deps.store.createJob({
      id: uuidv4(),
      taskId: uuidv4(),
      status: "queued",
      capabilities: ["code.agent"],
      input: { context: { workItemId: leafId } } as JobRecord["input"],
      createdAt: new Date().toISOString(),
    });
    expect(deps.store.leaseNextJob(WORKER_ID, ["code.agent"])).toBeUndefined();

    const recovery = recoverAbandonedJobsForWorker(
      { store: deps.store, pmStore: deps.pmStore, completionCtx: { agentStore: deps.agentStore, store: deps.store } },
      WORKER_ID,
    );

    expect(recovery.recoveredJobs).toEqual([killed.id]);
    expect(deps.store.getJob(killed.id)?.status).toBe("expired");
    // …and now the queue moves: the replacement job is leasable in the same breath.
    expect(deps.store.leaseNextJob(WORKER_ID, ["code.agent"])?.id).toBe(queued.id);
  });

  it("cancels the job when the work item it was dispatched for is cancelled", () => {
    const deps = createStores();
    const { leafId } = seedLeaf(deps, "survive-cancel");
    const inFlight = job(deps, leafId);
    const ctx = {
      store: deps.store,
      pmStore: deps.pmStore,
      agentStore: deps.agentStore,
      skillStore: deps.skillStore,
      journalStore: deps.journalStore,
    } as unknown as KampakuToolContext;

    const updated = executeUpdateWorkItem(ctx, { work_item_id: leafId, status: "cancelled" });

    expect(updated.status).toBe("cancelled");
    const after = deps.store.getJob(inFlight.id);
    expect(after?.status).toBe("cancelled");
    const result = deps.store.getJobResult(inFlight.id);
    expect((result?.error as { code?: string } | undefined)?.code).toBe(WORK_ITEM_CANCELLED_CODE);
    expect(updated.cancelledJobs).toEqual([inFlight.id]);
  });

  it("does not cancel a job dispatched for another item, which is the control", () => {
    const deps = createStores();
    const { leafId } = seedLeaf(deps, "survive-cancel-a");
    const other = seedLeaf(deps, "survive-cancel-b");
    const ours = job(deps, leafId);
    const theirs = job(deps, other.leafId);

    const cancelled = cancelJobsForWorkItem(deps.store, leafId);

    expect(cancelled.map((result) => result.jobId)).toEqual([ours.id]);
    expect(deps.store.getJob(theirs.id)?.status).toBe("running");
    expect(isCancellableJobStatus("running")).toBe(true);
    expect(isCancellableJobStatus("succeeded")).toBe(false);
  });

  it("reads a criterion's states-tab output as the artifact actually prints it", () => {
    // The exact spelling the plan wrote on `s13r1`, and the bytes the checkout printed.
    expect(normalizeStatedLine("one<TAB>2")).toBe("one\t2");
    expect(missingExpectedLines(["one<TAB>2", "two<TAB>1"], "one\t2\ntwo\t1\n")).toEqual([]);
    expect(missingExpectedLines(["one\\t2"], "one\t2\n")).toEqual([]);
    // The control: a line the artifact did not print is still missing, tab or no tab.
    expect(missingExpectedLines(["one<TAB>3"], "one\t2\n")).toEqual(["one<TAB>3"]);
    expect(missingExpectedLines(["total_words=3 distinct_words=2"], "total_words=3\n")).toEqual([
      "total_words=3 distinct_words=2",
    ]);
  });

  it("runs the recovery on the two moments that make a lease abandoned", () => {
    const serve = readFileSync(join(process.cwd(), "src/cli/commands/serve.ts"), "utf8");
    const app = readFileSync(join(process.cwd(), "src/api/app.ts"), "utf8");
    // Core starting up: nothing held a lease before it existed.
    expect(serve).toContain("recoverAbandonedJobsOnBoot(");
    // A worker registering: it runs one job at a time, so its own active job belongs to a dead process.
    expect(app).toContain("recoverAbandonedJobsForWorker(");
    expect(app).toContain('app.post("/api/v1/workers"');
  });

  it("exposes cancel as a CLI verb, because two surfaces of three is not 'reachable'", () => {
    const jobsCommand = readFileSync(
      join(process.cwd(), "src/cli/commands/jobs.ts"),
      "utf8",
    );
    const client = readFileSync(join(process.cwd(), "src/client/core-client.ts"), "utf8");
    expect(jobsCommand).toContain('.command("cancel")');
    expect(jobsCommand).toContain("client.cancelJob");
    expect(client).toContain("async cancelJob(");
    expect(client).toContain("/cancel`");
  });
});

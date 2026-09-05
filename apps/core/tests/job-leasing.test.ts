import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { createDb } from "../src/persistence/db.js";
import { Store } from "../src/persistence/store.js";

describe("job leasing", () => {
  const dirs: string[] = [];

  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function createStore() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-job-leasing-"));
    dirs.push(dir);
    const { db, sqlite } = createDb(join(dir, "test.db"));
    return { store: new Store(db), sqlite, dir };
  }

  function seedQueuedJob(store: Store, capabilities: string[] = ["code.agent"]) {
    const goalId = uuidv4();
    const taskId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();
    store.createGoal({
      id: goalId,
      projectId: uuidv4(),
      objective: "Test",
      priority: 0,
      status: "active",
      createdAt: now,
    });
    store.createTask({
      id: taskId,
      goalId,
      title: "Run",
      status: "ready",
      input: { prompt: "Do work" },
    });
    store.createJob({
      id: jobId,
      taskId,
      status: "queued",
      capabilities,
      input: { prompt: "Do work", repositoryRole: "core" },
    });
    return jobId;
  }

  it("does not lease a second job while the worker already has an active job", () => {
    const { store } = createStore();
    const workerId = uuidv4();
    const firstJobId = seedQueuedJob(store);
    const secondJobId = seedQueuedJob(store);

    const leased = store.leaseNextJob(workerId, ["code.agent"]);
    expect(leased?.id).toBe(firstJobId);
    store.markJobRunning(firstJobId);

    expect(store.leaseNextJob(workerId, ["code.agent"])).toBeUndefined();
    expect(store.getJob(secondJobId)?.status).toBe("queued");
  });

  it("expires stale leased jobs instead of re-queueing zombies", () => {
    const { store, sqlite } = createStore();
    const workerId = uuidv4();
    const staleJobId = seedQueuedJob(store);

    store.leaseNextJob(workerId, ["code.agent"]);
    store.markJobRunning(staleJobId);

    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    sqlite
      .prepare("UPDATE jobs SET lease_expires_at = ? WHERE id = ?")
      .run(expiredAt, staleJobId);

    expect(store.reclaimExpiredLeases()).toBe(1);
    expect(store.getJob(staleJobId)?.status).toBe("expired");
    expect(store.workerHasActiveJob(workerId)).toBe(false);
    expect(store.listExpiredActiveJobs()).toHaveLength(0);
  });

  it("skips incompatible queued jobs and leases the next compatible one", () => {
    const { store } = createStore();
    const workerId = uuidv4();
    seedQueuedJob(store, ["cursor.agent"]);
    const compatibleJobId = seedQueuedJob(store, ["code.agent"]);

    const leased = store.leaseNextJob(workerId, ["code.agent"]);
    expect(leased?.id).toBe(compatibleJobId);
  });
});

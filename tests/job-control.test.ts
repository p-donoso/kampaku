import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { cancelJob, pauseJob, resumeJob } from "../src/application/jobs/job-control.js";
import { createDb } from "../src/persistence/db.js";
import { Store } from "../src/persistence/store.js";

describe("job control", () => {
  const dirs: string[] = [];

  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function createStore() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-job-control-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    return new Store(db);
  }

  function seedJob(store: Store, status: Store extends never ? never : Parameters<Store["createJob"]>[0]["status"]) {
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
      status,
      capabilities: ["code.agent"],
      input: { prompt: "Do work", repositoryRole: "core" },
      leaseId: status === "running" ? uuidv4() : undefined,
      workerId: status === "running" ? uuidv4() : undefined,
    });
    if (status === "running") store.markJobRunning(jobId);
    return jobId;
  }

  it("pauses and resumes a running job", () => {
    const store = createStore();
    const jobId = seedJob(store, "running");

    const paused = pauseJob(store, jobId);
    expect(paused.status).toBe("paused");
    expect(store.getJob(jobId)?.leaseId).toBeUndefined();

    const resumed = resumeJob(store, jobId);
    expect(resumed.status).toBe("queued");
  });

  it("cancels a queued job", () => {
    const store = createStore();
    const jobId = seedJob(store, "queued");

    const result = cancelJob(store, jobId);
    expect(result.status).toBe("cancelled");
    expect(store.getJob(jobId)?.status).toBe("cancelled");
  });
});

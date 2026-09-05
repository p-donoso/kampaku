import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { createDb } from "../src/persistence/db.js";
import { Store } from "../src/persistence/store.js";
import { getGoalAudit } from "../src/application/goals.js";

describe("job progress logs", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("stores logs and exposes them through goal audit", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-job-progress-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    const goalId = uuidv4();
    const taskId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();

    store.createGoal({
      id: goalId,
      projectId: uuidv4(),
      objective: "Test goal",
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
      status: "running",
      leaseId: uuidv4(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workerId: uuidv4(),
      capabilities: ["code.agent"],
      input: { prompt: "Do work", repositoryRole: "core" },
    });
    store.markJobRunning(jobId);
    store.appendJobLog(jobId, "Iteration 1: calling model…");
    store.appendJobLog(jobId, "Tool read_file(path=README.md)");

    const audit = getGoalAudit(store, goalId);
    expect(audit?.jobs[0].logs).toHaveLength(3);
    expect(audit?.jobs[0].logs.at(-1)?.line).toContain("read_file");
    expect(audit?.jobs[0].startedAt).toBeTruthy();
  });
});

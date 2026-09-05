import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recallLearningsForJob, recordWorkerFailureLearning } from "../src/application/pm/job-memory.js";
import { createDb } from "../src/persistence/db.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import type { WorkItemRecord } from "../src/persistence/pm-store.js";

describe("job memory", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("records worker failures as learnings and recalls them into a prompt block", () => {
    dir = mkdtempSync(join(tmpdir(), "kampaku-job-memory-"));
    const { db } = createDb(join(dir, "t.db"));
    const memory = new MemoryStore(db);
    const workItem: WorkItemRecord = {
      id: "w1",
      projectId: "p1",
      title: "Add endpoint",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: "agent-1",
      acceptanceCriteria: ["npm test succeeds"],
      dependsOn: [],
      createdAt: "",
      updatedAt: "",
    };

    recordWorkerFailureLearning(memory, workItem, {
      jobId: "job-1",
      leaseId: "lease-1",
      status: "failed",
      error: { code: "WORKER_CHECKS_INCOMPLETE", message: "Required checks not run: test." },
      finishedAt: new Date().toISOString(),
    });

    const block = recallLearningsForJob(memory, workItem);
    expect(block).toContain("WORKER_CHECKS_INCOMPLETE");
    expect(block).toContain("Add endpoint");
  });
});

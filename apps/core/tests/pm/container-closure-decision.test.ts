import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { decideWorkItemClosure } from "../../src/application/pm/execute-work-item.js";
import { createProject } from "../../src/application/projects.js";

/**
 * **A container's closure is not decided against its child's job.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r17`. The journal anchors a leaf's entries to its container, and the
 * closure decision asks the journal for the item's latest completed job — so the Phase R container was handed L1's
 * job, decided against L1's result, and reported under its own id and title as
 * `Blocked on evidence (evidence_failed): Structured evidence failed: test.` with the clearing command
 * `retry a03bcf62` — which the platform refuses, because a container cannot be retried. The block was legible and
 * wrong on both halves: the finding was the child's, and the command could not be run.
 *
 * A container with children is judged by them (`rollupDerivedStatusForItemAndAncestors`), and what an operator reads
 * for it is what it is *waiting on* (`describeContainerBlock`). Deciding it against a child's settled job is neither.
 */
describe("the closure decision for a container (suite 19 / s19r17)", () => {
  let dataDir: string | undefined;
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-container-closure-"));
    const config = loadConfig({ dataDir, dbPath: join(dataDir, "kampaku.db") });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const project = createProject(store, { slug: "legacy", name: "Legacy", status: "active" } as never);
    const lead = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    return { store, pmStore, agentStore, journalStore, project, lead, now };
  }

  it("reports no settled job for the container, and the child's own job for the child", () => {
    const f = fixture();
    const containerId = "a03bcf62-545e-4c31-915a-7de325968b2d";
    const leafId = "6ddaaba3-2e39-4ecd-a07c-b13c8d53d7bb";
    f.pmStore.createWorkItem({
      id: containerId,
      projectId: f.project.id,
      title: "Phase R — Constraint-bound repair",
      status: "blocked",
      priority: 3,
      sortOrder: 1,
      assigneeAgentId: f.lead.id,
      assignedByAgentId: f.lead.id,
      acceptanceCriteria: ["Every child of this phase is done."],
      dependsOn: [],
      createdAt: f.now,
      updatedAt: f.now,
    });
    f.pmStore.createWorkItem({
      id: leafId,
      projectId: f.project.id,
      parentId: containerId,
      title: "L1 — Baseline evidence: reproduce both failures",
      status: "todo",
      priority: 3,
      sortOrder: 2,
      assigneeAgentId: f.lead.id,
      assignedByAgentId: f.lead.id,
      acceptanceCriteria: ["`./run-tests.sh` exits non-zero."],
      dependsOn: [],
      createdAt: f.now,
      updatedAt: f.now,
    });
    f.store.createJob({
      id: "job-l1",
      taskId: "task-l1",
      status: "leased",
      leaseId: "lease-l1",
      capabilities: ["code.agent"],
      input: {},
    });
    f.store.submitJobResult({
      jobId: "job-l1",
      leaseId: "lease-l1",
      status: "succeeded",
      output: { summary: "recorded", checkResults: { test: false } },
      finishedAt: f.now,
    });
    // The anchor a leaf's journal carries is its container — that is the shape that made this reproducible.
    f.journalStore.append({
      projectId: f.project.id,
      workItemId: leafId,
      kind: "completion_report",
      title: "Completed: L1",
      body: "recorded",
      refType: "job",
      refId: "job-l1",
    });

    const ctx = { store: f.store, pmStore: f.pmStore, journalStore: f.journalStore };
    expect(
      decideWorkItemClosure(ctx, containerId).outcome,
      "a container has no settled job of its own until one runs on it",
    ).toBe("no_settled_job");
    expect(decideWorkItemClosure(ctx, leafId).outcome, "the child's own job is still decided").not.toBe(
      "no_settled_job",
    );
  });
});

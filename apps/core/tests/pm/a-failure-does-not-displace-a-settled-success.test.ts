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
import { syncWorkItemFromJobResult } from "../../src/application/pm/execute-work-item.js";
import { createProject } from "../../src/application/projects.js";

/**
 * **A later dispatch's failure does not displace the job that did the work.**
 *
 * Measured 2026-10-04 on suite 08's `s08r11` and re-measured 2026-11-09 on suite 19's `s19r17`: a leaf was
 * dispatched twice in one turn. The first job **succeeded** and wrote the deliverable; the second landed no file
 * and failed `WORKER_NO_DELIVERABLES`; and the item read `blocked` because the failure path wrote that status over
 * an item whose work was on disk and whose checks were green — with every item under it frozen behind it.
 *
 * Board row F-093. The row's own fix: *"A job's success must be decided by whether the deliverable it names is
 * true, not by whether the agent's editor moved … If the platform will not credit that, it must at least not let a
 * no-op job's failure displace a succeeded job."* This is the second half, and it is the one that was still open:
 * the failure path re-decides closure against the item's **latest succeeded** job before it writes `blocked`, and
 * writes `done` when that job closes.
 *
 * The control is the case that must not change: a leaf whose only job failed still blocks, because a failure with
 * nothing settled behind it is exactly what `blocked` is for.
 */
describe("a failed re-dispatch over a settled success (suite 19 / s19r17, BOARD F-093)", () => {
  let dataDir: string | undefined;
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-no-displacement-"));
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

  function leaf(f: ReturnType<typeof fixture>, id: string, jobId: string) {
    f.pmStore.createWorkItem({
      id,
      projectId: f.project.id,
      title: "L2 — Skip comment lines in parse_lines",
      status: "in_progress",
      priority: 3,
      sortOrder: 1,
      assigneeAgentId: f.lead.id,
      assignedByAgentId: f.lead.id,
      acceptanceCriteria: ["`parse_lines` ignores a `#` comment line."],
      dependsOn: [],
      createdAt: f.now,
      updatedAt: f.now,
    });
    f.pmStore.updateWorkItem(id, { jobId });
  }

  function job(f: ReturnType<typeof fixture>, id: string, status: "succeeded" | "failed") {
    f.store.createJob({
      id,
      taskId: `task-${id}`,
      status: "leased",
      leaseId: `lease-${id}`,
      capabilities: ["code.agent"],
      input: {},
    });
    return f.store.submitJobResult({
      jobId: id,
      leaseId: `lease-${id}`,
      status,
      output:
        status === "succeeded"
          ? { summary: "comment lines now skipped", filesChanged: ["src/ledger/parse.py"], checkResults: { test: true } }
          : { summary: "nothing to do", successfulMutations: 0 },
      error:
        status === "failed"
          ? { code: "WORKER_NO_DELIVERABLES", message: "The coding worker finished without writing any files." }
          : undefined,
      finishedAt: f.now,
    });
  }

  it("closes the leaf on the job that did the work when a later dispatch fails", () => {
    const f = fixture();
    const leafId = "6ddaaba3-2e39-4ecd-a07c-b13c8d53d7bb";
    leaf(f, leafId, "job-first");
    const first = job(f, "job-first", "succeeded");
    f.journalStore.append({
      projectId: f.project.id,
      workItemId: leafId,
      kind: "completion_report",
      title: "Completed: L2",
      body: "comment lines now skipped",
      refType: "job",
      refId: "job-first",
    });

    // The re-dispatch: the item is pointed at a second job, which lands nothing and fails.
    f.pmStore.updateWorkItem(leafId, { jobId: "job-second", status: "in_progress" });
    const second = job(f, "job-second", "failed");

    syncWorkItemFromJobResult(f.pmStore, "job-second", second.status, f.journalStore, second, undefined, {
      store: f.store,
    } as never);

    expect(
      f.pmStore.getWorkItem(leafId)?.status,
      "the deliverable is on disk and the job that wrote it passed its checks: a later no-op failure is not the verdict",
    ).toBe("done");
    expect(
      f.journalStore.listForWorkItem(leafId, { kinds: ["completion_report"] }).length,
      "the closure report is recorded against the job that did the work, not the one that did not",
    ).toBeGreaterThanOrEqual(1);
    expect(first.status).toBe("succeeded");
  });

  it("still blocks a leaf whose only job failed", () => {
    const f = fixture();
    const leafId = "0b0e0a26-79d8-4c3e-9d84-2c7b7d0f0a11";
    leaf(f, leafId, "job-only");
    const only = job(f, "job-only", "failed");
    syncWorkItemFromJobResult(f.pmStore, "job-only", only.status, f.journalStore, only);
    expect(
      f.pmStore.getWorkItem(leafId)?.status,
      "a failure with nothing settled behind it is what `blocked` is for",
    ).toBe("blocked");
  });

  it("does not resurrect a leaf the operator cancelled", () => {
    const f = fixture();
    const leafId = "9f4f8d4c-6a1e-4d0f-9a4b-6fbd0c6a2c22";
    leaf(f, leafId, "job-first");
    job(f, "job-first", "succeeded");
    f.journalStore.append({
      projectId: f.project.id,
      workItemId: leafId,
      kind: "completion_report",
      title: "Completed",
      body: "done",
      refType: "job",
      refId: "job-first",
    });
    f.pmStore.updateWorkItem(leafId, { status: "cancelled" });
    f.pmStore.updateWorkItem(leafId, { jobId: "job-second" });
    f.store.createJob({
      id: "job-second",
      taskId: "task-job-second",
      status: "leased",
      leaseId: "lease-job-second",
      capabilities: ["code.agent"],
      input: {},
    });
    const second = f.store.submitJobResult({
      jobId: "job-second",
      leaseId: "lease-job-second",
      status: "failed",
      output: {},
      error: { code: "WORKER_NO_DELIVERABLES", message: "no files" },
      finishedAt: f.now,
    });
    syncWorkItemFromJobResult(f.pmStore, "job-second", second.status, f.journalStore, second, undefined, {
      store: f.store,
    } as never);
    expect(f.pmStore.getWorkItem(leafId)?.status, "a settled cancellation is not undone by a failure").toBe(
      "cancelled",
    );
  });
});

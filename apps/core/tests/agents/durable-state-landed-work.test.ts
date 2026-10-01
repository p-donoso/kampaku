import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderDurableState,
  snapshotForPrompt,
} from "../../src/agents/runtime/durable-state.js";
import { syncWorkItemFromJobResult } from "../../src/application/pm/execute-work-item.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * The file list and the check outcomes a completed job reported, in the block the front office is given
 * every turn.
 *
 * Two runs of suite 08 measured the question *"Which files did you create or change, and which check proves
 * each one?"* being answered wrongly, in opposite directions:
 *
 *   * `s08r3` — *"I created and changed no files … no work item is done"* while the file existed and a
 *     check proved it. The worker sent `filesChanged: null`, so nothing durable named the file at all
 *     (BOARD F-080).
 *   * `s08r6` — *"no check has proven any repository change yet … Zero `make check` output exists for any
 *     of these files"* while the leaf was **`done`** with a succeeded job whose `checkResults` read
 *     `{test: true}` and whose `filesChanged` named the three files it wrote. That turn made **zero tool
 *     calls**; it answered from the conversation's memory of an earlier, staler reply.
 *
 * The second is why the fact belongs here. A prompt rule that can only be obeyed by fetching something is
 * not a fix; the block is ground truth supplied in-band, with an explicit precedence over the model's own
 * earlier prose, and a file list and a check outcome are small enough to carry every turn.
 *
 * So the lock has two halves: the block **contains** what the job reported, and it states the rule that a
 * question about landed files is answered from there — never from "I created no files", which describes the
 * front office's own toolset rather than the project's checkout.
 */
describe("durable state — landed work", () => {
  let context: TestContext | undefined;
  let checkout: string | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
    if (checkout) rmSync(checkout, { recursive: true, force: true });
    checkout = undefined;
  });

  /** A leaf of a real project, with a job whose result reports files and a passing check. */
  function projectWithACompletedJob() {
    context = createTestContext("kampaku-landed-work-");
    const { ctx, agentStore, pmStore, journalStore, store } = (() => {
      const c = context!;
      return {
        ctx: c.toolContext,
        agentStore: c.agentStore,
        pmStore: c.pmStore,
        journalStore: c.journalStore,
        store: c.store,
      };
    })();

    checkout = mkdtempSync(join(tmpdir(), "kampaku-landed-checkout-"));
    const now = new Date().toISOString();
    const lead = agentStore.createSubAgent({
      slug: "cli-lead",
      name: "CLI lead",
      parentId: agentStore.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Own the CLI work order",
      systemPrompt: "Own the CLI work order",
    });
    const project = store.createProject({
      id: "project-1",
      slug: "cli",
      name: "CLI",
      status: "active",
      projectLeadAgentId: lead.id,
      repositories: [{ url: `file://${checkout}`, role: "core" }],
      createdAt: now,
      updatedAt: now,
    } as never);

    const jobId = "job-1";
    pmStore.createWorkItem({
      id: "leaf-1",
      projectId: project.id,
      title: "CLI entry point reads stdin and prints total=/unique=",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: lead.id,
      jobId,
      acceptanceCriteria: ["`make check` exits 0 and lists the new cases."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    // A second leaf that has run nothing, so the block has to distinguish "wrote nothing" from "no job".
    pmStore.createWorkItem({
      id: "leaf-2",
      projectId: project.id,
      title: "File argument input and clean failure exit code 2",
      status: "todo",
      priority: 0,
      sortOrder: 1,
      assigneeAgentId: lead.id,
      acceptanceCriteria: ["`make check` exits 0."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    store.createJob({
      id: jobId,
      taskId: "task-1",
      status: "leased",
      leaseId: "lease-1",
      capabilities: ["code.agent"],
      input: { repositoryPath: checkout },
    });
    const output = {
      summary: "Wrote the CLI entry point; `make check` exits 0.",
      iterations: 7,
      repositoryPath: checkout,
      requiredChecks: ["test"],
      checkResults: { test: true },
      filesChanged: ["src/textstats/cli.py", "src/textstats/__main__.py", "tests/test_cli.py"],
      evidence: [
        {
          subjectType: "behavior",
          format: "code",
          verificationMethod: "command",
          subject: "test",
          passed: true,
          verified: true,
          reference: "make check",
          observedAt: now,
          criterionId: "check:test",
          sourceTool: "run_check",
          output: '{"ok":true,"script":"test","command":"make check"}',
        },
      ],
    };
    // The real completion path, not a hand-written journal row: whatever it records is what a live run
    // records, and the block has to be able to read it afterwards.
    store.submitJobResult({
      jobId,
      leaseId: "lease-1",
      status: "succeeded",
      output,
      finishedAt: now,
    });
    syncWorkItemFromJobResult(
      pmStore,
      jobId,
      "succeeded",
      journalStore,
      store.getJobResult(jobId),
      undefined,
      { store, agentStore, journalStore },
    );

    return { ctx, project, pmStore };
  }

  it("carries the files and the check outcomes of every completed job of the active project", () => {
    const f = projectWithACompletedJob();
    const snapshot = snapshotForPrompt(f.ctx, f.project.id);
    const landed = snapshot.landedWork ?? [];

    expect(landed.map((item) => item.workItemId)).toEqual(["leaf-1"]);
    expect(landed[0].files).toEqual([
      "src/textstats/cli.py",
      "src/textstats/__main__.py",
      "tests/test_cli.py",
    ]);
    expect(landed[0].checks).toEqual([{ name: "test", passed: true }]);
    expect(landed[0].status).toBe("done");

    const block = renderDurableState(snapshot);
    // Both directions of the suite's P1 miss: the files are named, and the check that proves them is named
    // with its outcome — so "nothing landed" and "no check ran" are both contradicted in-band.
    expect(block).toContain("Landed work in cli");
    expect(block).toContain("src/textstats/cli.py, src/textstats/__main__.py, tests/test_cli.py");
    expect(block).toContain("checks: test=passed");
    expect(block).toContain("CLI entry point reads stdin and prints total=/unique=");
    // The leaf that ran nothing is absent, which is what makes its absence meaningful: the block's own rule
    // says a missing item has no completed job, so an operator can read "nothing landed here yet" from it.
    expect(block).not.toContain("File argument input and clean failure exit code 2");
  });

  it("says a question about landed files is answered from the block, never from the model's own prose", () => {
    const block = renderDurableState({
      activeProject: { slug: "cli", id: "project-1" },
      projects: [{ slug: "cli", status: "active", lead: "cli-lead", repositories: 1 }],
      agents: [],
      questionsAwaitingEmperor: 0,
      questionsAwaitingAgent: 0,
      pendingBlockers: 0,
      workItemsByProject: { cli: 2 },
      landedWork: [
        {
          workItemId: "leaf-1",
          title: "CLI entry point",
          status: "done",
          files: ["src/textstats/cli.py"],
          checks: [{ name: "test", passed: true }],
        },
      ],
      openGates: [],
    });

    expect(block).toContain("A question about which files a work item created or changed is answered from");
    expect(block).toContain("Never say that nothing landed while a file list appears there");
    // The sentence that was factually true and useless in both runs: it is about the front office's own
    // toolset, and the operator is asking about the project's checkout. The block wraps it across two lines,
    // so the lock is on the two halves rather than on an exact rendering.
    expect(block).toContain("never answer such a question with");
    expect(block).toContain('"I created no files": that sentence describes your own toolset');
  });

  it("withholds nothing silently when a project holds more landed work than the block renders", () => {
    const block = renderDurableState({
      activeProject: { slug: "cli", id: "project-1" },
      projects: [{ slug: "cli", status: "active", lead: "cli-lead", repositories: 1 }],
      agents: [],
      questionsAwaitingEmperor: 0,
      questionsAwaitingAgent: 0,
      pendingBlockers: 0,
      workItemsByProject: { cli: 12 },
      landedWork: Array.from({ length: 10 }, (_, index) => ({
        workItemId: `leaf-${index + 1}`,
        title: `Leaf ${index + 1}`,
        status: "done",
        files: [`src/file-${index + 1}.py`],
        checks: [{ name: "test", passed: true }],
      })),
      openGates: [],
    });

    expect(block).toContain("leaf-8");
    expect(block).not.toContain("leaf-9");
    expect(block).toContain("…and 2 more, not shown here.");
  });
});

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KAMPAKU_BUILTIN_DEFINITION, KAMPAKU_BUILTIN_ID } from "../../src/agents/definitions.js";
import { executeToolCall } from "../../src/agents/runtime/tools/index.js";
import {
  changedPathsInCheckout,
  executeGetJobLedger,
  isPathClaimed,
  type JobLedgerResult,
} from "../../src/agents/runtime/tools/job-ledger.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * The ledger the front office is asked for, **checked against the checkout** rather than repeated.
 *
 * Measured 2026-10-04 taking suite 08's fifth re-run (`s08r12`), on the suite's own prompt 3 — *"Which files
 * did you create or change, and which check proves each one?"*:
 *
 *   * all three jobs carried a correct, durable `filesChanged` and the checkout agreed with every one of them
 *     (`52d2a06b` → `src/textstats/cli.py`, `src/textstats/__main__.py`; `be0ac35f` → `tests/fixtures/sample.txt`,
 *     `tests/test_cli.py`; `0c3ea6ec` → `README.md`, `AGENTS.md`);
 *   * and the front office answered *"I created no files and changed none … The paths are declarations, not a
 *     landed-file list. I have not read a list of files changed on the checkout"* — because it held
 *     `get_project`, `get_agent_dashboard` and `get_project_journal`, and none of the three can read a job.
 *
 * Both halves of that lock are here. The **capability**: the seat's own grant executes `get_job_ledger`, so
 * the answer to a question about the checkout does not depend on a seat that holds a repository. The
 * **comparison**: the tool's file list is asserted against a real directory on disk, in both directions the
 * suite's oracle names — *claimed but missing* (BOARD F-097) and *present but unclaimed* (BOARD F-090) — and
 * against the job record itself, so a tool that merely echoed `filesChanged` would fail these cases.
 *
 * The checkout here is a real `git init` tree, because the *unclaimed* direction needs a baseline and the
 * one the platform already has is the version control every seeded checkout carries (`repo-bootstrap` runs
 * `git init`). Nothing else in the suite shells out to assert it.
 */
describe("job ledger — what a job landed, checked against the checkout", () => {
  let context: TestContext | undefined;
  let checkout: string | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
    if (checkout) rmSync(checkout, { recursive: true, force: true });
    checkout = undefined;
  });

  function git(args: string[]): void {
    execFileSync("git", args, { cwd: checkout!, stdio: "ignore" });
  }

  /**
   * A container whose job reported two files: one that is on disk and one that is not, plus a third path
   * changed on the checkout that no job of the project claims — the two failure directions at once.
   */
  function projectWithAJob(): { projectSlug: string; jobId: string; workItemId: string } {
    context = createTestContext("kampaku-job-ledger-");
    const { ctx, agentStore, pmStore, store } = (() => {
      const c = context!;
      return { ctx: c.toolContext, agentStore: c.agentStore, pmStore: c.pmStore, store: c.store };
    })();

    checkout = mkdtempSync(join(tmpdir(), "kampaku-job-ledger-checkout-"));
    git(["init", "-b", "main"]);
    git(["config", "user.email", "eval@kampaku.local"]);
    git(["config", "user.name", "Eval"]);
    writeFileSync(join(checkout, "README.md"), "# fixture\n");
    git(["add", "."]);
    git(["commit", "-m", "seed"]);

    // What the job wrote: one file that landed, one inside a new directory, and nothing on disk for the
    // third claim — that third one is *claimed but missing*.
    mkdirSync(join(checkout, "src"), { recursive: true });
    writeFileSync(join(checkout, "src", "cli.py"), "print('hi')\n");
    mkdirSync(join(checkout, "tests", "fixtures"), { recursive: true });
    writeFileSync(join(checkout, "tests", "fixtures", "sample.txt"), "one two one\n");
    // ...and what no job claims: *present but unclaimed*.
    writeFileSync(join(checkout, "STRAY.md"), "written by nobody\n");

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

    const workItemId = "leaf-1";
    const jobId = "job-1";
    pmStore.createWorkItem({
      id: workItemId,
      projectId: project.id,
      title: "CLI entry point",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
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
      input: {
        repositoryPath: checkout,
        project: { id: project.id, slug: project.slug },
        context: { workItemId },
      },
    });
    store.submitJobResult({
      jobId,
      leaseId: "lease-1",
      status: "succeeded",
      output: {
        summary: "Wrote the CLI.",
        repositoryPath: checkout,
        requiredChecks: ["test"],
        checkResults: { test: true, lint: true },
        filesChanged: ["src/cli.py", "tests/fixtures/sample.txt", "tests/gone.py"],
      },
      finishedAt: now,
    });

    return { projectSlug: project.slug, jobId, workItemId };
  }

  it("is reachable from the seat that is asked what changed", async () => {
    const { projectSlug } = projectWithAJob();

    // Driven through dispatch with the front office's own grant, because "the tool exists" is not "the seat
    // that answered prompt 3 can call it". Without the fix this is `Unknown tool` / `ToolNotGrantedError`.
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).toContain("get_job_ledger");
    const call = await executeToolCall(
      context!.toolContext,
      "get_job_ledger",
      JSON.stringify({ project_slug_or_id: projectSlug }),
      { agentId: KAMPAKU_BUILTIN_ID },
      { allowed: new Set(KAMPAKU_BUILTIN_DEFINITION.tools), label: "the front office allowlist" },
    );

    const ledger = call.output as JobLedgerResult;
    expect(ledger.scope).toEqual({ kind: "project", value: "cli" });
    expect(ledger.jobs.map((job) => job.jobId)).toEqual(["job-1"]);
    expect(ledger.jobs[0].checks).toEqual([
      { name: "test", passed: true },
      { name: "lint", passed: true },
    ]);
  });

  it("reports a claimed file as landed only when it is on disk, and the missing claim as missing", () => {
    const { projectSlug, jobId } = projectWithAJob();
    const ledger = executeGetJobLedger(context!.toolContext, { project_slug_or_id: projectSlug });

    // The filesystem's answer, not the declaration's: two of the three claims are on disk.
    expect(ledger.jobs[0].landedFiles).toEqual(["src/cli.py", "tests/fixtures/sample.txt"]);
    // *claimed but missing* — the direction s08r11 measured (BOARD F-097), named as a failed claim.
    expect(ledger.jobs[0].claimsWithoutAFile).toEqual(["tests/gone.py"]);
    expect(ledger.jobs[0].unverifiedClaims).toEqual([]);

    // The control that makes this a comparison rather than a shape: the durable record still claims all
    // three paths, so a tool that returned the job's own list would agree with the declaration and be wrong
    // about the checkout.
    const output = context!.store.getJobResult(jobId)!.output as { filesChanged: string[] };
    expect(output.filesChanged).toContain("tests/gone.py");
    expect(output.filesChanged).not.toEqual(ledger.jobs[0].landedFiles);
  });

  it("reports a path changed on the checkout that no job claims", () => {
    const { projectSlug } = projectWithAJob();
    const ledger = executeGetJobLedger(context!.toolContext, { project_slug_or_id: projectSlug });

    expect(ledger.unclaimedOnDisk).toHaveLength(1);
    // *present but unclaimed* — the direction s08r12's earlier jobs measured (BOARD F-090).
    expect(ledger.unclaimedOnDisk[0].paths).toEqual(["STRAY.md"]);
    expect(ledger.unclaimedOnDisk[0].needs).toBeUndefined();

    // And the two files that ARE claimed are not reported as unclaimed, including the one git reports as the
    // new directory `tests/fixtures/` while the ledger names the file inside it.
    expect(isPathClaimed("tests/fixtures/", new Set(["tests/fixtures/sample.txt"]))).toBe(true);
    expect(ledger.unclaimedOnDisk[0].paths).not.toContain("tests/fixtures/");
    expect(ledger.unclaimedOnDisk[0].paths).not.toContain("src/cli.py");
  });

  it("says what it could not check instead of calling an unreadable claim landed", () => {
    const { projectSlug } = projectWithAJob();
    // The checkout the job recorded is gone: a claim about it can be repeated but not verified.
    rmSync(checkout!, { recursive: true, force: true });

    const ledger = executeGetJobLedger(context!.toolContext, { project_slug_or_id: projectSlug });

    expect(ledger.jobs[0].landedFiles).toEqual([]);
    expect(ledger.jobs[0].claimsWithoutAFile).toEqual([]);
    expect(ledger.jobs[0].unverifiedClaims).toEqual([
      "src/cli.py",
      "tests/fixtures/sample.txt",
      "tests/gone.py",
    ]);
    expect(ledger.unclaimedOnDisk[0].paths).toEqual([]);
    expect(String(ledger.unclaimedOnDisk[0].needs)).toMatch(/does not exist on this filesystem/);
  });

  it("names the missing baseline when the checkout is under no version control", () => {
    const plain = mkdtempSync(join(tmpdir(), "kampaku-job-ledger-plain-"));
    try {
      writeFileSync(join(plain, "src.py"), "print('hi')\n");
      const changed = changedPathsInCheckout(plain);
      expect(changed.paths).toBeUndefined();
      // An empty list would read as "nothing is unclaimed", which is the one thing this read cannot know.
      expect(String(changed.needs)).toMatch(/version control/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("refuses a ledger for work nothing records, naming what is missing", () => {
    projectWithAJob();
    expect(() =>
      executeGetJobLedger(context!.toolContext, { job_id: "no-such-job" }),
    ).toThrow(/no-such-job/);
    expect(() => executeGetJobLedger(context!.toolContext, {})).toThrow(/job_id or a project_slug_or_id/);
  });
});

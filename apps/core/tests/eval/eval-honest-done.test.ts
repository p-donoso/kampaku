import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { PmStore, type WorkItemRecord } from "../../src/persistence/pm-store.js";
import { Store, type ProjectRecord } from "../../src/persistence/store.js";
import {
  expectedOutputLines,
  missingExpectedLines,
  planVerification,
  projectRepositoryPath,
  runCommandArgv,
  verifyWorkItem,
} from "../../src/application/pm/verify-work-item.js";
import { evaluateEvidenceCoverage, keyEvidenceToCriteria, reflectsCriterion } from "../../src/application/pm/evidence-review.js";
import { isBehaviorCriterion, parseCriterionChecks } from "../../src/application/pm/criterion-checks.js";

/**
 * **Suite 11 — honest done, locked.**
 *
 * The suite's promise is that *done* means the stated check was re-executed against the artifact and passed,
 * including after sabotage. Two things were false about that when this file was written, both measured on
 * suite 11's first run (`s11r1`, 2026-10-21) and both recorded on the BOARD:
 *
 * - **F-122 — nothing could re-run a done item's check.** Leaf `9bcc2eb2` closed `done` with a succeeded job;
 *   four of its criteria were raised to the emperor as *"cannot be decided by any tool"* because the worker
 *   holds no general command runner, and asked to clear them the front office recommended *"re-run the four
 *   commands through the worker"* as its first option and then said it held no tool that could. So a sabotaged
 *   artifact left the board green, and the suite's three sabotage beats were unmeasurable.
 * - **F-123 — a behaviour criterion was "covered" by a file's existence.** `ac-2` read
 *   `` `PYTHONPATH=src python3 -m textstats README.md` exits 0 and every stdout line matches … ``; it was
 *   routed to the artifact verifier because the word `README.md` sits inside the command it quotes, and then
 *   reported covered by `artifact:src/textstats/cli.py`. That is exactly the *"structural validity accepted as
 *   proof"* shape the suite's oracle refuses.
 *
 * Six cases, each one a way the fix could be false. The sabotage is real — a file written by the fixture's own
 * `make check` target is emptied on disk — and the only thing that restores the item is a passing re-run.
 */
describe("eval 11 — honest done: the stated check is re-executed against the artifact", () => {
  const cleanups: string[] = [];

  afterEach(() => {
    while (cleanups.length) {
      const path = cleanups.pop();
      if (path) rmSync(path, { recursive: true, force: true });
    }
  });

  /** A checkout whose only declared check is `make check`, and a project linked to it. */
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "kampaku-honest-done-"));
    cleanups.push(root);
    const checkout = join(root, "checkout");
    mkdirSync(checkout, { recursive: true });
    // The project's own toolchain, in the shape this lab's Python fixture declares it: a `Makefile` target
    // `check` that the plan's criteria name, and that fails when the artifact it proves is empty.
    writeFileSync(
      join(checkout, "Makefile"),
      "check:\n\t@test -s artifact.txt\n\t@printf 'artifact ok\\n'\n\nlint:\n\t@printf 'lint ok\\n'\n",
    );
    writeFileSync(join(checkout, "artifact.txt"), "ok\n");

    const config = loadConfig({
      dataDir: join(root, "data"),
      dbPath: join(root, "data", "kampaku.db"),
      workspaceRoot: join(root, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    mkdirSync(config.workspaceRoot, { recursive: true });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);

    const project: ProjectRecord = {
      id: "11111111-2222-4333-8444-555555555555",
      slug: "honest-done",
      name: "honest-done",
      description: "a project whose done item can be re-verified",
      status: "active",
      projectLeadAgentId: null,
      repositories: [{ url: pathToFileURL(checkout).href, role: "core" }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.createProject(project);

    const item: WorkItemRecord = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      projectId: project.id,
      title: "Emit the artifact the CLI contract names",
      description: "One leaf: write the artifact, and let the project's own check prove it.",
      status: "done",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: null,
      assignedByAgentId: null,
      routingReason: null,
      acceptanceCriteria: [
        "`make check` exits 0 from the repository root.",
        "`test -f artifact.txt` exits 0 (the file this leaf writes).",
      ],
      frozenPaths: [],
      dependsOn: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    pmStore.createWorkItem(item);

    return { root, checkout, store, pmStore, journalStore, project, item, config };
  }

  it("reopens a done item when its own check no longer passes, and the board stops saying done", () => {
    const { checkout, pmStore, journalStore, project, item } = fixture();
    // The sabotage the suite asks for: a valid-looking artifact whose behaviour is gone.
    writeFileSync(join(checkout, "artifact.txt"), "");

    const result = verifyWorkItem(
      { pmStore, journalStore, project },
      { workItemIdOrTitle: item.id, by: "operator" },
    );

    expect(result.verdict).toBe("failed");
    expect(result.reopened).toBe(true);
    expect(result.statusBefore).toBe("done");
    expect(result.statusAfter).toBe("todo");
    // The status is a fact about the store, not a sentence in the reply.
    expect(pmStore.getWorkItem(item.id)?.status).toBe("todo");
    // And the failing command is named, with its exit code, in a durable entry.
    expect(result.checks.map((check) => check.command)).toContain("make check");
    const entries = journalStore.listForWorkItem(item.id, { kinds: ["verification_failed"], limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toContain("make check");
    expect(entries[0].metadata.reopened).toBe(true);
  });

  it("closes it again after the fix, without spending a job, because the check is the evidence", () => {
    const { checkout, pmStore, journalStore, store, project, item } = fixture();
    writeFileSync(join(checkout, "artifact.txt"), "");
    verifyWorkItem({ pmStore, journalStore, project }, { workItemIdOrTitle: item.id, by: "operator" });
    expect(pmStore.getWorkItem(item.id)?.status).toBe("todo");

    const jobsBefore = {
      queued: store.countJobsByStatus("queued"),
      running: store.countJobsByStatus("running"),
      succeeded: store.countJobsByStatus("succeeded"),
    };
    writeFileSync(join(checkout, "artifact.txt"), "ok\n");
    const result = verifyWorkItem(
      { pmStore, journalStore, project },
      { workItemIdOrTitle: item.id, by: "operator" },
    );

    expect(result.verdict).toBe("passed");
    expect(result.closed).toBe(true);
    expect(pmStore.getWorkItem(item.id)?.status).toBe("done");
    // Re-running a check after a fix does not re-run the item: no job is created by verification.
    expect({
      queued: store.countJobsByStatus("queued"),
      running: store.countJobsByStatus("running"),
      succeeded: store.countJobsByStatus("succeeded"),
    }).toEqual(jobsBefore);
  });

  it("leaves an intact done item done, and records the command and its exit code", () => {
    const { pmStore, journalStore, project, item } = fixture();
    const result = verifyWorkItem(
      { pmStore, journalStore, project },
      { workItemIdOrTitle: item.id, by: "operator" },
    );

    expect(result.verdict).toBe("passed");
    expect(result.reopened).toBe(false);
    expect(result.closed).toBe(false);
    expect(pmStore.getWorkItem(item.id)?.status).toBe("done");
    const check = result.checks.find((candidate) => candidate.command === "make check");
    expect(check?.exits).toBe(0);
    expect(check?.output).toContain("artifact ok");
    const [entry] = journalStore.listForWorkItem(item.id, { kinds: ["verification_passed"], limit: 5 });
    expect(entry.metadata.verifiedBy).toBe("operator");
  });

  it("fails a check whose command exits 0 but does not print what the criterion states", () => {
    // The beat-2/beat-3 shape: the artifact is syntactically valid and the command still exits 0, and what
    // changed is the text it prints. An exit code alone would call this green.
    const criterion =
      "`make print` exits 0 and its stdout is exactly the lines `total_words 3` and `one 2`.";
    expect(expectedOutputLines(criterion)).toEqual(["total_words 3", "one 2"]);
    expect(missingExpectedLines(["total_words 3", "one 2"], "total_words_x 3\none 2\n")).toEqual([
      "total_words 3",
    ]);
    expect(missingExpectedLines(["total_words 3", "one 2"], "total_words 3\none 2\n")).toEqual([]);

    const { pmStore, journalStore, project, item } = fixture();
    // A second item whose criteria are the ones this case is about: `updateWorkItem` deliberately does not
    // rewrite criteria, so the specimen is created with them.
    const printing: WorkItemRecord = {
      ...item,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff",
      title: "Print the report lines the contract names",
      acceptanceCriteria: [criterion],
      status: "done",
    };
    pmStore.createWorkItem(printing);
    // The runner prints the *wrong* labels while exiting 0: exactly what a wrong-but-valid artifact does.
    const result = verifyWorkItem(
      { pmStore, journalStore, project },
      {
        workItemIdOrTitle: printing.id,
        by: "operator",
        runner: () => ({ exits: 0, output: "total_words_x 3\none 2", durationMs: 1 }),
      },
    );
    expect(result.verdict).toBe("failed");
    expect(result.reopened).toBe(true);
    expect(result.checks[0].missingOutput).toEqual(["total_words 3"]);
    expect(result.detail).toContain("did not print");
  });

  it("refuses a check it will not run, by name, instead of approximating it", () => {
    const { pmStore, project, item } = fixture();
    const shellItem: WorkItemRecord = {
      ...item,
      acceptanceCriteria: ["`curl -s http://127.0.0.1:1/health | jq -e .ok` exits 0."],
    };
    pmStore.updateWorkItem(item.id, { status: "done" });
    const plan = planVerification(shellItem, projectRepositoryPath(project));
    expect(plan.checks).toHaveLength(0);
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0].reason).toContain("is not a program this surface runs");
    // The limit is stated rather than smoothed over: a criterion this surface will not run is reported, and the
    // detail names it, so an operator can run it and record the decision instead of believing it was checked.
    expect(plan.refusals[0].criterionIds).toEqual(["ac-1"]);
  });

  it("does not accept a file's existence as proof of what it does when run", () => {
    // The specimen's own criterion, verbatim: a behaviour claim whose quoted command happens to name a
    // Markdown file. The `.md` inside the command is what used to route it to the artifact verifier.
    const behavior =
      "`PYTHONPATH=src python3 -m textstats README.md` exits 0 and every stdout line matches `^\\S+\\t\\d+$`.";
    const [routed] = parseCriterionChecks([{ id: "ac-2", text: behavior }]);
    expect(isBehaviorCriterion(behavior)).toBe(true);
    expect(routed.kind).not.toBe("artifact");
    expect(routed.verifier).not.toBe("inspect_artifact");

    // The gate's own path — `keyEvidenceToCriteria` then coverage — cannot turn the job's artifact record into
    // proof of it, which is exactly what it did on `s11r1`: coverage said `covered`.
    const now = new Date().toISOString();
    const artifactRecord = {
      subjectType: "artifact",
      format: "other",
      verificationMethod: "file-inspection",
      subject: "src/textstats/cli.py",
      passed: true,
      verified: true,
      reference: "src/textstats/cli.py",
      observedAt: now,
      criterionId: "artifact:src/textstats/cli.py",
      sourceTool: "verify_file",
    };
    // The record still says what it says about the file it read; what it cannot do is claim this criterion.
    expect(reflectsCriterion(behavior, { ...artifactRecord, criterionId: "ac-2" }).proves).toBe(true);
    const coverage = evaluateEvidenceCoverage(
      { acceptanceCriteria: [behavior] },
      keyEvidenceToCriteria([{ id: "ac-2", text: behavior }], [artifactRecord]),
      [{ id: "ac-2", text: behavior }],
    );
    expect(coverage.covered).not.toContain("ac-2");
    expect([...coverage.missing, ...coverage.insufficient]).toContain("ac-2");
  });

  it("runs the commands a criterion quotes, a pipeline stage by stage, and keys each one to its criterion", () => {
    const { checkout, pmStore, journalStore, project, item } = fixture();
    const quoted: WorkItemRecord = {
      ...item,
      acceptanceCriteria: [
        "`make check` exits 0 from the repository root.",
        "`git status --porcelain` lists no modified file outside artifact.txt.",
        "`printf 'ok\\n' | grep ok` exits 0.",
      ],
    };
    pmStore.updateWorkItem(item.id, { status: "done" });
    const result = verifyWorkItem(
      { pmStore, journalStore, project },
      { workItemIdOrTitle: item.id, by: "operator" },
    );

    // Both commands ran in the checkout, and the artifact one is keyed to the criterion that states it.
    expect(result.checks.map((check) => check.command)).toEqual(["make check"]);
    const plan = planVerification(quoted, checkout);
    expect(plan.checks.map((check) => check.command)).toEqual([
      "make check",
      "git status --porcelain",
      "printf 'ok\\n' | grep ok",
    ]);
    expect(plan.checks[1].criterionIds).toEqual(["ac-2"]);
    // The pipeline runs stage by stage with argv, and its exit code is the last stage's.
    const piped = runCommandArgv("printf 'ok\\n' | grep ok", checkout);
    expect(piped.exits).toBe(0);
    expect(piped.output).toContain("ok");
  });
});

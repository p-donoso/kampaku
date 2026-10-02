import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import { syncWorkItemFromJobResult } from "../../src/application/pm/execute-work-item.js";
import { clearWithFor, parseClosureRefusal, readLatestClosureRefusal } from "../../src/application/pm/closure-refusal.js";
import {
  listManualEvidenceReviews,
  requestManualEvidenceReview,
  resolveManualEvidenceReview,
} from "../../src/application/pm/evidence-review.js";
import { requiresPeerReview } from "../../src/application/pm/done-honesty.js";

/**
 * **BOARD F-088 — a block is a gate, and this one could not be read or cleared.**
 *
 * The measurement that opened the row, 2026-10-01 on suite 08's re-run `s08r9`: the leaf `5b240606`
 * ("Document the CLI in README.md") ran **twice**, both jobs `succeeded`, `checkResults {lint: true,
 * test: true}`, three evidence records, a completion report in its journal, and both of its
 * manual-evidence gates answered by the operator through the web UI — and it still read `blocked`, with
 * `GET /api/v1/questions?status=pending` returning **0** and `GET /api/v1/blockers` returning **`[]`**.
 *
 * The only surface that mentioned it answered:
 *
 * ```json
 * {"gate": {"reason": "blocked_task", "detail": "Document the CLI in README.md"},
 *  "nextStep": {"blockedReason": "Task is blocked by an error, pending question, or blocker."}}
 * ```
 *
 * Three possible causes, every one of them absent, and no field, no rule and no command in reach. The
 * cases below are written against that specimen, and each one is a way the fix could be false:
 *
 * 1. **The rule is named.** The gate carries the closure code, the field it read, the item, and the
 *    operator command that clears it — and the sentence the operator reads one layer up names the field
 *    and the command instead of listing causes.
 * 2. **The discharge exists and spends nothing.** `POST /api/v1/work-items/:id/closure` re-decides the
 *    closure against the job already on record, and the leaf closes with **no new job**: the product must
 *    not spend a job to re-run checks whose output is already in the journal.
 * 3. **A decision is a decision.** A discharge with no author, or with no substance, is refused and
 *    changes nothing — an anonymous "accept" is a status change, not a gate.
 * 4. **The answer to a criterion gate closes the leaf it was raised for.** The run's own second job was
 *    spent because one rule refused a leaf whose answered gate had already taken effect; this case
 *    replays the answers and asserts the leaf closes without a second job.
 * 5. **A refusal that stands says so in its own words.** A rejected criterion reads as a rejection, and
 *    the operator's acceptance cannot paper over a check the job reported as failed.
 * 6. **The rule that fired is not a reading of a path.** The specimen's description contains *"do not
 *    invent `requirements/` or `docs/architecture/` directories"* — a prohibition — and that one word
 *    inside one path was the whole difference between this leaf and the four that closed.
 */
describe("eval 14/24 — the closure block the operator can read and discharge", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-closure-block-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const wikiStore = new WikiStore(db);
    questionStore.setJournalStore(journalStore);
    questionStore.setBlockageStore(blockageStore);
    blockageStore.setJournalStore(journalStore);
    blockageStore.setQuestionStore(questionStore);
    bootstrapProject(store, config, db);
    seedSkillsFromCatalog(skillStore, resolve(process.cwd(), "../.."));
    mkdirSync(config.workspaceRoot, { recursive: true });
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
      blockageStore,
      journalStore,
      wikiStore,
      db,
    );
    return {
      app,
      store,
      pmStore,
      agentStore,
      journalStore,
      questionStore,
      memoryStore,
      /** How many jobs of each status the store holds: a discharge must not add one. */
      jobCounts: () => ({
        queued: store.countJobsByStatus("queued"),
        running: store.countJobsByStatus("running"),
        succeeded: store.countJobsByStatus("succeeded"),
      }),
      checkout: join(dataDir, "checkout"),
    };
  }

  /** The specimen's own leaf, described the way the run's plan described it. */
  const SPECIMEN_DESCRIPTION =
    "One concern: keep the README true about the new entry point, as AGENTS.md demands. " +
    "Modify `README.md` only: replace the status block that currently reads 'Status: first module " +
    "only… There is no command-line entry point yet'. No new files; do not invent `requirements/` or " +
    "`docs/architecture/` directories. Requirement R4; delivered as vertical slice slice-truthful-readme.";

  const SPECIMEN_CRITERIA = [
    "`make lint` exits 0 from the repository root.",
    "`test -f README.md` exits 0 (file-exists check for the single file this leaf edits), and no remaining line of README.md still claims there is no command-line entry point.",
    "Every command shown in README.md runs verbatim from the repository root; `PYTHONPATH=src python3 -m textstats --help` lists exactly the flags the README names.",
    "The completion report quotes the changed README text; if the README claims a flag or invocation the code does not implement, the leaf fails.",
    "README.md is the only file modified and no new directory is created.",
  ];

  const LEAF_ID = "5b240606-ddfc-48a4-aabf-b052d2380cd6";
  const JOB_ID = "c3548b81-f4ff-46da-ad1e-99693ef41b61";

  /**
   * The specimen as the plan would have described it if the work *were* architecture work: one sentence of
   * prose naming the subject, with no path to hide behind. This is the shape that legitimately requires a
   * decided review, and it keeps the five criteria and their routing exactly as the run had them.
   */
  const SENSITIVE_DESCRIPTION =
    `${SPECIMEN_DESCRIPTION} The architecture section of README.md must stay true for the next reader.`;

  /** Every observation `c3548b81` returned, verbatim in shape. */
  const SPECIMEN_EVIDENCE = (now: string) => [
    {
      subjectType: "behavior",
      format: "code",
      verificationMethod: "command",
      subject: "lint",
      passed: true,
      verified: true,
      reference: "make lint",
      observedAt: now,
      criterionId: "check:lint",
      sourceTool: "run_check",
      output: '{"ok":true,"script":"lint","command":"make lint"}',
    },
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
      output: '{"ok":true,"script":"test","command":"make check","output":"Ran 16 tests … OK"}',
    },
    {
      subjectType: "artifact",
      format: "other",
      verificationMethod: "file-inspection",
      subject: "README.md",
      passed: true,
      verified: true,
      reference: "README.md",
      observedAt: now,
      criterionId: "artifact:README.md",
      sourceTool: "verify_file",
      output: '{"ok":true,"path":"README.md"}',
    },
  ];

  /**
   * The specimen leaf with a job that did the work, whose result is the shape `c3548b81` returned.
   *
   * `criteria` and `checkResults` are the only knobs; everything else is what the run's own records hold.
   */
  function specimen(
    f: ReturnType<typeof fixture>,
    options: {
      criteria?: string[];
      description?: string;
      checkResults?: Record<string, boolean>;
      /**
       * Criteria whose gate the operator already answered, as the run's own journal held them at 00:45:14Z
       * and 00:45:18Z. Needed to reach the state the run was actually in: the *first* refusal of the
       * specimen was "Acceptance criteria without evidence: ac-4, ac-5", and it was the next rule that
       * refused the leaf after those answers landed.
       */
      answeredCriteria?: string[];
    } = {},
  ) {
    mkdirSync(f.checkout, { recursive: true });
    const now = new Date().toISOString();
    const project = f.store.createProject({
      id: "project-textstats",
      slug: "textstats",
      name: "textstats",
      status: "active",
      repositories: [{ url: `file://${f.checkout}`, role: "core" }],
      createdAt: now,
      updatedAt: now,
    });
    const lead = f.agentStore.getKampakuAgent();
    f.pmStore.createWorkItem({
      id: LEAF_ID,
      projectId: project.id,
      title: "Document the CLI in README.md",
      description: options.description ?? SPECIMEN_DESCRIPTION,
      status: "in_progress",
      priority: 3,
      sortOrder: 5,
      assigneeAgentId: lead.id,
      assignedByAgentId: lead.id,
      acceptanceCriteria: options.criteria ?? SPECIMEN_CRITERIA,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    // The item names the job running on it, which is how the completion path finds it.
    f.pmStore.updateWorkItem(LEAF_ID, { jobId: JOB_ID });

    f.store.createJob({
      id: JOB_ID,
      taskId: "task-1",
      status: "leased",
      leaseId: "lease-1",
      capabilities: ["code.agent"],
      input: { repositoryPath: f.checkout },
    });
    f.store.submitJobResult({
      jobId: JOB_ID,
      leaseId: "lease-1",
      status: "succeeded",
      output: {
        summary:
          "Done. `README.md` was the only file written; the flags, the JSON keys and the exit codes the " +
          "README documents are exactly what `src/textstats/cli.py` implements. Checks ran and passed.",
        iterations: 9,
        repositoryPath: f.checkout,
        requiredChecks: ["lint"],
        checkResults: options.checkResults ?? { lint: true, test: true },
        verificationResults: [{ path: "README.md", ok: true }],
        filesChanged: ["README.md"],
        evidence: SPECIMEN_EVIDENCE(now),
      },
      finishedAt: now,
    });

    for (const criterionId of options.answeredCriteria ?? []) {
      const review = requestManualEvidenceReview(f.journalStore, {
        projectId: project.id,
        workItemId: LEAF_ID,
        criterionId,
        requestedByAgentId: lead.id,
        reviewerAgentId: f.agentStore.getKampakuAgent().id,
        reason: `No tool can decide this criterion; the emperor's decision is what closes it.`,
        evidence: "the criterion's own text",
      });
      resolveManualEvidenceReview(f.journalStore, {
        projectId: project.id,
        workItemId: LEAF_ID,
        reviewId: review.reviewId,
        reviewerAgentId: f.agentStore.getKampakuAgent().id,
        outcome: "accepted",
        reason: "Accepted — the criterion is met",
      });
    }

    // The real completion path: whatever it records is what a live run records.
    syncWorkItemFromJobResult(
      f.pmStore,
      JOB_ID,
      "succeeded",
      f.journalStore,
      f.store.getJobResult(JOB_ID),
      f.memoryStore,
      {
        store: f.store,
        agentStore: f.agentStore,
        journalStore: f.journalStore,
        questionStore: f.questionStore,
      },
    );

    return { project, now };
  }

  type ExecutionState = {
    gated: boolean;
    gate: {
      reason?: string;
      detail?: string;
      blocked?: { code?: string; field?: string; clearWith?: string; workItemId?: string; criterionIds?: string[] };
    };
    nextStep: { workItemId?: string | null; blockedReason?: string | null };
  };

  async function execution(f: ReturnType<typeof fixture>): Promise<ExecutionState> {
    const response = await f.app.request("/api/v1/projects/textstats/execution");
    expect(response.status).toBe(200);
    return (await response.json()) as ExecutionState;
  }

  function closeOut(f: ReturnType<typeof fixture>, body: Record<string, unknown>) {
    return f.app.request(`/api/v1/work-items/${LEAF_ID}/closure`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("names the item, the field, the rule and the operator command — where the old surface listed three absent causes", async () => {
    const f = fixture();
    specimen(f, { description: SENSITIVE_DESCRIPTION, answeredCriteria: ["ac-4", "ac-5"] });

    expect(f.pmStore.getWorkItem(LEAF_ID)?.status, "the job did the work and the leaf is still blocked").toBe(
      "blocked",
    );

    const state = await execution(f);
    expect(state.gated).toBe(true);
    expect(state.gate.reason).toBe("blocked_task");
    expect(state.gate.blocked?.code).toBe("peer_review_required");
    expect(state.gate.blocked?.field).toBe("peerReview");
    expect(state.gate.blocked?.workItemId).toBe(LEAF_ID);
    expect(state.gate.detail).toContain("Sensitive work requires an approved peer review before closure.");
    expect(state.gate.detail, "the command that clears it is on the surface, not in a document").toContain(
      `kampaku projects closure ${LEAF_ID} --peer --accept`,
    );
    expect(state.gate.detail, "a list of possible causes is not a cause").not.toMatch(
      /an error, pending question, or blocker/i,
    );

    expect(state.nextStep.workItemId).toBe(LEAF_ID);
    expect(state.nextStep.blockedReason, "the layer the run read names the field").toContain("peerReview");
    expect(state.nextStep.blockedReason).toContain("peer_review_required");
    expect(state.nextStep.blockedReason).toContain(`kampaku projects closure ${LEAF_ID}`);

    // The durable record behind both sentences: readable after the process that decided it has gone.
    const recorded = readLatestClosureRefusal(f.journalStore, LEAF_ID);
    expect(recorded?.code).toBe("peer_review_required");
    expect(recorded?.reason).toContain("approved peer review");

    // The read surface agrees with the gate, item by item.
    const blocked = await f.app.request("/api/v1/projects/textstats/blocked");
    expect(blocked.status).toBe(200);
    const body = (await blocked.json()) as { blocks: Array<{ workItemId: string; detail: string }> };
    expect(body.blocks.map((block) => block.workItemId)).toEqual([LEAF_ID]);
    expect(body.blocks[0]!.detail).toContain("peer_review_required");
  });

  it("discharges the refusal and closes the leaf without spending a second job", async () => {
    const f = fixture();
    specimen(f, { description: SENSITIVE_DESCRIPTION, answeredCriteria: ["ac-4", "ac-5"] });
    const before = f.jobCounts();

    const discharged = await closeOut(f, {
      decision: "peer_review",
      outcome: "accept",
      by: "Pablo",
      notes: "Read the README diff against cli.py: every flag, key and exit code it documents is implemented.",
    });
    expect(discharged.status).toBe(200);
    const result = (await discharged.json()) as {
      status: string;
      recorded: string;
      refusal?: unknown;
    };
    expect(result.status, "the decision was the only thing missing").toBe("done");
    expect(result.recorded).toContain("peer review approved by Pablo");
    expect(result.refusal, "a closed leaf has no refusal standing").toBeUndefined();

    expect(f.pmStore.getWorkItem(LEAF_ID)?.status).toBe("done");
    expect(f.jobCounts(), "the evidence was already in the journal; closure must not spend a job").toEqual(before);

    const state = await execution(f);
    expect(state.gated, "the next step is free").toBe(false);
  });

  it("re-decides a block no rule stands behind any more, and spends nothing", async () => {
    const f = fixture();
    // The state run s08r9 left in its data dir: a settled, satisfied job and an item still reading
    // `blocked`, blocked by a rule that no longer refuses it and with no refusal on record.
    specimen(f, {
      criteria: SPECIMEN_CRITERIA.filter(
        (criterion) => !criterion.includes("completion report") && !criterion.startsWith("README.md is the only"),
      ),
    });
    f.pmStore.updateWorkItem(LEAF_ID, { status: "blocked" });
    expect(readLatestClosureRefusal(f.journalStore, LEAF_ID), "nothing decided it").toBeUndefined();
    const before = f.jobCounts();

    const state = await execution(f);
    expect(
      state.gate.detail,
      "an item whose settled job satisfies every rule says so, and names the command",
    ).toContain(`Re-decide it, without spending a job: kampaku projects closure ${LEAF_ID}`);

    const redecided = await closeOut(f, { decision: "decide" });
    expect(redecided.status).toBe(200);
    const result = (await redecided.json()) as { status: string; recorded: string };
    expect(result.recorded, "a re-decision records no human decision").toBe("none");
    expect(result.status).toBe("done");
    expect(f.pmStore.getWorkItem(LEAF_ID)?.status).toBe("done");
    expect(f.jobCounts()).toEqual(before);
  });

  it("answers a criterion gate into evidence and closes the leaf it was raised for, without a second job", async () => {
    const f = fixture();
    // The specimen verbatim, with its own five criteria and no answers yet: the state job `336c608a` left.
    specimen(f);
    const refusal = readLatestClosureRefusal(f.journalStore, LEAF_ID);
    expect(refusal?.code, "the rule that refused the first job is named").toBe("criteria_without_evidence");
    expect(refusal?.criterionIds).toEqual(["ac-4", "ac-5"]);
    expect(refusal?.clearWith, "and each criterion has its own command").toContain("--criterion ac-4");

    // The gates the product raised, answered through the route the web card and the CLI both use. Each
    // question says which criterion it is about, so this answers them by criterion rather than by order.
    const pending = await f.app.request("/api/v1/questions?status=pending");
    const questions = ((await pending.json()) as { questions: Array<{ id: string; question: string }> })
      .questions;
    const questionIdOf = (question: string) =>
      /manual-evidence:[^:"]+:([^"]+)"/.exec(question)?.[1] ?? "(unparsed)";
    const byCriterion = new Map(questions.map((q) => [questionIdOf(q.question), q.id]));
    expect([...byCriterion.keys()].sort(), "one decision per undecidable criterion").toEqual(["ac-4", "ac-5"]);
    const before = f.jobCounts();

    const answer = (id: string) =>
      f.app.request(`/api/v1/questions/${id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: "Accepted — the criterion is met" }),
      });

    const first = await answer(byCriterion.get("ac-4")!);
    expect(first.status).toBe(200);
    const afterFirst = (await first.json()) as {
      closureOutcome?: { workItemStatus?: string; refusal?: { code?: string; criterionIds?: string[] } } | null;
    };
    expect(afterFirst.closureOutcome?.workItemStatus, "one answer covers one criterion").toBe("blocked");
    expect(afterFirst.closureOutcome?.refusal?.criterionIds, "and the surface names the one still open").toEqual([
      "ac-5",
    ]);

    const second = await answer(byCriterion.get("ac-5")!);
    expect(second.status).toBe(200);
    const afterSecond = (await second.json()) as {
      closureOutcome?: { workItemStatus?: string; refusal?: unknown } | null;
    };
    expect(
      f.pmStore.getWorkItem(LEAF_ID)?.status,
      "the answers were the only thing missing — this is the second job s08r9 spent, not spent",
    ).toBe("done");
    expect(afterSecond.closureOutcome?.workItemStatus, "the route reports what the answer did").toBe("done");
    expect(afterSecond.closureOutcome?.refusal).toBeUndefined();
    expect(f.jobCounts(), "no job was spent on either answer").toEqual(before);

    const state = await execution(f);
    expect(state.gated).toBe(false);
    expect(
      f.journalStore.listForWorkItem(LEAF_ID, { limit: 100 }).filter((entry) => entry.kind === "evidence_review_resolved"),
      "both decisions are durable",
    ).toHaveLength(2);
  });

  it("refuses a decision with no author or no substance, and changes nothing", async () => {
    const f = fixture();
    specimen(f, { description: SENSITIVE_DESCRIPTION, answeredCriteria: ["ac-4", "ac-5"] });

    const anonymous = await closeOut(f, { decision: "peer_review", outcome: "accept", notes: "Looks fine." });
    expect(anonymous.status, "an anonymous acceptance is a status change").toBe(400);
    expect(((await anonymous.json()) as { error: string }).error).toMatch(/--by/);

    const substanceFree = await closeOut(f, { decision: "peer_review", outcome: "accept", by: "Pablo" });
    expect(substanceFree.status).toBe(400);
    expect(((await substanceFree.json()) as { error: string }).error).toMatch(/--notes/);

    expect(f.pmStore.getWorkItem(LEAF_ID)?.status, "a refused discharge changes nothing").toBe("blocked");
    expect(readLatestClosureRefusal(f.journalStore, LEAF_ID)?.code).toBe("peer_review_required");
  });

  it("reads a rejected criterion as a rejection, and keeps the leaf blocked on it", async () => {
    const f = fixture();
    specimen(f, {
      criteria: [
        "`make lint` exits 0 from the repository root.",
        "README.md reads well for a newcomer who has never seen the module.",
      ],
    });

    // Before any decision the leaf is waiting on a question, and that is what the surface says — the
    // defect this row is about was a block naming causes that were *not* there.
    const waiting = await execution(f);
    expect(waiting.gate.reason).toBe("pending_questions");
    expect(waiting.gate.detail).toBe("1 pending question");
    expect(readLatestClosureRefusal(f.journalStore, LEAF_ID)?.criterionIds).toEqual(["ac-2"]);

    const rejected = await closeOut(f, {
      decision: "criterion",
      criterion_id: "ac-2",
      outcome: "reject",
      by: "Pablo",
      notes: "The newcomer section still opens with the old status block.",
    });
    expect(rejected.status).toBe(200);
    const result = (await rejected.json()) as {
      status: string;
      refusal?: { code: string; reason: string; clearWith: string };
    };
    expect(result.status, "a rejection is not a closure").toBe("blocked");
    expect(result.refusal?.code, "the operator's own decision is what is reported").toBe(
      "manual_review_rejected",
    );
    expect(result.refusal?.clearWith).toContain("--criterion ac-2");
    expect(result.refusal?.reason, "the rejection is reported as a decision, not as a gap").toContain(
      "Rejected by the emperor, which is a decision and not missing evidence: ac-2.",
    );

    const state = await execution(f);
    expect(state.gate.reason, "the question is answered, so the block is the rule again").toBe("blocked_task");
    expect(state.gate.blocked?.code).toBe("manual_review_rejected");
    expect(state.gate.detail).toContain("Rejected by the emperor, which is a decision and not missing evidence: ac-2.");
  });

  it("cannot paper over a check the job reported as failed", async () => {
    const f = fixture();
    specimen(f, { checkResults: { lint: true, test: false } });
    expect(readLatestClosureRefusal(f.journalStore, LEAF_ID)?.code).toBe("checks_failed");

    const accepted = await closeOut(f, {
      decision: "criterion",
      criterion_id: "ac-1",
      outcome: "accept",
      by: "Pablo",
      notes: "The suite passes on my machine.",
    });
    expect(accepted.status).toBe(200);
    const result = (await accepted.json()) as { status: string; refusal?: { code: string; field: string } };
    expect(result.status, "the operator's decision cannot overrule the runner's own result").toBe("blocked");
    expect(result.refusal?.field).toBe("checks");
    expect(parseClosureRefusal({ metadata: {}, occurredAt: "" }), "an empty record is not a refusal").toBeUndefined();
  });

  it("does not read a sensitive word out of a path in the description", () => {
    // The specimen verbatim: its only sensitive word sits inside `docs/architecture/`, in a clause that
    // forbids creating that directory.
    expect(
      requiresPeerReview({
        id: "leaf",
        title: "Document the CLI in README.md",
        description: SPECIMEN_DESCRIPTION,
        acceptanceCriteria: SPECIMEN_CRITERIA,
      } as never),
      "a prohibition naming a path is not architecture work",
    ).toBe(false);

    // The same leaf whose criterion names that path as its deliverable still needs the review — the s08r3
    // lock, unchanged.
    expect(
      requiresPeerReview({
        id: "leaf",
        title: "Document the CLI in README.md",
        description: "Write the architecture note.",
        acceptanceCriteria: ["docs/architecture/cli.md states the exit codes the CLI implements."],
      } as never),
    ).toBe(true);

    // And prose that names the subject outside a path still needs it: the rule reads the work, not the
    // absence of a slash.
    expect(
      requiresPeerReview({
        id: "leaf",
        title: "Document the CLI in README.md",
        description: SENSITIVE_DESCRIPTION,
        acceptanceCriteria: SPECIMEN_CRITERIA,
      } as never),
    ).toBe(true);
  });

  it("gives every refusal code a runnable command", () => {
    expect(clearWithFor({ code: "peer_review_required" }, "item-1")).toBe(
      "kampaku projects closure item-1 --peer --accept --by <who> --notes \"<why it passes>\"",
    );
    expect(clearWithFor({ code: "criteria_without_evidence", criterionIds: ["ac-3"] }, "item-1")).toContain(
      "--criterion ac-3",
    );
    expect(clearWithFor({ code: "checks_failed" }, "item-1")).toBe("kampaku projects retry item-1");
    expect(clearWithFor({ code: "phase_audit_missing" }, "item-1")).toBe("kampaku projects retry item-1");
  });
});

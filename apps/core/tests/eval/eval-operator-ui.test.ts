import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { shouldBlockDishonestSuccess } from "../../src/application/pm/done-honesty.js";
import { getWorkItemDetail } from "../../src/application/pm/dashboard.js";
import { loadConfig } from "../../src/config.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { createDb, type Db } from "../../src/persistence/db.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * Suite 16's server-side lock: **the two reads the operator journeys stand on, and the sentence they need.**
 *
 * The suite's table names `apps/web/e2e/eval-operator-journeys.spec.ts` as the lock for the seven journeys, and
 * that file drives them in a browser. What a browser test cannot say on its own is *why* a panel shows what it
 * shows, so this file locks the three places the panel reads from, each of which was measured wrong while the
 * suite was opened (2026-11-04):
 *
 * 1. **Journey 7 — a done item's evidence.** `GET /api/v1/work-items/:id` carried no evidence at all, so
 *    journey 7's page had nothing to render and no UI change could have produced it. The read is here, keyed by
 *    criterion id, and it says **how** each record got to its criterion: `recorded` when the job named it,
 *    `matched` when Core keyed it the way the closure gate does (BOARD F-105's axis). A panel that presented a
 *    derived link as the producer's own claim would be the defect this whole board keeps recording.
 * 2. **Journey 7, the other side — closure.** The gate that decides whether a leaf may close validated the raw
 *    evidence records **before** keying them, and required `criterionId` on each. So a job that ran exactly the
 *    check its criterion names (`subject: "make check"`, `checkResults: {test: true}`) had its evidence refused
 *    as `invalid evidence record` and the leaf was left `blocked` with a sentence nobody could act on. The
 *    control below is that a record naming no criterion and matching none is **still** refused: the ordering was
 *    wrong, not the rule.
 * 3. **Every journey — the error state.** `POST /api/v1/work-items/:id/execute` on a Core configured for a model
 *    planner with no key answered a bare `500 Internal Server Error`, while the product held the sentence that
 *    explains it. The suite's oracle: *"Error states show the server's own explanation, not a bare status code."*
 */

interface Fixture {
  root: string;
  db: Db;
  store: Store;
  agentStore: AgentStore;
  pmStore: PmStore;
  journalStore: JournalStore;
  questionStore: QuestionStore;
  blockageStore: BlockageStore;
  projectId: string;
  itemId: string;
  leadId: string;
}

let fixture: Fixture | undefined;

function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "kampaku-eval-16-"));
  const workspaceRoot = join(root, "workspace");
  mkdirSync(workspaceRoot, { recursive: true });
  const checkout = join(root, "checkout");
  mkdirSync(checkout, { recursive: true });

  const config = loadConfig({
    dataDir: root,
    dbPath: join(root, "kampaku.db"),
    workspaceRoot,
    agentMode: "stub",
    plannerMode: "stub",
  });
  const { db } = createDb(config.dbPath);
  const store = new Store(db);
  const agentStore = new AgentStore(db);
  const pmStore = new PmStore(db);
  const journalStore = new JournalStore(db);
  const questionStore = new QuestionStore(db, agentStore);
  const blockageStore = new BlockageStore(db, agentStore, pmStore, journalStore);

  const lead = agentStore.createSubAgent({
    slug: "s16-lead",
    name: "S16 lead",
    parentId: agentStore.getKampakuAgent().id,
    responsibilities: "Own the work order",
    systemPrompt: "Own the work order",
  });
  const now = new Date().toISOString();
  const project = store.createProject({
    id: "project-16",
    slug: "s16-demo",
    name: "S16 Demo",
    status: "active",
    projectLeadAgentId: lead.id,
    repositories: [{ url: `file://${checkout}`, role: "core" }],
    createdAt: now,
    updatedAt: now,
  } as never);

  const itemId = "leaf-16";
  pmStore.createWorkItem({
    id: itemId,
    projectId: project.id,
    title: "S16 evidence leaf",
    // `todo`, which is what a plan leaves a leaf at and what a release requires: an item already `in_progress`
    // answers `Task is already executing.` before the planner is ever reached.
    status: "todo",
    priority: 0,
    sortOrder: 0,
    assigneeAgentId: lead.id,
    // Stated as an observable result naming the check the repository declares, which is the shape the plan's
    // own router sends to `run_check` and the closure gate can decide (BOARD F-077, F-083).
    acceptanceCriteria: ["make check exits 0 and the output lists the report path"],
    dependsOn: [],
    createdAt: now,
    updatedAt: now,
  });

  fixture = {
    root,
    db,
    store,
    agentStore,
    pmStore,
    journalStore,
    questionStore,
    blockageStore,
    projectId: project.id,
    itemId,
    leadId: lead.id,
  };
  return fixture;
}

afterEach(() => {
  if (fixture) rmSync(fixture.root, { recursive: true, force: true });
  fixture = undefined;
});

/** A job of the item, leased and settled, with the evidence the worker really sends. */
function settleJob(
  f: Fixture,
  input: {
    jobId: string;
    evidence: Array<Record<string, unknown>>;
    checkResults?: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  f.store.createJob({
    id: input.jobId,
    taskId: `task-${input.jobId}`,
    status: "leased",
    leaseId: `lease-${input.jobId}`,
    capabilities: ["code.agent"],
    input: { context: { workItemId: f.itemId } },
  });
  f.store.submitJobResult({
    jobId: input.jobId,
    leaseId: `lease-${input.jobId}`,
    status: "succeeded",
    output: {
      summary: "Wrote the report the acceptance criteria name.",
      sourceTool: "run_check",
      subjectType: "behavior",
      filesChanged: ["report.md"],
      checkResults: input.checkResults ?? { test: true },
      evidence: input.evidence,
    },
    finishedAt: now,
  });
  return now;
}

/** The record a worker writes: keyed to **what it observed**, not to the criterion, because it does not know it. */
function observedCheck(observedAt: string): Record<string, unknown> {
  return {
    kind: "check",
    subject: "make check",
    observedAt,
    passed: true,
    verified: true,
    reference: "make check: exit 0",
    output: "Ran 3 tests … OK",
    sourceTool: "run_check",
    subjectType: "behavior",
    verificationMethod: "command",
  };
}

describe("eval 16 — the operator journeys' server-side reads", () => {
  it("journey 7: the work item's own read carries its evidence, keyed by criterion id", () => {
    const f = setup();
    // **The expectation is the timestamp the evidence carries, not the one the settle wrote.** This test asked
    // for `settleJob`'s own clock and compared it to the record's, and the two differ whenever a millisecond ticks
    // between evaluating the argument and entering the helper — a race, not a rule, which failed two full batteries
    // out of five under load (measured 2026-11-05: `.563` recorded, `.564` expected). The assertion it was trying to
    // make is that the panel shows *when the job observed the result*, so it now reads that value from the
    // evidence it submitted.
    const observedAt = new Date().toISOString();
    settleJob(f, { jobId: "job-1", evidence: [observedCheck(observedAt)] });

    const detail = getWorkItemDetail(
      f.store,
      f.pmStore,
      f.agentStore,
      f.itemId,
      f.questionStore,
      f.blockageStore,
    );
    expect(detail).toBeDefined();

    // The criterion the plan wrote, with the id every clearing surface takes.
    const criterion = detail!.evidence.criteria[0]!;
    expect(criterion.id).toBe("ac-1");
    expect(criterion.text).toContain("make check");

    // The record the job wrote, beside it — with the check's own name, the tool that produced it, and when.
    expect(criterion.records).toHaveLength(1);
    expect(criterion.records[0]).toMatchObject({
      jobId: "job-1",
      kind: "check",
      subject: "make check",
      passed: true,
      sourceTool: "run_check",
      observedAt,
      // **How** it got here: the job did not name a criterion, so this link is Core's, and the panel says so.
      attribution: "matched",
    });
    // And nothing is left unexplained: there is no unkeyed record beside a keyed one.
    expect(detail!.evidence.unkeyed).toEqual([]);

    // The job itself, with the checks it ran and the files it wrote — journey 3's and journey 7's shared subject.
    expect(detail!.evidence.jobs).toEqual([
      {
        id: "job-1",
        status: "succeeded",
        checks: [{ name: "test", passed: true }],
        filesChanged: ["report.md"],
        finishedAt: expect.any(String),
      },
    ]);
  });

  it("journey 7: a record the job keyed to a criterion is reported as the job's own, not as Core's reading", () => {
    const f = setup();
    settleJob(f, {
      jobId: "job-1",
      evidence: [
        {
          criterionId: "ac-1",
          kind: "check",
          subject: "make check",
          observedAt: new Date().toISOString(),
          passed: true,
          sourceTool: "run_check",
          subjectType: "behavior",
          verificationMethod: "command",
        } as Record<string, unknown>,
      ],
    });

    const detail = getWorkItemDetail(f.store, f.pmStore, f.agentStore, f.itemId)!;
    expect(detail.evidence.criteria[0]!.records[0]!.attribution).toBe("recorded");
  });

  it("journey 7: a record that matches no criterion of the item is kept and reported as unkeyed", () => {
    const f = setup();
    settleJob(f, {
      jobId: "job-1",
      evidence: [
        {
          // An observation of something else entirely, with no tool that could key it: proving nothing about this
          // item's criterion. (A `sourceTool` of `run_check` would key it — the token `check` appears in the
          // tool's own name — which is a looseness of the matcher, not of the reader this case locks.)
          kind: "artifact",
          subject: "deploy to production",
          observedAt: new Date().toISOString(),
          passed: true,
          subjectType: "artifact",
          verificationMethod: "file-inspection",
        } as Record<string, unknown>,
      ],
    });

    const detail = getWorkItemDetail(f.store, f.pmStore, f.agentStore, f.itemId)!;
    // The criterion shows no evidence, which is the finding — not a silently empty list on the panel.
    expect(detail.evidence.criteria[0]!.records).toEqual([]);
    // And the record is still readable rather than dropped.
    expect(detail.evidence.unkeyed).toHaveLength(1);
    expect(detail.evidence.unkeyed[0]!.subject).toBe("deploy to production");
  });

  it("closure: a job that ran the check its criterion names can close the leaf, because the evidence is keyed before it is judged", () => {
    const f = setup();
    const observedAt = settleJob(f, { jobId: "job-1", evidence: [observedCheck(new Date().toISOString())] });
    const workItem = f.pmStore.getWorkItem(f.itemId)!;

    const decision = shouldBlockDishonestSuccess(
      workItem,
      {
        jobId: "job-1",
        leaseId: "lease-job-1",
        status: "succeeded",
        output: {
          summary: "Wrote the report the acceptance criteria name.",
          sourceTool: "run_check",
          subjectType: "behavior",
          filesChanged: ["report.md"],
          checkResults: { test: true },
          evidence: [
            {
              ...observedCheck(observedAt),
            },
          ],
        },
        finishedAt: observedAt,
      },
      [],
      { completionReport: true, privateMemory: true },
      { journalStore: f.journalStore },
    );

    // Without the ordering this is `{ block: true, code: "evidence_failed", reason: "Structured evidence failed:
    // invalid evidence record." }` — the refusal the suite-16 fixture met, on the job that had done the work.
    expect(decision).toEqual({ block: false });
  });

  it("closure: a record that names no criterion and matches none is still refused", () => {
    const f = setup();
    const observedAt = new Date().toISOString();
    const workItem = f.pmStore.getWorkItem(f.itemId)!;

    const decision = shouldBlockDishonestSuccess(
      workItem,
      {
        jobId: "job-1",
        leaseId: "lease-job-1",
        status: "succeeded",
        output: {
          summary: "Wrote the report the acceptance criteria name.",
          sourceTool: "run_check",
          subjectType: "behavior",
          checkResults: { test: true },
          evidence: [
            {
              // Well-formed, verified and referenced — so nothing but the missing criterion link can refuse it.
              // No `sourceTool`, because a `run_check` observation is keyed to a criterion naming `make check`,
              // and the case this control locks is a record that matches **no** criterion.
              kind: "artifact",
              subject: "deploy to production",
              observedAt,
              passed: true,
              verified: true,
              reference: "deploy.log: exit 0",
              subjectType: "artifact",
              verificationMethod: "file-inspection",
            },
          ],
        },
        finishedAt: observedAt,
      },
      [],
      { completionReport: true, privateMemory: true },
      { journalStore: f.journalStore },
    );

    expect(decision.block).toBe(true);
    if (decision.block) {
      expect(decision.code).toBe("evidence_failed");
      expect(decision.reason).toContain("invalid evidence record");
    }
  });

  it("a release on a planner with no key answers the planner's own sentence, not a bare 500", async () => {
    const f = setup();
    // `llm` with no key is the configuration the shipped default produces on an instance nobody configured:
    // `KAMPAKU_PLANNER` defaults to `llm` and `KAMPAKU_AGENT_MODEL_API_KEY` is unset.
    const config = loadConfig({
      dataDir: f.root,
      dbPath: join(f.root, "kampaku.db"),
      workspaceRoot: join(f.root, "workspace"),
      agentMode: "stub",
      plannerMode: "llm",
      modelApiKey: undefined,
      modelBaseUrl: undefined,
      model: undefined,
    });

    const app = createApp(
      f.store,
      config,
      f.agentStore,
      f.pmStore,
      new ConversationStore(f.db),
      new SkillStore(f.db),
      f.questionStore,
      new MemoryStore(f.db),
      f.blockageStore,
      f.journalStore,
    );
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/work-items/${f.itemId}/execute`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string; code?: string };
      // Printed on failure so a refusal from another rule is legible instead of being read as this one.
      expect(body.error, "the release must reach the planner, not be refused before it").toContain(
        "API key is required",
      );

      // A state the request is not wrong about: nothing was created, and the instance cannot plan.
      expect(response.status, JSON.stringify(body)).toBe(409);
      expect(body.code).toBe("PLANNER_NOT_CONFIGURED");
      // The sentence the product holds: what is missing, that nothing was released, and how to fix it.
      expect(body.error).toContain("An API key is required when KAMPAKU_PLANNER=llm");
      expect(body.error).toContain("Nothing was released");
      expect(body.error).toContain("Settings → Models");
      // And nothing was queued behind the refused release.
      expect(f.pmStore.getWorkItem(f.itemId)!.status).toBe("todo");
      expect(f.store.listJobs()).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

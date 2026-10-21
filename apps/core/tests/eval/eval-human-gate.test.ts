import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { createProject } from "../../src/application/projects.js";
import { describeAnswerOutcome, describeProjectAnswerOutcome } from "../../src/application/questions/answer-outcome.js";
import { loadConfig } from "../../src/config.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { createDb } from "../../src/persistence/db.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * Suite 10 — the human gate. Three promises, and each one was measured failing before it was locked.
 *
 * 1. **A human-only decision parks the linked work, and answering resumes it without closing it.**
 *    The leaf that carries the gate is the specimen: it must read `blocked` while the question is
 *    pending and go back to the status it had — never to `done` — when the answer arrives.
 *
 * 2. **Re-asking a gate under its own record id opens no second record.** Measured 2026-10-21 on run
 *    `s10r1`: the platform hands the operator the *record* id, so the protocol's own instruction
 *    ("re-ask with the same id") arrives with a uuid — and with a reworded prompt it matched neither
 *    the id+signature check nor the signature duplicate check. One decision became two pending
 *    records, the landing page rendered two cards for it, and the newer card carried the older
 *    record's id as its payload id. BOARD F-081, from the side that opens it.
 *
 * 3. **An answer says what it did, on every surface that records one.** The CLI printed
 *    "nothing was resumed — send a chat turn" while the web UI removed the card and said nothing; the
 *    sentence is now one function and the answer route returns it. BOARD F-007.
 */
describe("eval suite 10 — the human gate", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-human-gate-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const journalStore = new JournalStore(db);
    questionStore.setBlockageStore(blockageStore);
    return { store, pmStore, agentStore, questionStore, journalStore };
  }

  function seedLeaf(deps: ReturnType<typeof createStores>, slug: string): { projectId: string; leafId: string } {
    const { store, pmStore, agentStore } = deps;
    const project = createProject(store, { slug, name: slug, status: "active" });
    const kampaku = agentStore.getKampakuAgent();
    const leafId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: leafId,
      projectId: project.id,
      title: "Leaf that needs a decision only a person can take",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: project.id, leafId };
  }

  /** A gate in the shape the front office actually renders: a boolean the repository cannot answer. */
  function emailGate(id: string, prompt: string): string {
    return (
      "<kampaku-question>" +
      JSON.stringify({
        id,
        type: "boolean",
        prompt,
        trueLabel: "Real SMTP credentials",
        falseLabel: "Local capture only",
        required: true,
      }) +
      "</kampaku-question>"
    );
  }

  it("parks the leaf that carries the gate, and the answer resumes it without closing it", () => {
    const deps = createStores();
    const { projectId, leafId } = seedLeaf(deps, "human-gate-parked");

    const asked = deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: emailGate("smtp-credentials", "Which delivery path should the notification email use?"),
      questionId: "smtp-credentials",
      projectId,
      workItemId: leafId,
    });

    expect(asked.created).toBe(true);
    expect(deps.pmStore.getWorkItem(leafId)?.status).toBe("blocked");
    expect(deps.questionStore.listPending().map((row) => row.id)).toEqual([asked.question.id]);

    const answered = deps.questionStore.answer(asked.question.id, "Local capture only");

    expect(answered.status).toBe("answered");
    // Resumed, and *not* closed: answering a gate releases the work, it does not do it.
    expect(deps.pmStore.getWorkItem(leafId)?.status).toBe("todo");
    expect(deps.questionStore.listPending()).toHaveLength(0);
  });

  it("re-asking a gate under its own record id opens no second record", () => {
    const deps = createStores();
    const first = deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: emailGate("smtp-credentials", "Which delivery path should the notification email use?"),
      questionId: "smtp-credentials",
    });
    expect(first.created).toBe(true);

    // The re-ask the operator triggers with "I do not understand the question": same decision, more
    // context, the id read back off the platform's own gate list — which is the **record** id.
    const reAsk = deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: emailGate(
        first.question.id,
        "Approve the notification email going out through real SMTP credentials, or keep it to a local capture?",
      ),
      questionId: first.question.id,
    });

    expect(reAsk.created).toBe(false);
    expect(reAsk.question.id).toBe(first.question.id);
    expect(deps.questionStore.listPending()).toHaveLength(1);
  });

  it("still opens a gate when a payload id carries a different decision", () => {
    // The control for F-111: a payload id is the model's to invent, and reusing one for a decision
    // nobody has seen must not be swallowed by the record-id rule above.
    const deps = createStores();
    const first = deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: emailGate("smtp-credentials", "Which delivery path should the notification email use?"),
      questionId: "smtp-credentials",
    });
    expect(first.created).toBe(true);

    const other = deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: emailGate("smtp-credentials", "Which roster should own the notification work once it is applied?"),
      questionId: "smtp-credentials",
    });

    expect(other.created).toBe(true);
    expect(other.question.id).not.toBe(first.question.id);
    expect(deps.questionStore.listPending()).toHaveLength(2);
  });

  it("names what the answer did, including when it resumed nothing", () => {
    // The sentence the CLI prints and the answer route returns. A question asked from a chat
    // conversation names no project, so nothing resumes and the operator has to be told.
    expect(describeAnswerOutcome({})).toMatch(/nothing was resumed/);
    expect(describeAnswerOutcome({ projectId: uuidv4() })).toMatch(/project will resume/);
    expect(describeAnswerOutcome({ workItemId: uuidv4() })).toMatch(/work item will resume/);
  });

  it("names the surface that releases the work when the gate is clear but nothing dispatches", () => {
    // Measured 2026-10-21 on `s10r2`: the answer to `197dae48` cleared the gate, the frozen container went
    // back to `todo`, and `queuedJobs` stayed 0 — so "the project will resume" was a claim nothing backed.
    const released = describeProjectAnswerOutcome({ slug: "textstats", gate: { gated: false }, autoExecuting: false });
    expect(released).toMatch(/nothing runs until it is dispatched/);
    expect(released).toContain("kampaku projects play textstats");

    const stillGated = describeProjectAnswerOutcome({
      slug: "textstats",
      gate: { gated: true, detail: "1 pending question" },
      autoExecuting: false,
    });
    expect(stillGated).toMatch(/still gated/);
    expect(stillGated).toContain("1 pending question");

    const running = describeProjectAnswerOutcome({ slug: "textstats", gate: { gated: false }, autoExecuting: true });
    expect(running).toMatch(/continues without you/);
  });
});

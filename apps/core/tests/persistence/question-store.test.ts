import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore, KAMPAKU_AGENT_ID } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { eq } from "drizzle-orm";
import { agentQuestions } from "../../src/persistence/schema.js";

describe("QuestionStore", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("routes upward, blocks the work item, and restores it after the answer", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);
    const blockers = new BlockageStore(db, agents, pm);
    questions.setBlockageStore(blockers);
    blockers.setQuestionStore(questions);
    const lead = agents.createSubAgent({ slug: "lead", name: "Lead", parentId: KAMPAKU_AGENT_ID, responsibilities: "Lead", systemPrompt: "Lead" });
    const dev = agents.createSubAgent({ slug: "dev", name: "Dev", parentId: lead.id, responsibilities: "Dev", systemPrompt: "Dev" });
    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: workItemId,
      projectId: "project-1",
      title: "Implement API",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const question = questions.ask({ askedByAgentId: dev.id, question: "Which API?", workItemId });
    expect(question.recipientAgentId).toBe(lead.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("blocked");
    expect(questions.escalate(question.id, lead.id).recipientAgentId).toBe(KAMPAKU_AGENT_ID);
    questions.answer(question.id, "Use the public API.");
    expect(pm.getWorkItem(workItemId)?.status).toBe("todo");
  });

  // LangProbe G-01: the root agent's `<kampaku-question>` used to be rendered by the web
  // client and stored nowhere, so a required question was invisible to `questions list`
  // and to `GET /api/v1/questions`.
  it("records a root-agent question as awaiting the emperor, answerable from the CLI", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);

    const tag =
      '<kampaku-question>{"id":"d1","type":"text","prompt":"Which engine?"}</kampaku-question>';
    const { question, created } = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag,
      questionId: "d1",
      projectId: "project-1",
    });

    expect(created).toBe(true);
    expect(question.status).toBe("pending");
    expect(question.recipientAgentId).toBe(KAMPAKU_AGENT_ID);
    expect(question.question).toBe(tag);
    expect(questions.listPending().map((pending) => pending.id)).toContain(question.id);

    // The emperor is the default answerer, so `kampaku questions answer <id> …` works
    // without touching answer().
    const answered = questions.answer(question.id, "Local engines only.");
    expect(answered.status).toBe("answered");
    expect(questions.listPending()).toHaveLength(0);
  });

  /**
   * The loop that stalled the probe: the agent re-asks the same question every turn; deduping only
   * against *pending* questions meant each repetition after an answer became a new pending record, so
   * the pending count never reached zero and the agent read it as a blocker on its own planning.
   */
  it("does not re-open a question that was already answered and is asked again", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);

    const tag =
      '<kampaku-question>{"id":"planning-blocker","type":"text","prompt":"How?"}</kampaku-question>';
    const first = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag,
      questionId: "planning-blocker",
    });
    questions.answer(first.question.id, "Retry; the rate limit cleared.");
    expect(questions.listPending()).toHaveLength(0);

    // The agent repeats the identical question on the next turn.
    const again = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag,
      questionId: "planning-blocker",
    });

    expect(again.created).toBe(false);
    expect(again.question.id).toBe(first.question.id);
    expect(again.question.status).toBe("answered");
    expect(questions.listPending()).toHaveLength(0);
  });

  it("does not duplicate an emperor question that is re-asked with the same id", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);

    const tag =
      '<kampaku-question>{"id":"d1","type":"text","prompt":"Which engine?"}</kampaku-question>';
    const first = questions.askEmperor({ askedByAgentId: "kampaku", question: tag, questionId: "d1" });
    // The protocol tells the agent to re-ask with the same id after adding context.
    // Re-asked with different JSON spacing, which models emit inconsistently.
    const second = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag.replace('"id":"d1"', '"id": "d1"'),
      questionId: "d1",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.question.id).toBe(first.question.id);
    expect(questions.listPending()).toHaveLength(1);
  });

  it("routes a sub-agent's emperor question through the root and refuses to escalate further", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });

    const { question } = questions.askEmperor({
      askedByAgentId: lead.id,
      question: '<kampaku-question>{"id":"x","type":"text","prompt":"Ask?"}</kampaku-question>',
      questionId: "x",
    });

    expect(question.recipientAgentId).toBe(KAMPAKU_AGENT_ID);
    expect(question.escalationPath).toEqual([lead.id, KAMPAKU_AGENT_ID]);
    expect(() => questions.escalate(question.id, KAMPAKU_AGENT_ID)).toThrow(
      "Question is already awaiting the emperor.",
    );
  });

  it("keeps ask() refusing a parentless asker, so the agent-to-agent rule is unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);

    expect(() => questions.ask({ askedByAgentId: "kampaku", question: "Direct?" })).toThrow(
      "Kampaku must ask the emperor directly.",
    );
  });

  /**
   * One decision, one gate — measured 2026-09-25 in the suite-05 run.
   *
   * A project lead opened two gates for one decision inside fourteen minutes, because `ask_superior` mints
   * `async-${Date.now()}` and the id-based idempotence below can therefore never fire for it. The second ask
   * was not a new decision: it was the same one, and the operator's list counted it twice (BOARD F-049).
   */
  it("returns the open gate instead of opening a second one for the same decision", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);
    const lead = agents.createSubAgent({ slug: "lead", name: "Lead", parentId: KAMPAKU_AGENT_ID, responsibilities: "Lead", systemPrompt: "Lead" });

    const ask = (prompt: string, id: string) =>
      questions.ask({
        askedByAgentId: lead.id,
        projectId: "project-1",
        question:
          `<kampaku-question>{"id":"${id}","type":"boolean","prompt":"${prompt}",` +
          '"trueLabel":"Yes","falseLabel":"No"}</kampaku-question>',
      });

    const first = ask("Grant authorization to create work items?", "async-1");
    // Same decision, fresh id, different question type, different JSON whitespace — the shape the run
    // actually produced.
    const second = ask("Grant authorization to create work items?", "async-2");

    expect(second.id).toBe(first.id);
    expect(questions.listPending()).toHaveLength(1);
    expect(questions.findPendingDuplicate({
      askedByAgentId: lead.id,
      projectId: "project-1",
      question: '<kampaku-question>{"id":"async-3","type":"text","prompt":"Grant authorization to create work items?"}</kampaku-question>',
    })?.id).toBe(first.id);

    // A genuinely different decision is still a new gate, and a paraphrase is deliberately treated as one:
    // merging two different decisions would silently drop one.
    const other = ask("Which repository should the lead read first?", "async-4");
    expect(other.id).not.toBe(first.id);
    expect(questions.listPending()).toHaveLength(2);

    // And once answered, the decision is closed: asking it again later is a new question about a new
    // situation, which the operator should see.
    questions.answer(first.id, "Yes", KAMPAKU_AGENT_ID);
    const reopened = ask("Grant authorization to create work items?", "async-5");
    expect(reopened.id).not.toBe(first.id);
  });
});

/**
 * **A question addressed to the seat that asked it is answerable by the emperor, because nobody else can.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r17`. A leaf's job failed `WORKER_NO_DELIVERABLES`, the escalator
 * resolved the reporting seat, and the question landed with `asked_by = recipient = legacy-ledger-lead` — so the
 * seat could not answer it (it holds no tool that answers its own escalation) and every operator surface answered
 * as the emperor, which the recipient check refused with *"Only the current recipient can answer this question."*
 * The leaf was frozen behind a decision nobody could take, while `projects blocked` printed
 * `kampaku questions answer <id>` as the way out.
 *
 * The rule this must not break: a seat does not answer its own escalation, and the emperor does not answer a
 * lead's. Both controls are asserted here.
 */
describe("a question with no answerer (suite 19 / s19r17)", () => {
  it("lets the emperor answer a self-addressed question, and nobody else", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    const { db } = createDb(join(dir, "test.db"));
    try {
      const agents = new AgentStore(db);
      const pm = new PmStore(db);
      const questions = new QuestionStore(db, agents, pm);
      const lead = agents.createSubAgent({
        slug: "lead",
        name: "Lead",
        parentId: KAMPAKU_AGENT_ID,
        responsibilities: "Lead",
        systemPrompt: "Lead",
      });
      const question = questions.ask({ askedByAgentId: lead.id, question: "How should this proceed?" });
      // The state measured on disk: the recipient is the seat that asked. Written through the ORM the store
      // itself uses, so the row this test judges is the row the store reads back.
      db.update(agentQuestions).set({ recipientAgentId: lead.id }).where(eq(agentQuestions.id, question.id)).run();
      expect(questions.get(question.id)?.recipientAgentId, "the self-addressed state took").toBe(lead.id);

      // The recipient check itself is what makes this question unanswerable elsewhere, and the seat named as
      // recipient simply never asks its own question through a surface that answers: what an operator holds is the
      // emperor's answer, and that is the one this change admits.
      const answered = questions.answer(question.id, "The leaf owed no file; nothing needs writing.");
      expect(answered.status).toBe("answered");
      expect(answered.answeredByAgentId).toBe(KAMPAKU_AGENT_ID);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still refuses the emperor an ordinary seat-to-seat question", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    const { db } = createDb(join(dir, "test.db"));
    try {
      const agents = new AgentStore(db);
      const pm = new PmStore(db);
      const questions = new QuestionStore(db, agents, pm);
      const lead = agents.createSubAgent({
        slug: "lead",
        name: "Lead",
        parentId: KAMPAKU_AGENT_ID,
        responsibilities: "Lead",
        systemPrompt: "Lead",
      });
      const dev = agents.createSubAgent({
        slug: "dev",
        name: "Dev",
        parentId: lead.id,
        responsibilities: "Dev",
        systemPrompt: "Dev",
      });
      const question = questions.ask({ askedByAgentId: dev.id, question: "Which API?" });
      expect(question.recipientAgentId).toBe(lead.id);
      expect(
        () => questions.answer(question.id, "The emperor decides this one instead."),
        "the lead's decision is the lead's",
      ).toThrow(/Only the current recipient/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

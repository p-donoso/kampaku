import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import { PostActionReviewStore } from "../../src/persistence/post-action-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { Store } from "../../src/persistence/store.js";
import { eq } from "drizzle-orm";
import { agentQuestions } from "../../src/persistence/schema.js";
import {
  renderDurableState,
  snapshotForPrompt,
  type DurableStateSnapshot,
} from "../../src/agents/runtime/durable-state.js";

/**
 * A gate that was **answered** has to reach the conversation that asked it.
 *
 * Measured twice in one run of suite 03 (`s03r3`, fresh data dir, git `618e4c9`, five driven turns across two
 * projects), and both times the same way:
 *
 *   * `s3-infra` — `p0-infra` closed on `<kampaku-question id="s3-infra-docs-station">` (*"Keep the five
 *     stations as staffed, or add a sixth documentation station…"*). The operator answered it through the web
 *     UI, `GET /api/v1/questions/08a33493…` answered `answered` with the decision stored, and `p1-infra` —
 *     the next turn in the same conversation, `tools: none` — asked *"Documentation is the one uncovered
 *     aspect with real work behind it … how should it be owned?"*
 *   * `s3-webapp` — the gate was answered *"Real S3-backed UI — data comes from an external service this app
 *     consumes"*, and `p1-webapp` asked *"Does this app consume an external service for /items, or should it
 *     serve its own route handlers?"*
 *
 * The answer was invisible for two independent reasons, which is why it survived [F-049] and [F-050]:
 * `snapshotForPrompt` carried `openGates` from `questionStore.list("pending")` and nothing else, and
 * `buildHistoryContext` replays **messages** — the question is in the assistant's reply, the answer is a row
 * on the question and never a message. So the block said zero pending, the history showed a question with no
 * answer, and re-asking was the only reading available to the turn.
 *
 * What this lock holds, therefore, is the in-band fact and the instruction that goes with it:
 *
 *   1. the answered gate, with the operator's own decision, is in the block the next turn is given;
 *   2. it is rendered as **settled** — never among the open gates, never counted as pending;
 *   3. the block says a taken decision is a constraint, and that a decision which no longer fits is asked
 *      about as a **change**, not as the original question again;
 *   4. it is bounded — the few most recent per project, with the withheld count stated;
 *   5. it reaches the model's own `messages`, after the history that carries the question, in a real turn
 *      driven through the chat route.
 *
 * The model's behaviour is measured live (see the BOARD row's re-measurement); what is ours to lock is that
 * the turn cannot say it did not know.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

function snapshot(overrides: Partial<DurableStateSnapshot> = {}): DurableStateSnapshot {
  return {
    activeProject: null,
    projects: [],
    agents: [],
    questionsAwaitingEmperor: 0,
    questionsAwaitingAgent: 0,
    pendingBlockers: 0,
    workItemsByProject: {},
    openGates: [],
    answeredGates: [],
    ...overrides,
  };
}

describe("durable state — an answered gate", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.clearAllMocks();
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-answered-gate-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "llm",
    });
    mkdirSync(config.workspaceRoot, { recursive: true });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const journalStore = new JournalStore(db, pmStore);
    const wikiStore = new WikiStore(db);
    const postActionStore = new PostActionReviewStore(db, pmStore);
    const refusalStore = new RefusalStore(db);
    bootstrapProject(store, config);

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
      postActionStore,
      refusalStore,
    );

    const toolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      memoryStore,
      questionStore,
      blockageStore,
      journalStore,
      wikiStore,
      refusalStore,
      postActionStore,
    } as unknown as Parameters<typeof snapshotForPrompt>[0];

    return {
      app,
      config,
      store,
      db,
      agentStore,
      conversationStore,
      pmStore,
      questionStore,
      toolContext,
      postMessage: (body: Record<string, unknown>) =>
        app.request("/api/v1/agents/kampaku/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    };
  }

  /** A project of the factory's own, the way one is opened, with a lead. */
  function openProject(
    f: ReturnType<typeof setup>,
    slug: string,
  ): { id: string; slug: string } {
    const now = new Date().toISOString();
    const lead = f.agentStore.createSubAgent({
      slug: `${slug}-lead`,
      name: `${slug} lead`,
      parentId: f.agentStore.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: `Own ${slug}`,
      systemPrompt: `Own ${slug}`,
    });
    const project = f.store.createProject({
      id: `${slug}-id`,
      slug,
      name: slug,
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    } as never);
    return { id: project.id, slug: project.slug };
  }

  /** Raise a required gate the way a chat turn does, then answer it the way the web UI does. */
  function raiseAndAnswer(
    f: ReturnType<typeof setup>,
    input: {
      projectId: string;
      gateId: string;
      prompt: string;
      decision: string;
      /** Decided-at, pinned so "most recently decided" has an order a test can assert. */
      decidedAt: string;
    },
  ) {
    const { question } = f.questionStore.askEmperor({
      askedByAgentId: f.agentStore.getAgentBySlugOrId("kampaku")!.id,
      question:
        `<kampaku-question>${JSON.stringify({
          id: input.gateId,
          type: "single_choice",
          prompt: input.prompt,
          options: ["Keep the five stations", "Add a sixth documentation station"],
          required: true,
        })}</kampaku-question>`,
      questionId: input.gateId,
      projectId: input.projectId,
    });
    f.questionStore.answer(question.id, input.decision);
    // The store stamps its own clock, and seven answers inside one test share a millisecond — so the order
    // is pinned rather than hoped for.
    f.db
      .update(agentQuestions)
      .set({ answeredAt: input.decidedAt })
      .where(eq(agentQuestions.id, question.id))
      .run();
    return question.id;
  }

  it("carries the answered gate and the operator's own decision into the block", () => {
    const f = setup();
    const project = openProject(f, "s3-infra");
    raiseAndAnswer(f, {
      projectId: project.id,
      gateId: "s3-infra-docs-station",
      prompt: "Keep the five stations as staffed, or add a sixth documentation station?",
      decision: "Keep the five stations — document within existing stations",
      decidedAt: "2026-10-19T18:26:39.782Z",
    });

    const block = renderDurableState(snapshotForPrompt(f.toolContext, project.id));

    expect(block).toContain("Answered gates — decisions the emperor has already taken");
    expect(block).toContain(", s3-infra] Keep the five stations as staffed");
    expect(block).toContain(
      "Keep the five stations as staffed, or add a sixth documentation station?",
    );
    // Verbatim, because the decision is the thing a later turn must treat as settled and a paraphrase is a
    // second decision nobody made.
    expect(block).toContain("DECIDED");
    expect(block).toContain("Keep the five stations — document within existing stations");
  });

  it("renders a settled decision as settled: not open, and not counted as pending", () => {
    const f = setup();
    const project = openProject(f, "s3-infra");
    raiseAndAnswer(f, {
      projectId: project.id,
      gateId: "s3-infra-docs-station",
      prompt: "How should documentation be owned?",
      decision: "Keep the five stations — document within existing stations",
      decidedAt: "2026-10-19T18:26:39.782Z",
    });

    const block = renderDurableState(snapshotForPrompt(f.toolContext, project.id));

    // The shape the two re-asking turns were reading: zero pending, a question in the history, no answer
    // anywhere. The count is still zero — that part was never wrong — so the answered list is what has to
    // make the difference.
    expect(block).toContain("Pending questions: 0 total.");
    expect(block).not.toContain("Open gates");
    expect(block).toContain("Answered gates");
  });

  it("tells the reader a taken decision is a constraint, and how to say it went stale", () => {
    const block = renderDurableState(snapshot());

    expect(block).toContain("An **answered gate** is a decision already taken");
    expect(block).toMatch(/do not ask that question again in any wording/i);
    expect(block).toMatch(/not a topic to\s+reopen/i);
    // The escape the row asks for: a decision that no longer fits is raised as a change, not re-asked.
    expect(block).toMatch(/say what changed and ask for \*\*that\*\* change/i);
    expect(block).toMatch(/instead of restating the original question unchanged/i);
  });

  it("scopes the decisions to the conversation's project", () => {
    const f = setup();
    const infra = openProject(f, "s3-infra");
    const webapp = openProject(f, "s3-webapp");
    raiseAndAnswer(f, {
      projectId: infra.id,
      gateId: "s3-infra-docs-station",
      prompt: "How should documentation be owned?",
      decision: "Keep the five stations — document within existing stations",
      decidedAt: "2026-10-19T18:26:39.782Z",
    });
    raiseAndAnswer(f, {
      projectId: webapp.id,
      gateId: "s3-webapp-target-scope",
      prompt: "Is the target a real S3-backed item UI?",
      decision: "Real S3-backed UI — data comes from an external service this app consumes",
      decidedAt: "2026-10-19T18:31:20.786Z",
    });

    const infraBlock = renderDurableState(snapshotForPrompt(f.toolContext, infra.id));
    expect(infraBlock).toContain("Keep the five stations — document within existing stations");
    // The webapp's decision is not this conversation's business, and every turn pays for what it carries.
    expect(infraBlock).not.toContain("Real S3-backed UI");

    const webappBlock = renderDurableState(snapshotForPrompt(f.toolContext, webapp.id));
    expect(webappBlock).toContain(
      "Real S3-backed UI — data comes from an external service this app consumes",
    );
    expect(webappBlock).not.toContain("Keep the five stations — document within existing stations");
  });

  it("bounds the decisions to the few most recent, and says how many it withheld", () => {
    const f = setup();
    const project = openProject(f, "cli");
    for (let index = 1; index <= 7; index += 1) {
      raiseAndAnswer(f, {
        projectId: project.id,
        gateId: `decision-${index}`,
        prompt: `Decision ${index}?`,
        decision: `Chose option ${index}`,
        decidedAt: `2026-10-19T18:30:0${index}.000Z`,
      });
    }

    const snapshotForProject = snapshotForPrompt(f.toolContext, project.id);
    expect(snapshotForProject.answeredGates).toHaveLength(7);
    // Most recently decided first: a follow-up turn is about the newest decisions, not the oldest.
    expect(snapshotForProject.answeredGates[0].decision).toBe("Chose option 7");

    const block = renderDurableState(snapshotForProject);
    expect(block).toContain("Chose option 7");
    expect(block).toContain("Chose option 3");
    expect(block).not.toContain("Chose option 2");
    expect(block).toContain("…and 2 earlier decisions, not shown here.");
  });

  /**
   * The end of the path, through the surfaces the run used: a turn raises a required gate, the operator
   * answers it through the documented route (the web UI's own), and the **next** turn in that conversation
   * is handed the decision — in a system message placed *after* the history, so the precedence rule the block
   * already states can do its work.
   */
  it("puts the answered decision in the next turn's prompt, after the history that carries the question", async () => {
    const f = setup();
    const project = openProject(f, "s3-infra");

    mockBroker.chatWithTools
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: [
                "The roster follows the repository: five stations, nothing invented.",
                '<kampaku-question>{"id":"s3-infra-docs-station","type":"single_choice",' +
                  '"prompt":"Keep the five stations as staffed, or add a sixth documentation station?",' +
                  '"options":["Keep the five stations","Add a sixth documentation station"],' +
                  '"required":true}</kampaku-question>',
              ].join("\n"),
            },
          },
        ],
      })
      // The second turn, asked the question the operator had just answered. Its reply is not what this test
      // measures — the prompt it was given is.
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [{ message: { content: "Documentation stays within the five stations.", tool_calls: undefined } }],
      });

    const first = await f.postMessage({
      message: "For this project, staff the stations the work needs.",
      project_id: project.id,
    });
    expect(first.status).toBe(200);
    const conversationId = ((await first.json()) as { conversation_id: string }).conversation_id;

    const pending = f.questionStore.list("pending");
    expect(pending).toHaveLength(1);

    // The documented surface — the same route the web UI's answer card posts to.
    const answered = await f.app.request(`/api/v1/questions/${pending[0].id}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answer: "Keep the five stations — document within existing stations",
      }),
    });
    expect(answered.status).toBe(200);
    expect(f.questionStore.get(pending[0].id)?.status).toBe("answered");

    const second = await f.postMessage({
      message: "Documentation is the one uncovered aspect with real work behind it. How should it be owned?",
      conversation_id: conversationId,
    });
    expect(second.status).toBe(200);

    // What the model was actually given, on the turn that used to re-ask.
    expect(mockBroker.chatWithTools).toHaveBeenCalledTimes(2);
    const messages = mockBroker.chatWithTools.mock.calls[1][0] as Array<{
      role: string;
      content: string;
    }>;
    const blockIndex = messages.findIndex(
      (message) => message.role === "system" && message.content.includes("CURRENT DURABLE STATE"),
    );
    expect(blockIndex).toBeGreaterThan(-1);

    const block = messages[blockIndex].content;
    expect(block).toContain("Answered gates");
    expect(block).toContain("Keep the five stations — document within existing stations");
    expect(block).toContain(
      "Keep the five stations as staffed, or add a sixth documentation station?",
    );
    // The turn is told what to do with it, not merely shown it.
    expect(block).toMatch(/do not ask that question again in any wording/i);

    // And it arrives *after* the history that carries the unanswered question, so it outranks it.
    const questionIndex = messages.findIndex(
      (message) => message.role === "assistant" && message.content.includes("<kampaku-question>"),
    );
    expect(questionIndex).toBeGreaterThan(-1);
    expect(blockIndex).toBeGreaterThan(questionIndex);
  });
});

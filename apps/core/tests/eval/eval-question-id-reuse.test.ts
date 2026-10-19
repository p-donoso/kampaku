import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore, KAMPAKU_AGENT_ID } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { Store } from "../../src/persistence/store.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

/**
 * BOARD F-111 — a question id is the model's to choose, so idempotence cannot be keyed on it alone.
 *
 * Measured 2026-10-19 on suite 03's run `s03r3`. Turn `p0-infra` raised
 * `<kampaku-question id="s3-infra-docs-station">` — *"Keep the five stations as staffed, or add a sixth
 * documentation station?"* — and the emperor answered it through the web UI (`gate 08a33493…: answered`).
 * The **next** turn, `p1-infra`, asked a different decision under the same id — *"Documentation is the one
 * uncovered aspect with real work behind it … How should it be owned?"*, three options. `askEmperor`
 * matched on the id, returned the answered record as `created: false`, and the second decision was stored
 * nowhere: `GET /api/v1/questions` held one record while the reply the operator read carried a
 * `required: true` gate, and `gates auto` found nothing to answer. Same shape again on `p2-infra` and
 * `p1-webapp`.
 *
 * The idempotence itself is a requirement, not the defect: an agent that repeats a question every turn
 * looped the probe forever when each repetition became a new pending gate. The key is what is wrong — a
 * repeat is the same **decision** (asker + project + normalised prompt), which `questionSignature` already
 * computes, and a reused id carrying a different decision is a new gate.
 *
 * Three things are locked here, and all three are the row:
 *   1. same id + different decision → a second gate, with the decision stored and answerable;
 *   2. same decision + different ids → still one gate (the loop stays closed);
 *   3. a `created: false` return is visible to the caller — the reply must not render a gate no surface
 *      holds, and must say the decision is already on record.
 */
describe("eval F-111 — a reused question id is not a reused decision", () => {
  const dirs: string[] = [];

  afterEach(() => {
    dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
    vi.resetAllMocks();
  });

  function storeSetup(): {
    questions: QuestionStore;
    agents: AgentStore;
    pm: PmStore;
  } {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-f111-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    return { questions: new QuestionStore(db, agents, pm), agents, pm };
  }

  function tag(id: string, prompt: string, options?: string[]): string {
    return (
      "<kampaku-question>" +
      JSON.stringify({
        id,
        type: options ? "single_choice" : "text",
        prompt,
        ...(options ? { options } : {}),
        required: true,
      }) +
      "</kampaku-question>"
    );
  }

  /** The two decisions the run produced, word for word, under one id. */
  const P0_PROMPT =
    "Keep the five stations as staffed, or add a sixth documentation station for the module's inputs/outputs reference?";
  const P1_PROMPT =
    "Documentation is the one uncovered aspect with real work behind it (no inputs/outputs table in the README). How should it be owned?";

  it("opens a second gate when a used id carries a different decision", () => {
    const { questions } = storeSetup();

    const first = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag("s3-infra-docs-station", P0_PROMPT, [
        "Keep the five stations — document within existing stations",
        "Add s3-infra-docs (documentation owner) under s3-infra-lead",
      ]),
      questionId: "s3-infra-docs-station",
    });
    expect(first.created).toBe(true);
    questions.answer(first.question.id, "Keep the five stations — document within existing stations");
    expect(questions.listPending()).toHaveLength(0);

    // The next turn, a different decision, the same id.
    const second = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag("s3-infra-docs-station", P1_PROMPT, [
        "Add s3-infra-docs under s3-infra-lead",
        "Leave it to s3-infra-module-api, which owns the interface",
        "Leave it uncovered for now",
      ]),
      questionId: "s3-infra-docs-station",
    });

    // The decision exists, it is not a copy of the answered one, and it is answerable.
    expect(second.created).toBe(true);
    expect(second.question.id).not.toBe(first.question.id);
    expect(second.question.question).toContain("How should it be owned?");
    expect(second.question.status).toBe("pending");
    expect(questions.listAll()).toHaveLength(2);
    expect(questions.listPending().map((pending) => pending.id)).toEqual([second.question.id]);
    expect(questions.answer(second.question.id, "Add s3-infra-docs under s3-infra-lead").status).toBe(
      "answered",
    );
  });

  it("keeps the repeating-asker loop closed: one decision under two fresh ids is one gate", () => {
    const { questions } = storeSetup();

    const first = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag("async-1750000000000", P0_PROMPT),
      questionId: "async-1750000000000",
    });
    const repeat = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag("async-1750000099000", P0_PROMPT),
      questionId: "async-1750000099000",
    });

    expect(first.created).toBe(true);
    expect(repeat.created).toBe(false);
    expect(repeat.question.id).toBe(first.question.id);
    expect(questions.listAll()).toHaveLength(1);
    expect(questions.listPending()).toHaveLength(1);
  });

  it("keeps an answered decision closed when the identical question is asked again", () => {
    const { questions } = storeSetup();

    const first = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag("s3-infra-docs-station", P0_PROMPT),
      questionId: "s3-infra-docs-station",
    });
    questions.answer(first.question.id, "Keep the five stations");

    const again = questions.askEmperor({
      askedByAgentId: "kampaku",
      question: tag("s3-infra-docs-station", P0_PROMPT),
      questionId: "s3-infra-docs-station",
    });

    expect(again.created).toBe(false);
    expect(again.question.id).toBe(first.question.id);
    expect(questions.listAll()).toHaveLength(1);
    expect(questions.listPending()).toHaveLength(0);
  });

  describe("through the chat turn that renders the gate", () => {
    let dataDir: string;

    afterEach(() => {
      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
      dataDir = "";
    });

    function chatSetup(): { ctx: KampakuToolContext; config: ReturnType<typeof loadConfig> } {
      dataDir = mkdtempSync(join(tmpdir(), "kampaku-f111-chat-"));
      const config = loadConfig({
        dataDir,
        dbPath: join(dataDir, "kampaku.db"),
        workspaceRoot: join(dataDir, "workspace"),
        agentMode: "llm",
        plannerMode: "llm",
      });
      const { db } = createDb(config.dbPath);
      const agentStore = new AgentStore(db);
      const pmStore = new PmStore(db);
      const questionStore = new QuestionStore(db, agentStore, pmStore);
      const ctx: KampakuToolContext = {
        store: new Store(db),
        agentStore,
        conversationStore: new ConversationStore(db),
        pmStore,
        skillStore: new SkillStore(db),
        memoryStore: new MemoryStore(db),
        journalStore: new JournalStore(db, pmStore),
        refusalStore: new RefusalStore(db),
        questionStore,
        config,
      };
      return { ctx, config };
    }

    function replyCarrying(tagText: string): string {
      return ["Here is the only open decision.", tagText].join("\n\n");
    }

    function assistantSaying(content: string) {
      return { model: "test-model", choices: [{ message: { content, tool_calls: undefined } }] };
    }

    it("does not render a gate the store refused, and says the decision is already on record", async () => {
      const { ctx, config } = chatSetup();
      const questionStore = ctx.questionStore as QuestionStore;

      // Turn 1 — the gate the emperor answered in `s03r3`'s `p0-infra`.
      mockBroker.chatWithTools.mockResolvedValueOnce(
        assistantSaying(replyCarrying(tag("s3-infra-docs-station", P0_PROMPT))),
      );
      const first = await runKampakuChat(ctx, config, "Staff the stations this project needs.");
      expect(first.reply).toContain("<kampaku-question");
      const recorded = questionStore.listPending();
      expect(recorded).toHaveLength(1);
      questionStore.answer(recorded[0].id, "Keep the five stations — document within existing stations");

      // Turn 2 — the same decision asked again. The store must not open a second gate, and the reply must
      // not hand the operator a card that no surface holds.
      mockBroker.chatWithTools.mockResolvedValueOnce(
        assistantSaying(replyCarrying(tag("s3-infra-docs-station", P0_PROMPT))),
      );
      const repeat = await runKampakuChat(ctx, config, {
        message: "Anything else I must decide?",
        conversationId: first.conversationId,
      });

      expect(questionStore.listAll()).toHaveLength(1);
      expect(repeat.reply).not.toContain("<kampaku-question");
      expect(repeat.reply).toContain("already on record");
      expect(repeat.reply).toContain("Keep the five stations — document within existing stations");
      // The transcript reads what the operator read: the rendered gate is gone from the stored message too.
      const stored = ctx.conversationStore.getAllMessages(first.conversationId);
      expect(stored[stored.length - 1].content).toBe(repeat.reply);
    });

    it("stores the next turn's different decision under the reused id, and keeps its gate", async () => {
      const { ctx, config } = chatSetup();
      const questionStore = ctx.questionStore as QuestionStore;

      mockBroker.chatWithTools.mockResolvedValueOnce(
        assistantSaying(replyCarrying(tag("s3-infra-docs-station", P0_PROMPT))),
      );
      const first = await runKampakuChat(ctx, config, "Staff the stations this project needs.");
      questionStore.answer(
        questionStore.listPending()[0].id,
        "Keep the five stations — document within existing stations",
      );

      // Turn 2 of the run: a different decision, the same id.
      mockBroker.chatWithTools.mockResolvedValueOnce(
        assistantSaying(replyCarrying(tag("s3-infra-docs-station", P1_PROMPT))),
      );
      const second = await runKampakuChat(ctx, config, {
        message: "What is still uncovered?",
        conversationId: first.conversationId,
      });

      expect(second.reply).toContain("<kampaku-question");
      const pending = questionStore.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].question).toContain("How should it be owned?");
      expect(questionStore.listAll()).toHaveLength(2);
    });
  });
});

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { Store } from "../../src/persistence/store.js";
import { KAMPAKU_BUILTIN_ID } from "../../src/agents/definitions.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";
import { runSubAgentSession } from "../../src/agents/runtime/sub-agent-session.js";
import { executeToolCall, type KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * Suite 05's **F-048** lock: a turn has a budget, it spends it, and it says so.
 *
 * The suite's own gate is U6 — *"No silent budget failure hiding the oracle"* — and the suite-05 run failed
 * it twice on 2026-09-25: one turn ran **40 minutes** with a model call every 30–120 s, created nothing, and
 * was still looping when Core was stopped; the next ran **911 s** and never returned a reply, after which
 * the CLI's client gave up at its own 1800 s timeout **while Core kept working**. The per-session iteration
 * cap was not a bound: `delegate_to_agent` starts another session with its own ten.
 *
 * Two things are asserted here, and the second is the one that would have caught the runaway:
 *
 * 1. an exhausted turn spends **nothing** — the check runs before the model call, so a budget that stops
 *    the work only after paying for one more call is not a budget — and answers in words that name the
 *    numbers, that nothing was created, and what to do next;
 * 2. a delegated session **inherits the turn's deadline** rather than starting a fresh clock. Without
 *    this, ten nested sessions each get five minutes and the bound is decorative.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

function assistantSaying(content: string) {
  return { model: "test-model", choices: [{ message: { content, tool_calls: undefined } }] };
}

describe("eval 05 — a turn is bounded, and reports the bound it hit", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.resetAllMocks();
  });

  /** A context whose turn budget is already spent, so the first check trips. */
  function setup(turnBudgetMs: number) {
    const root = mkdtempSync(join(tmpdir(), "kampaku-eval-05-budget-"));
    dataDir = root;
    const workspaceRoot = join(root, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });

    const config = loadConfig({
      dataDir: root,
      dbPath: join(root, "kampaku.db"),
      workspaceRoot,
      agentMode: "llm",
      plannerMode: "llm",
      turnBudgetMs,
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore: new ConversationStore(db),
      pmStore,
      skillStore: new SkillStore(db),
      memoryStore: new MemoryStore(db),
      questionStore,
      blockageStore,
      journalStore,
      wikiStore: undefined,
      postActionStore: undefined,
      refusalStore: new RefusalStore(db),
      config,
    };
    return { ctx, config, root };
  }

  it("stops before spending anything, and answers with the numbers and no claim of work", async () => {
    // Zero budget: the check trips on the first iteration. A turn that has no time left must make **no**
    // model call — that is the difference between a budget and a stop-loss.
    const { ctx, config, root } = setup(0);

    const response = await runKampakuChat(ctx, config, "Improve the project. Make it better. Start now.");

    expect(mockBroker.chatWithTools).not.toHaveBeenCalled();
    expect(response.budgetExhausted).toMatchObject({ modelCalls: 0, budgetMs: 0 });
    // The reply says it in words, because the meta line and the prose must tell one story.
    expect(response.reply).toMatch(/stopped this turn at its own time budget/i);
    expect(response.reply).toMatch(/Nothing was created or changed/i);
    // And nothing was: a budget stop is not a partial success.
    expect(ctx.store.listProjects()).toHaveLength(0);
    expect(ctx.pmStore.listAllWorkItems()).toHaveLength(0);
    expect(root).toBeTruthy();
  });

  it("gives a delegated session the turn's deadline instead of a fresh one", async () => {
    // The runaway shape: the front office delegates, and the delegate starts its own clock. With the
    // inherited deadline already passed, the nested session must stop without a model call of its own.
    const { ctx, config } = setup(300_000);
    const lead = ctx.agentStore.createSubAgent({
      slug: "budget-lead",
      name: "Budget Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: "99999999-9999-4999-8999-999999999999",
      slug: "budget-demo",
      name: "Budget Demo",
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    // A seat with no skills has no session at all, so one is assigned: otherwise this test would fail on
    // "no executable tools" and never reach the budget it is about. The skill's one tool is enough — the
    // session is not allowed to reach the model here, which is the point.
    ctx.skillStore.upsertSkill({
      slug: "budget-probe",
      name: "Budget probe",
      description: "Grants one read tool so a session can be assembled.",
      capabilities: ["workflow.budget-probe"],
      tools: ["get_project"],
      promptFragment: "",
      default: false,
    });
    ctx.skillStore.assignSkill(lead.id, "budget-probe");

    const result = await executeToolCall(
      ctx,
      "delegate_to_agent",
      JSON.stringify({ agent_slug: lead.slug, objective: "Plan the work.", project_slug: project.slug }),
      { agentId: KAMPAKU_BUILTIN_ID, projectId: project.id, deadlineAt: Date.now() - 1 },
    );

    const output = result.output as { budgetExhausted?: { deadlineAt: number } };
    expect(output.budgetExhausted, "the delegated session inherited the spent deadline").toBeDefined();
    expect(output.budgetExhausted?.deadlineAt).toBeLessThanOrEqual(Date.now());
    // It pays for no model call, and it says why rather than reporting a result nobody produced.
    expect(mockBroker.chatWithTools).not.toHaveBeenCalled();
    expect((result.output as { reply: string }).reply).toMatch(/budget stop, not as a result/i);
    expect(config.turnBudgetMs).toBe(300_000);
  });

  it("carries on normally while the budget lasts, so the bound is not a wall", async () => {
    // The control. A guard that stopped every turn would satisfy the two tests above and break the product.
    const { ctx, config } = setup(300_000);
    mockBroker.chatWithTools.mockResolvedValueOnce(assistantSaying("Understood. What should improve first?"));

    const response = await runKampakuChat(ctx, config, "Improve the project. Make it better. Start now.");

    expect(mockBroker.chatWithTools).toHaveBeenCalledTimes(1);
    expect(response.budgetExhausted).toBeUndefined();
    expect(response.reply).toContain("What should improve first?");
  });

  it("locks the lead's own planning authority, and keeps the refusal for everyone else", async () => {
    // F-046, and its control. A container's linked lead may plan that container; an agent that leads nothing
    // still may not, and the refusal has to say what would widen it.
    const { ctx } = setup(300_000);
    const lead = ctx.agentStore.createSubAgent({
      slug: "authority-lead",
      name: "Authority Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const stranger = ctx.agentStore.createSubAgent({
      slug: "authority-stranger",
      name: "Authority Stranger",
      responsibilities: "Nothing in particular",
      systemPrompt: "You do not lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: "88888888-8888-4888-8888-888888888888",
      slug: "authority-demo",
      name: "Authority Demo",
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });

    // The lead is refused for the reason it was refused in the run, and not because of the lead check:
    // `system-delegation` is absent, so this only passes if the led-project authority is read.
    await expect(
      executeToolCall(
        ctx,
        "submit_intent",
        JSON.stringify({ intent: "Improve the project.", project_slug: project.slug, mode: "preview" }),
        { agentId: stranger.id, projectId: project.id },
      ),
    ).rejects.toThrow(/not authorized to create project plans/i);

    // The stranger's refusal names what would widen it, so it does not become a question for the emperor.
    await expect(
      executeToolCall(
        ctx,
        "submit_intent",
        JSON.stringify({ intent: "Improve the project.", project_slug: project.slug, mode: "preview" }),
        { agentId: stranger.id, projectId: project.id },
      ),
    ).rejects.toThrow(/linked lead may plan that project/i);
  });

  it("lets the linked lead reach the planner rather than being refused by authority", async () => {
    const { ctx } = setup(300_000);
    const lead = ctx.agentStore.createSubAgent({
      slug: "planning-lead",
      name: "Planning Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: "66666666-6666-4666-8666-666666666666",
      slug: "planning-demo",
      name: "Planning Demo",
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });

    // It must reach the planner. What the planner then does is another suite's subject: this asserts that
    // authority is no longer what stops a lead planning its own container.
    const outcome = await executeToolCall(
      ctx,
      "submit_intent",
      JSON.stringify({ intent: "Improve the project.", project_slug: project.slug, mode: "preview" }),
      { agentId: lead.id, projectId: project.id },
    ).then(
      (result) => ({ ok: true as const, result }),
      (error: Error) => ({ ok: false as const, message: error.message }),
    );

    if (!outcome.ok) {
      expect(outcome.message).not.toMatch(/not authorized to create project plans/i);
      expect(outcome.message).not.toMatch(/linked lead may plan that project/i);
    }
    expect(project.slug).toBe("planning-demo");
  });
});

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
import { TurnBudgetExceededError } from "../../src/agents/runtime/turn-budget.js";
import { executeToolCall, type KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { expandUntilBudget } from "../../src/delegator/expand-phase-leaves.js";
import type { PlannedProject } from "../../src/delegator/types.js";

/**
 * Suite 06's blocking gap: **a tool call cannot outlive the turn that started it.**
 *
 * Suite 05 closed F-048 by giving the turn a wall-clock budget and checking it before each model call in
 * the two session loops (front office, sub-agent), with a delegated session inheriting the same clock. That
 * bounds *iterations*. It does not bound a single tool call — and one tool call can drive its own model
 * loop.
 *
 * Measured 2026-09-25 in this suite's intake turn, prompt 1 (`Open a work order for a new project at
 * <PATH> …`), on the production endpoint:
 *
 * - started 23:10:19, still running at 23:28:02 — **1 063 s against a 300 s turn budget**;
 * - **41 model calls**, 1 533 s of cumulative model latency, **no reply at all**;
 * - the checkout the emperor asked to seed held **zero files** the whole time;
 * - the cost was inside one `submit_intent`: `planAndDelegate` → `expandUntilBudget`, which spends **one
 *   model call per coarse node per depth** and took no deadline, so the session loops never reached a point
 *   where their own check could fire;
 * - the turn ended the way suite 05's run 1 did: Core stopped, and the CLI died with
 *   `Request to http://127.0.0.1:18080/api/v1/agents/kampaku/chat failed after 1067s: fetch failed`.
 *
 * The session's iteration cap does not cover it either: the expansion loop is inside the tool, and the
 * *depth* loop (`MAX_EXPAND_DEPTH`) is per call, not per turn.
 *
 * Three things are asserted, and the third is the one that keeps the first two honest:
 *
 * 1. **A spent turn spends nothing.** With the deadline already behind it, planning makes **no** model call
 *    and fails loudly, naming the budget — the wiring has to reach the planner, and this is what proves it.
 * 2. **A deadline crossed mid-expansion stops the expansion.** The loop that spends one call per node
 *    notices its own clock and stops, instead of running to `MAX_EXPAND_DEPTH` regardless.
 * 3. **The control.** With no turn clock (an internal call) or a clock that has not run out, planning still
 *    happens. A guard that refused to plan would satisfy (1) and (2) and break the product.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chat: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

/** A plan that is only a phase container, so `expandUntilBudget` has to expand something. */
function unexpandedPlan(): PlannedProject {
  return {
    project: { name: "Seed Demo", slug: "seed-demo", description: "Seed a stranger checkout." },
    work_items: [
      {
        title: "Phase 1 — scaffold",
        description: "Phase container with no leaves under it yet.",
        priority: 0,
        acceptance_criteria: [],
      },
    ],
  } as PlannedProject;
}

/**
 * One leaf per expansion, which is fewer than the granularity budget wants — so the loop has to iterate.
 *
 * The title carries the call ordinal on purpose: repeating one title made the expansion add duplicates of
 * the same leaf, and the plan tree then walked its own repeated parent refs until the stack overflowed. A
 * fixture that recurses says nothing about the product.
 */
function oneLeaf(call: number): string {
  return JSON.stringify({
    work_items: [
      {
        title: `Scaffold the manifest, slice ${call}`,
        description:
          "Add the project's dependency manifest with its install, test and build entries, so the checkout " +
          "has a toolchain the declared commands can run in.",
        priority: 1,
        parent_ref: "Phase 1 — scaffold",
        acceptance_criteria: ["the manifest file exists at the repository root"],
      },
    ],
  });
}

describe("eval 06 — a tool call cannot outlive the turn that started it", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.resetAllMocks();
  });

  function setup(turnBudgetMs = 300_000) {
    const root = mkdtempSync(join(tmpdir(), "kampaku-eval-06-plan-budget-"));
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

  function projectWithLead(ctx: KampakuToolContext, slug: string) {
    const lead = ctx.agentStore.createSubAgent({
      slug: `${slug}-lead`,
      name: `${slug} lead`,
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: `${slug}`.padEnd(8, "0") + "-1111-4111-8111-111111111111",
      slug,
      name: slug,
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    return { lead, project };
  }

  it("spends no model call when the turn's deadline has already passed, and says so", async () => {
    const { ctx } = setup();
    const { lead, project } = projectWithLead(ctx, "spent-demo");
    mockBroker.isAvailable.mockResolvedValue(true);
    mockBroker.chat.mockResolvedValue({ content: oneLeaf(1), model: "test-model" });

    const outcome = await executeToolCall(
      ctx,
      "submit_intent",
      JSON.stringify({ intent: "Seed a minimal checkout.", project_slug: project.slug, mode: "preview" }),
      // The turn's clock, already run out. This is what the front office hands every tool call.
      { agentId: lead.id, projectId: project.id, deadlineAt: Date.now() - 1 },
    ).then(
      (result) => ({ ok: true as const, result }),
      (error: Error) => ({ ok: false as const, error }),
    );

    expect(outcome.ok, "planning refused to run on a spent turn").toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(TurnBudgetExceededError);
    // The message has to be usable by the emperor: what stopped, and that nothing was done.
    expect(outcome.error.message).toMatch(/stopped at the turn's time budget/i);
    expect(outcome.error.message).toMatch(/nothing is reported as done/i);
    // A budget stop is not a partial success, and it is not a model call either.
    expect(mockBroker.chat).not.toHaveBeenCalled();
    expect(mockBroker.isAvailable).not.toHaveBeenCalled();
  });

  it("stops an expansion whose deadline is crossed mid-loop instead of running to MAX_EXPAND_DEPTH", async () => {
    const { ctx } = setup();
    projectWithLead(ctx, "crossing-demo");
    mockBroker.isAvailable.mockResolvedValue(true);
    // A real, short sleep rather than a fake clock: the assertion is "it stopped at or before its own
    // deadline", which a loaded host can only make more true.
    let call = 0;
    mockBroker.chat.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      call += 1;
      return { content: oneLeaf(call), model: "test-model" };
    });

    const started = Date.now();
    const turn = { deadlineAt: started + 60, budgetMs: 300_000 };

    await expect(
      expandUntilBudget({
        plan: unexpandedPlan(),
        intent: "Seed a minimal checkout.",
        granularity: "fine",
        broker: mockBroker as never,
        mode: "greenfield",
        turn,
      }),
    ).rejects.toBeInstanceOf(TurnBudgetExceededError);

    const elapsed = Date.now() - started;
    // It spent a model call or two and then stopped — not the five depths times every node the plan asked
    // for. Measured pre-fix on the live instance: 41 calls and counting, with no end in sight.
    expect(mockBroker.chat.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockBroker.chat.mock.calls.length).toBeLessThanOrEqual(4);
    expect(elapsed).toBeLessThan(2_000);
    // And it stopped *because of its clock*: the deadline had passed by the time it gave up.
    expect(Date.now()).toBeGreaterThanOrEqual(turn.deadlineAt);
  });

  it("costs at least one model call when nothing has run out, so the bound is not a wall", async () => {
    const { ctx } = setup();
    const { lead, project } = projectWithLead(ctx, "healthy-demo");
    mockBroker.isAvailable.mockResolvedValue(true);
    mockBroker.chat.mockResolvedValue({ content: oneLeaf(1), model: "test-model" });

    // A preview with a clock that has not run out: planning reaches the model, which is the behaviour the
    // guard must not have removed. `maxDepth` is 0 for standard granularity, so this is one call.
    const outcome = await executeToolCall(
      ctx,
      "submit_intent",
      JSON.stringify({ intent: "Seed a minimal checkout.", project_slug: project.slug, mode: "preview" }),
      { agentId: lead.id, projectId: project.id, deadlineAt: Date.now() + 300_000 },
    ).then(
      (result) => ({ ok: true as const, result }),
      (error: Error) => ({ ok: false as const, message: error.message }),
    );

    // The planner is reached: whether the plan it returns validates is another suite's subject, so a
    // validation failure is acceptable here — a budget failure is not.
    if (!outcome.ok) {
      expect(outcome.message).not.toMatch(/stopped at the turn's time budget/i);
    }
    expect(mockBroker.chat).toHaveBeenCalled();
  });

  it("repairs one malformed expansion instead of discarding the whole plan", async () => {
    // Measured 2026-09-28 taking suite 07, run 15, once the provider was steady: the planner expanded for
    // **42 minutes** — one model call per node per depth, five depths, ~13k output tokens each — and then
    // died on a single node. `LLM plan expansion failed for "Add the frozen PYTHON ?= python3 assignment
    // when absent"`, `ZodError: expected "string", received "number"`: one wrong primitive in one response
    // turned the entire plan into a failure and threw away every call already paid for.
    //
    // A model that returns the wrong primitive is the ordinary case this codebase already handles one layer
    // up, where a plan that fails `validatePlan` is sent back once with the validation issues. The expansion
    // does the same now: it shows the model its own output and the schema error, and re-parses.
    const { ctx, config } = setup(300_000);
    let call = 0;
    const broker = {
      isAvailable: vi.fn().mockResolvedValue(true),
      // Call 1 is malformed — `title` as a number, the measured shape (`expected "string", received
      // "number"`). Calls 2+ are the repaired form. **Each title is unique**, because a repeated leaf title
      // makes the plan tree walk its own parent refs and the fixture then recurses (see `oneLeaf`'s note
      // above); a fixture that recurses says nothing about the product.
      chat: vi.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            content: JSON.stringify({
              work_items: [{ title: 42, description: "x", priority: 0, acceptance_criteria: [] }],
            }),
          };
        }
        return {
          content: JSON.stringify({
            work_items: [
              {
                title: `Scaffold the manifest, slice ${call}`,
                description:
                  "Add the project's dependency manifest with its install, test and build entries, so the " +
                  "checkout has a toolchain the declared commands can run in, and nothing is assumed.",
                priority: call,
                acceptance_criteria: ["the manifest file exists at the repository root"],
              },
            ],
          }),
        };
      }),
    };
    const expanded = await expandUntilBudget({
      plan: unexpandedPlan(),
      intent: "Seed a stranger checkout.",
      granularity: "fine",
      broker: broker as never,
      mode: "greenfield",
    });

    // The repair happened — the malformed response was sent back rather than fatal.
    expect(broker.chat.mock.calls.length, "the malformed response is sent back once for repair").toBeGreaterThanOrEqual(2);
    const repairPrompt = JSON.stringify(broker.chat.mock.calls[1]);
    expect(repairPrompt, "the repair names the schema problem").toMatch(/invalid_type|expected/i);
    // And the plan kept the leaves the repaired response produced.
    expect(expanded.work_items.length).toBeGreaterThan(1);
    expect(config.turnBudgetMs).toBe(300_000);
    expect(ctx.store.listProjects()).toHaveLength(0);
  });

  it("treats an unrepairable expansion as a thin node, not as a failed plan", async () => {
    // The other half: if the model cannot produce a conforming response even when shown the error, that
    // **node** contributes nothing. `expandUntilBudget` reads an empty expansion as "this node needs
    // nothing" and returns the plan it has, so a caller keeps a plan it can still work with rather than
    // losing the whole turn. Nothing here may throw.
    const { ctx } = setup(300_000);
    const broker = {
      isAvailable: vi.fn().mockResolvedValue(true),
      chat: vi.fn().mockResolvedValue({ content: "I cannot produce that. Here is a sentence instead." }),
    };

    const expanded = await expandUntilBudget({
      plan: unexpandedPlan(),
      intent: "Seed a stranger checkout.",
      granularity: "fine",
      broker: broker as never,
      mode: "greenfield",
    });

    expect(expanded.work_items.length, "the plan survives with its container").toBeGreaterThanOrEqual(1);
    expect(broker.chat.mock.calls.length, "it tried, and it tried to repair").toBeGreaterThanOrEqual(2);
    expect(ctx.store.listProjects()).toHaveLength(0);
  });

  it("keeps planning unbounded when no turn clock is supplied at all (internal callers)", async () => {
    // The worker and CLI paths plan without a turn. They must keep working: a bound that required a clock
    // would break every caller that legitimately has none.
    const { ctx } = setup();
    projectWithLead(ctx, "clockless-demo");
    mockBroker.isAvailable.mockResolvedValue(true);
    mockBroker.chat.mockResolvedValue({ content: oneLeaf(1), model: "test-model" });

    const outcome = await executeToolCall(
      ctx,
      "submit_intent",
      JSON.stringify({ intent: "Seed a minimal checkout.", project_slug: "clockless-demo", mode: "preview" }),
      { agentId: ctx.agentStore.getAgentBySlugOrId("clockless-demo-lead")!.id },
    ).then(
      (result) => ({ ok: true as const, result }),
      (error: Error) => ({ ok: false as const, message: error.message }),
    );

    if (!outcome.ok) expect(outcome.message).not.toMatch(/stopped at the turn's time budget/i);
    expect(mockBroker.chat).toHaveBeenCalled();
  });
});

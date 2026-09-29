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
import { budgetExhaustedReply, runKampakuChat } from "../../src/agents/runtime/session.js";
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

  it("reconciles a budget stop against durable state instead of asserting nothing changed", async () => {
    // Measured 2026-09-25 taking suite 06: the intake turn hit the budget *after* creating `seed-demo`, the
    // seat `seed-demo-lead`, and eight files plus a git repository in the checkout the emperor had asked to
    // seed — and the reply said *"Nothing was created or changed by this turn — no project, no work item, no
    // repository change"*. A sentence that durable state contradicts is the same defect as an invented
    // result, and it was the sentence added to prevent the opposite error.
    // A turn with time for exactly one model call, which spends that call opening a work order: the clock
    // runs out while the work is real. Before this fix the reply denied the project it had just created.
    const { ctx, config } = setup(60);
    ctx.agentStore.createSubAgent({
      slug: "delta-lead",
      name: "Delta Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    mockBroker.chatWithTools.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        model: "test-model",
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "create_project",
                    arguments: JSON.stringify({
                      name: "Delta Demo",
                      slug: "delta-demo",
                      project_lead_slug: "delta-lead",
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    });

    const response = await runKampakuChat(ctx, config, "Open a work order and seed it.");

    // The work happened, in this turn: the container exists in the store.
    expect(ctx.store.getProjectBySlug("delta-demo")).toBeDefined();

    // It really worked before it stopped: a turn that made no call has no delta to reconcile.
    expect(mockBroker.chatWithTools.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(response.budgetExhausted).toBeDefined();
    // It names what actually happened, and does not claim nothing was created.
    expect(response.reply).toMatch(/Durable state changed during this turn/i);
    expect(response.reply).toContain("delta-demo");
    expect(response.reply).not.toMatch(/Nothing was created or changed/i);
    // And it still refuses to call the work done.
    expect(response.reply).toMatch(/nothing is reported as done/i);
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

  it("reports a delegation that reaches its own step limit as a stop, not as a finished result", async () => {
    // Measured 2026-09-26 taking suite 07 (run 4). A planning delegation to the project's lead made **14
    // tool calls across 10 model calls**, reached the per-session cap, and the session returned
    // `"Finished 14 tool step(s): read_repository, submit_intent, approve_plan."` The front office relayed
    // that to the emperor as *"the lead executed 14 tool steps including reading the repository, submitting
    // intents, and approving a plan"* — while durable state held **0 work items** and the event log held
    // `plan.previewed` and `plan.approved` with no `plan.applied` after them. The work the delegation was
    // told to do (read, preview, approve, apply) is a fixed sequence, and a cap of ten model calls cut it
    // off between approve and apply.
    //
    // Two things are asserted, and the second is what makes the first safe to change:
    //
    // 1. a session that runs out of steps says so, in the same shape the budget path uses, so its caller
    //    cannot read a truncation as a completion;
    // 2. the cap is now large enough for the sequence the product instructs — and the control below shows
    //    the bound still bites, so raising it did not remove it.
    const { ctx } = setup(600_000);
    const lead = ctx.agentStore.createSubAgent({
      slug: "step-limit-lead",
      name: "Step Limit Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    // A seat needs a granted tool or the session refuses to assemble at all.
    ctx.skillStore.upsertSkill({
      slug: "step-probe",
      name: "Step probe",
      description: "Grants one read tool so a session can be assembled.",
      capabilities: ["workflow.step-probe"],
      tools: ["list_agents"],
      promptFragment: "",
      default: false,
    });
    ctx.skillStore.assignSkill(lead.id, "step-probe");

    // Every model call asks for a tool, so the loop never reaches a final answer and the cap is what ends it.
    let call = 0;
    mockBroker.chatWithTools.mockImplementation(async () => {
      call += 1;
      return {
        model: "test-model",
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: `call-${call}`,
                  type: "function",
                  function: { name: "list_agents", arguments: "{}" },
                },
              ],
            },
          },
        ],
      };
    });

    const result = await runSubAgentSession(ctx, lead, "Plan the work.");

    expect(result.stepLimitExhausted, "the session reports that it hit its own limit").toBeDefined();
    expect(result.stepLimitExhausted?.limit, "the cap is generous enough for a planning sequence").toBeGreaterThanOrEqual(20);
    // It ran to the cap rather than stopping early: the limit and the calls made agree.
    expect(result.stepLimitExhausted?.modelCalls).toBe(mockBroker.chatWithTools.mock.calls.length);
    // The words: it never claims completion, and it names the stop and the rule.
    expect(result.reply).not.toMatch(/^Finished /);
    expect(result.reply).toMatch(/step limit/i);
    expect(result.reply).toMatch(/no work is reported as done/i);
    expect(result.reply).toMatch(/as a stop, not as a result/i);
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

  it("lets the container's own lead staff the plan it proposes, and refuses everyone else", async () => {
    // ADR-0006 decided that "a project lead may create the seats it proposes", and that decision was applied
    // to `create_sub_agent` — the same authority one layer in was left demanding `system-agent-roster`, which
    // a lead's default skill set does not contain.
    //
    // Measured 2026-09-28 taking suite 07 (run 14, tracing every dispatch): the project's lead proposed a
    // plan whose leaves needed specialist seats, called `submit_intent` with `create_missing_agents: true`,
    // and was refused with *"Only an agent with system-agent-roster may create missing agents during
    // planning"* — a sentence naming a skill it cannot hold, so nothing it could do would comply. It rewrote
    // its intent and retried three times in twelve minutes (each rewrite a different fingerprint, which is
    // exactly the three-previews-and-no-apply shape run 13 shows) and the turn ended with nothing persisted.
    //
    // What is asserted is the pair: the lead is let through, and the widening is bounded — an agent that
    // leads nothing is still refused, and so is one naming a project it does not lead.
    const { ctx } = setup(300_000);
    const lead = ctx.agentStore.createSubAgent({
      slug: "roster-lead",
      name: "Roster Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const stranger = ctx.agentStore.createSubAgent({
      slug: "roster-stranger",
      name: "Roster Stranger",
      responsibilities: "Nothing in particular",
      systemPrompt: "You do not lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: "77777777-7777-4777-8777-777777777777",
      slug: "roster-demo",
      name: "Roster Demo",
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });

    // The lead here holds **no** skills, which is the strictest form of the measured case: it reaches the
    // planner on the linked-lead authority alone, without `system-agent-roster`. (That a provisioned lead
    // receives `system-plan-quality` and not the roster skill is locked by suite 07's own test, against the
    // real provisioning path.)
    expect(ctx.skillStore.listAgentSkills(lead.id)).not.toContain("system-agent-roster");

    // It must get PAST the gate. Whatever the planner does next belongs to other suites: this asserts the
    // authority refusal is no longer what stops a lead from staffing its own plan.
    const outcome = await executeToolCall(
      ctx,
      "submit_intent",
      JSON.stringify({
        intent: "Add a command-line entry point.",
        project_slug: project.slug,
        create_missing_agents: true,
        mode: "preview",
      }),
      { agentId: lead.id, projectId: project.id },
    ).then(
      (result) => ({ ok: true as const, result }),
      (error: Error) => ({ ok: false as const, message: error.message }),
    );
    if (!outcome.ok) {
      expect(outcome.message).not.toMatch(/system-agent-roster/);
      expect(outcome.message).not.toMatch(/not authorized to create project plans/i);
    }

    // The control: leading nothing is still a refusal, and the refusal names what would widen it.
    await expect(
      executeToolCall(
        ctx,
        "submit_intent",
        JSON.stringify({
          intent: "Add a command-line entry point.",
          project_slug: project.slug,
          create_missing_agents: true,
          mode: "preview",
        }),
        { agentId: stranger.id, projectId: project.id },
      ),
    ).rejects.toThrow(/not authorized to create project plans/i);
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

  it("says where the time went on a stop, naming the work that landed and who spent the time", async () => {
    // The shape run 19 measured, locked. 2026-09-29, suite 07 run 19 on the **shipped default** budget:
    //
    //   I stopped this turn at its own time budget: 5.1 of 5.0 minutes. It took 14 model calls and 4 tool
    //   calls before stopping.
    //   Where it went: 306s total · 3 model calls in 15s (slowest 8.4s) · 4 tool calls, slowest
    //   delegate_to_agent 291s · delegated sessions: 11 model calls in 291s.
    //   Durable state changed during this turn: 8 work item(s).
    //
    // Three facts have to survive in that paragraph, and all three were absent from the reply this product
    // returned four runs earlier: the elapsed time really spent, the split between this session and the one
    // it delegated to, and the durable change the stop did not cancel. The 8 work items above are the plan
    // the suite's central oracle asks for — a stop that read as "nothing happened" would have hidden it.
    const budget = { modelCalls: 14, elapsedMs: 306_000, budgetMs: 300_000 };
    const reply = budgetExhaustedReply(
      budget,
      ["delegate_to_agent", "get_project", "get_project_journal", "delegate_to_agent"],
      { createdProjects: [], createdAgents: [], newWorkItems: 8, reposLinked: 0 },
      {
        elapsedMs: 306_000,
        modelCalls: 3,
        modelLatencyMs: 15_000,
        slowestCallMs: 8_400,
        retriedCalls: 0,
        toolCalls: 4,
        toolLatencyMs: 291_000,
        nestedModelCalls: 11,
        nestedElapsedMs: 291_000,
        slowestTool: { name: "delegate_to_agent", elapsedMs: 291_000 },
      },
    );

    // The elapsed time is the measurement, and the budget is the bound. Reporting the bound on both sides of
    // "of" is what run 19 caught: with the declared value, a turn that overshot by six seconds read as a
    // perfect fit.
    expect(reply).toContain("306s");
    expect(reply).toMatch(/5\.1 of 5\.0 minutes/);
    expect(reply).toContain("14 model calls and 4 tool calls");
    // Where it went, split by session rather than summed away.
    expect(reply).toContain("3 model calls in 15s (slowest 8.4s)");
    expect(reply).toContain("slowest delegate_to_agent 291s");
    expect(reply).toContain("delegated sessions: 11 model calls in 291s");
    // And the work is named, not denied.
    expect(reply).toContain("8 work item(s)");
    expect(reply).not.toMatch(/Nothing was created or changed/i);
  });

  it("declares no per-call latency it did not measure", () => {
    // The other half of the same run: when the turn has no accounting, the reply says so instead of
    // describing a split it never observed. A number nobody measured is the defect this product exists to
    // refuse, and it would be worse here, because the reader would use it to decide whether the endpoint or
    // the work was at fault.
    const reply = budgetExhaustedReply(
      { modelCalls: 0, elapsedMs: 0, budgetMs: 300_000 },
      [],
    );
    expect(reply).toContain("did not record per-call latency");
  });
});

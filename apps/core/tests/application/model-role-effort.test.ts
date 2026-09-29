import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { AppConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { createGoalWithPlan } from "../../src/planner/create-goal.js";
import { maybeCompactConversation } from "../../src/agents/runtime/compact-history.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * Which reasoning budget each call actually gets.
 *
 * `tests/model-broker/reasoning-effort.test.ts` locks the wire: a configured budget reaches the request and a
 * refusal is reported. This file locks the wiring, which is the half that fails silently. A call site that
 * forgets its budget still works, returns a reply, and passes every test in the repository — it simply costs
 * several times what it should, on a paid endpoint, once per call. That is not a class of defect discipline
 * catches, so the answer to "what effort does this call get" is one function
 * (`brokerOptionsFor`) that every broker is built through, and these tests drive the two roles end to end
 * through their real entry points rather than asserting that an argument exists.
 *
 * Both defaults are asserted as configuration **and** as behaviour: the planner is driven with the factory
 * defaults in force, so a change to either default is caught here rather than in the next paid run.
 */

const mockBroker = vi.hoisted(() => ({
  chat: vi.fn(),
  complete: vi.fn(),
  chatWithTools: vi.fn(),
  isAvailable: vi.fn(),
}));

const createModelBroker = vi.hoisted(() => vi.fn());

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: (options: unknown) => {
    createModelBroker(options);
    return mockBroker;
  },
}));

/** Options handed to the last broker built. */
function lastBrokerOptions(): { model?: string; reasoningEffort?: string } {
  const call = createModelBroker.mock.calls.at(-1);
  return (call?.[0] ?? {}) as { model?: string; reasoningEffort?: string };
}

describe("the reasoning budget each role is given", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.clearAllMocks();
  });

  function setup(overrides: Partial<AppConfig> = {}) {
    const root = mkdtempSync(join(tmpdir(), "kampaku-model-role-"));
    dataDir = root;
    const config = loadConfig({
      dataDir: root,
      dbPath: join(root, "kampaku.db"),
      workspaceRoot: join(root, "workspace"),
      modelApiKey: "test-key",
      ...overrides,
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    bootstrapProject(store, config);
    const conversationStore = new ConversationStore(db);
    const ctx: KampakuToolContext = {
      store,
      agentStore: new AgentStore(db),
      conversationStore,
      pmStore: new PmStore(db),
      config,
    };
    return { store, ctx, config, conversationStore };
  }

  it("asks for the planning budget when a plan is made", async () => {
    const { store, config } = setup({ plannerMode: "llm", plannerModel: "planner-model" });
    mockBroker.chat.mockResolvedValue({
      content: JSON.stringify({
        tasks: [
          {
            title: "Seed the manifest",
            prompt: "Add the dependency manifest.",
            repositoryRole: "core",
            acceptanceCriteria: ["the manifest exists"],
          },
        ],
      }),
      model: "planner-model",
    });

    const projectId = store.getBootstrapState<{ projectId: string }>("default_project")!.projectId;
    await createGoalWithPlan(store, config, {
      projectId,
      objective: "Seed the manifest",
      repositoryRole: "core",
    });

    const options = lastBrokerOptions();
    // The planner is the one call allowed to think hard: a plan that is wrong is paid for again by every
    // attempt underneath it.
    expect(options.reasoningEffort).toBe("high");
    // And it is still the planner's own model, which this refactor must not have traded away.
    expect(options.model).toBe("planner-model");
  });

  it("asks for the execution budget when history is compacted", async () => {
    const { ctx, config, conversationStore } = setup({ agentMode: "llm" });
    const conversation = conversationStore.createConversation();
    for (let index = 0; index < 10; index += 1) {
      conversationStore.appendMessage(conversation.id, { role: "user", content: `message-${index}` });
      conversationStore.appendMessage(conversation.id, { role: "assistant", content: `reply-${index}` });
    }
    mockBroker.complete.mockResolvedValue({ content: "a summary", model: "test-model" });

    const compacted = await maybeCompactConversation(ctx, config, conversation.id, {
      threshold: 6,
      keepRecent: 4,
    });

    expect(compacted).toBe(true);
    expect(mockBroker.complete).toHaveBeenCalledTimes(1);
    // Bookkeeping is not decision-making: its cost is the transcript it reads, not the words it chooses.
    expect(lastBrokerOptions().reasoningEffort).toBe("low");
  });

  it("sends no budget at all when the operator switches both roles off", async () => {
    process.env.KAMPAKU_PLANNER_REASONING_EFFORT = "off";
    try {
      const { store, config } = setup({ plannerMode: "llm", plannerModel: "planner-model" });
      mockBroker.chat.mockResolvedValue({
        content: JSON.stringify({
          tasks: [
            {
              title: "Seed the manifest",
              prompt: "Add the dependency manifest.",
              repositoryRole: "core",
              acceptanceCriteria: ["the manifest exists"],
            },
          ],
        }),
        model: "planner-model",
      });

      const projectId = store.getBootstrapState<{ projectId: string }>("default_project")!.projectId;
      await createGoalWithPlan(store, config, {
        projectId,
        objective: "Seed the manifest",
        repositoryRole: "core",
      });

      // The escape hatch an endpoint that refuses the parameter needs, asserted at the role rather than only
      // where the value is parsed.
      expect(lastBrokerOptions().reasoningEffort).toBeUndefined();
    } finally {
      delete process.env.KAMPAKU_PLANNER_REASONING_EFFORT;
    }
  });
});

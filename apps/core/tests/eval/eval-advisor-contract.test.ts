import { afterEach, describe, expect, it } from "vitest";
import {
  KAMPAKU_BUILTIN_DEFINITION,
  KAMPAKU_BUILTIN_ID,
} from "../../src/agents/definitions.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";
import { executeToolCall, KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

const requiredOrchestratorTools = [
  "get_project",
  "get_agent_dashboard",
  "list_agents",
  "list_skills",
  "triage_intent",
  "create_sub_agent",
  "delegate_to_agent",
  "assess_change_request",
  "get_agent_capacity",
  "get_project_journal",
  "get_work_item_journal",
];

describe("current Kampaku orchestrator eval contract", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  function freshContext() {
    context = createTestContext("kampaku-eval-orchestrator-");
    return context;
  }

  it("keeps one deterministic immutable built-in orchestrator", () => {
    const { agentStore } = freshContext();
    expect(agentStore.getKampakuAgent()).toMatchObject({
      id: KAMPAKU_BUILTIN_ID,
      slug: "kampaku",
      source: "builtin",
      parentId: null,
    });
    expect(KAMPAKU_BUILTIN_DEFINITION.immutable).toBe(true);
  });

  it("advertises the exact orchestration boundary", () => {
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).toEqual(requiredOrchestratorTools);
    expect(KAMPAKU_BUILTIN_DEFINITION.systemPrompt).toMatch(/delegate end-to-end work/i);
    expect(KAMPAKU_BUILTIN_DEFINITION.systemPrompt).toMatch(/do not execute code or modify repositories directly/i);
  });

  it("resolves every advertised tool in the runtime registry", () => {
    const runtimeNames = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    expect(requiredOrchestratorTools.every((tool) => runtimeNames.has(tool))).toBe(true);
  });

  it("creates a responsible agent and delegates an autonomous session", async () => {
    const { toolContext, config, agentStore } = freshContext();
    const response = await runKampakuChat(
      toolContext,
      config,
      "Create a sub-agent called language-lead that owns the language learning product",
    );

    expect(response.toolsUsed).toEqual(["create_sub_agent"]);
    expect(agentStore.getAgentBySlugOrId("language-lead")).toBeDefined();

    const delegated = await executeToolCall(
      toolContext,
      "delegate_to_agent",
      JSON.stringify({ agent_slug: "language-lead", objective: "Inspect current project state." }),
      { agentId: KAMPAKU_BUILTIN_ID, conversationId: response.conversationId },
    );
    expect(delegated.output).toMatchObject({
      agentSlug: "language-lead",
      toolsUsed: [],
    });
  });

  it("persists inspectable orchestration conversations", async () => {
    const { toolContext, config, conversationStore } = freshContext();
    const response = await runKampakuChat(toolContext, config, "Hello orchestrator.");
    const messages = conversationStore.getMessages(response.conversationId);

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.content).toBe(response.reply);
  });

  it("keeps generic orchestration free of language and provider fixtures", () => {
    const contract = JSON.stringify({
      definition: KAMPAKU_BUILTIN_DEFINITION,
      tools: KAMPAKU_TOOLS.map((tool) => tool.function),
    }).toLowerCase();

    expect(contract).not.toMatch(/japanese|jlpt|openai|freellmapi|elevenlabs|whisper/);
  });

  it("retains one focused machine-readable human question contract", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;
    expect(prompt).toContain("<kampaku-question>");
    expect(prompt).toMatch(/ask one focused question at a time/i);
  });
});

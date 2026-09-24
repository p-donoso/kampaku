import { afterEach, describe, expect, it } from "vitest";
import {
  KAMPAKU_BUILTIN_DEFINITION,
  KAMPAKU_BUILTIN_ID,
} from "../../src/agents/definitions.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";
import { executeToolCall, KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * The front-office authority contract, locked in **both** directions.
 *
 * This file previously asserted that the allowlist `equals` an 11-tool list that excluded
 * `create_project` — while the system prompt told the agent to call `create_project` in five places
 * and `submit_intent` refused the agent by naming that same tool. The test passed, and the product
 * could not open a work order by its own documented route (BOARD F-001, F-002;
 * [ADR-0005](../../../../docs/adr/0005-factory-authority-model.md)).
 *
 * A passing test that enforces a broken contract is worse than a failing one, so the lock now names
 * three things separately: what the front office must be able to do, what it must never be able to
 * do, and that every tool its prompt names is actually reachable.
 */

/** Capabilities the front office owns: reads, intake, opening the container, staffing, delegation. */
const requiredFrontOfficeTools = [
  "get_project",
  "get_agent_dashboard",
  "list_agents",
  "list_skills",
  "triage_intent",
  "create_project",
  "create_sub_agent",
  "delegate_to_agent",
  "assess_change_request",
  "get_agent_capacity",
  "get_project_journal",
  "get_work_item_journal",
];

/**
 * Line capabilities. These must exist in the runtime registry (so the denial is a real boundary and
 * not an accident of a missing tool) and must never appear in the front-office allowlist.
 */
const lineOnlyTools = [
  "submit_intent",
  "update_project",
  "update_work_item",
  "update_sub_agent",
  "delete_sub_agent",
  "approve_plan",
  "revoke_plan_approval",
  "execute_work_item",
  "retry_work_item",
  "play_project",
  "pause_project",
  "step_project",
  "submit_completion_report",
  "recall",
  "remember_log",
  "remember_learning",
  "propose_wiki_edit",
  "post_wiki_comment",
  "approve_wiki_edit",
  "update_global_system_prompt",
];

describe("front-office authority contract", () => {
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

  it("advertises exactly the front-office capabilities", () => {
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).toEqual(requiredFrontOfficeTools);
    expect(KAMPAKU_BUILTIN_DEFINITION.systemPrompt).toMatch(/delegate end-to-end work/i);
    expect(KAMPAKU_BUILTIN_DEFINITION.systemPrompt).toMatch(/do not execute code or modify repositories directly/i);
  });

  it("lets the front office open a work order", () => {
    // The measured failure: the front desk could create the team and not the container, so it
    // created five agents, no project, and asked permission for the rest.
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).toContain("create_project");

    const runtimeNames = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    expect(runtimeNames.has("create_project")).toBe(true);
  });

  it("denies every line capability, and the denial is real", () => {
    const runtimeNames = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));

    for (const tool of lineOnlyTools) {
      expect(KAMPAKU_BUILTIN_DEFINITION.tools).not.toContain(tool);
    }

    // A denied capability that does not exist in the registry proves nothing about the boundary.
    for (const tool of lineOnlyTools) {
      expect(
        runtimeNames.has(tool),
        `${tool} is asserted as denied but is absent from the runtime registry, so the assertion is vacuous`,
      ).toBe(true);
    }
  });

  it("resolves every advertised tool in the runtime registry", () => {
    const runtimeNames = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    expect(requiredFrontOfficeTools.every((tool) => runtimeNames.has(tool))).toBe(true);
  });

  it("names no unreachable tool in its own prompt", () => {
    // `session.ts` filters the runtime registry by `definition.tools`. A prompt that names a tool
    // this array omits produces an instruction the model can never satisfy — the exact shape of
    // BOARD F-001.
    const allowed = new Set(KAMPAKU_BUILTIN_DEFINITION.tools);
    const runtimeNames = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    // Tool-shaped tokens only: snake_case identifiers that resolve to a real tool.
    const named = [...new Set(prompt.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].filter((token) =>
      runtimeNames.has(token),
    );

    expect(named.length).toBeGreaterThan(0);
    for (const tool of named) {
      expect(
        allowed.has(tool),
        `the system prompt instructs the agent to call "${tool}" but the allowlist omits it, so the instruction is unreachable`,
      ).toBe(true);
    }
  });

  it("reaches the container-creating tool through the tool path, not only by listing it", async () => {
    // The oracle is checked by calling the exposed tool, because "present in an array" is not
    // "reachable at runtime". The lead is created first because the tool requires one: a container
    // with no accountable owner is not an open work order (BOARD F-005).
    const { toolContext, agentStore } = freshContext();
    const repositoryPath = toolContext.config?.workspaceRoot ?? process.cwd();
    const lead = agentStore.createSubAgent({
      slug: "front-desk-lead",
      name: "Front desk lead",
      parentId: KAMPAKU_BUILTIN_ID,
      responsibilities: "Lead the work order",
      systemPrompt: "Lead",
    });

    const created = await executeToolCall(
      toolContext,
      "create_project",
      JSON.stringify({ name: "Front desk work order", project_lead_slug: lead.slug }),
      { agentId: KAMPAKU_BUILTIN_ID },
    );

    expect(created.output).toMatchObject({ slug: "front-desk-work-order" });
    // The other half of opening a work order: it has an owner.
    expect(toolContext.store.getProjectBySlug("front-desk-work-order")?.projectLeadAgentId).toBe(lead.id);
    expect(repositoryPath).toBeTruthy();
  });

  it("refuses to open a work order without an accountable owner", async () => {
    // A container nobody owns cannot be approved, scoped, or asked about. Measured live: the front
    // office created `intake-demo` with lead=none and called it success (BOARD F-005).
    const { toolContext } = freshContext();

    const refused = await executeToolCall(
      toolContext,
      "create_project",
      JSON.stringify({ name: "Orphan container" }),
      { agentId: KAMPAKU_BUILTIN_ID },
    ).catch((error: unknown) => String((error as Error).message));

    expect(String(refused)).toMatch(/needs an accountable owner/i);
    expect(toolContext.store.getProjectBySlug("orphan-container")).toBeUndefined();
  });

  it("keeps the container-creating tool closed to every other role", async () => {
    const { toolContext, agentStore } = freshContext();
    const specialist = agentStore.createSubAgent({
      slug: "line-specialist",
      name: "Line specialist",
      parentId: KAMPAKU_BUILTIN_ID,
      responsibilities: "Line work",
      systemPrompt: "Line work",
    });

    const refused = await executeToolCall(
      toolContext,
      "create_project",
      JSON.stringify({ name: "Rogue container" }),
      { agentId: specialist.id },
    ).catch((error: unknown) => error);

    expect(String((refused as Error).message)).toContain("Only the root agent may create a project.");
    expect(toolContext.store.listProjects()).toHaveLength(0);
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

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
import { Store } from "../../src/persistence/store.js";
import { provisionSubAgent } from "../../src/application/agents.js";
import { bootstrapProject, createProject, updateProject } from "../../src/application/projects.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";
import { isStateInventoryRequest } from "../../src/agents/runtime/stub-agent.js";

/**
 * The offline mode answers an inventory question **from the stores**, not from a description of itself.
 *
 * It used to reply, to any question it did not recognise, with a fixed sentence about what Kampaku *can*
 * do — *"I can clarify intent, delegate work through responsible agents, and report verified durable
 * outcomes."* For "what exists here?" that is not an answer: it names no project, no team, and no work, and
 * it is the same defect class the whole program exists to remove. Suite 01's first bullet is precisely that
 * a stranger can ask what exists and be told the truth, and the offline mode is a documented way to run the
 * product.
 *
 * The fix is [F-024](../../../../docs/eval/results/BOARD.md)'s recommended option (a) — *make the block the
 * reply* — implemented where it is deterministic. It also gives the three-surface gate something to measure
 * that does not depend on a model's mood.
 */

// The broker must not be reachable in stub mode: if it is called, the test is measuring the wrong path.
const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

describe("stub-mode inventory", () => {
  let dataDir: string | undefined;
  let ctx: KampakuToolContext | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    ctx = undefined;
    vi.clearAllMocks();
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-stub-inventory-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    mkdirSync(config.workspaceRoot, { recursive: true });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const context: KampakuToolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      memoryStore,
      config,
    };
    ctx = context;
    bootstrapProject(store, config);
    return { ctx: context, config, agentStore, skillStore, store };
  }

  describe("recognises the question", () => {
    it("treats an ask about what exists as an inventory question", () => {
      for (const message of [
        "Are we ready? What exists here — projects, teams, open work? Do not change anything.",
        "what exists here",
        "what projects and teams are there?",
        "show me what exists",
      ]) {
        expect(isStateInventoryRequest(message), message).toBe(true);
      }
    });

    it("leaves a command alone, because a command is not a question", () => {
      for (const message of [
        "Open a work order for a small service called intake-demo.",
        "create a sub-agent named qa-bot that runs the tests",
        "add a specialist whose only skill is marketing copy",
        "Start executing the first work item.",
      ]) {
        expect(isStateInventoryRequest(message), message).toBe(false);
      }
    });

    it("does not claim a question with no state word in it", () => {
      // "What is the capital of France" is a question but not about this factory's state.
      expect(isStateInventoryRequest("What is the best sorting algorithm?")).toBe(false);
    });
  });

  /**
   * The specific handler wins over the general one, and the ordering is the reason the lock exists.
   *
   * `list agents` is an inventory question by shape, so a general matcher placed first swallows it. That is
   * what happened: the reply became the state block, and the web e2e spec asserting the "Registered agents"
   * listing went red — a passing test caught a regression the new test could not see. Specific before
   * general, asserted rather than remembered.
   */
  it("leaves the specific `list agents` request to its own handler", async () => {
    const { ctx: context, config } = setup();

    const response = await runKampakuChat(context, config, "list agents");

    // The specific handler's shape: a listing with a tree, not the durable-state block.
    expect(response.reply).toContain("Registered agents");
    expect(response.reply).toContain("Tree:");
    expect(response.reply).not.toContain("CURRENT DURABLE STATE");
  });

  describe("answers it from the stores", () => {
    it("names the project and the roster a stranger asked about", async () => {
      const { ctx: context, config, agentStore, skillStore, store } = setup();
      // `bootstrapProject` already made the `kampaku` project, which is the instance a stranger lands on.
      // Linking a lead to it is what makes the roster worth asking about.
      const lead = provisionSubAgent(agentStore, skillStore, {
        slug: "kampaku-manager",
        name: "Kampaku Manager",
        responsibilities: "Lead",
        systemPrompt: "Lead",
      });
      updateProject(store, agentStore, "kampaku", { project_lead_slug: lead.slug });

      const response = await runKampakuChat(
        context,
        config,
        "Are we ready? What exists here — projects, teams, open work? Do not change anything.",
      );

      // The project is named, not described in the abstract.
      expect(response.reply).toContain("kampaku");
      // The roster is named, which is the F-025 bullet: the block carries it, so the answer can.
      expect(response.reply).toContain(lead.slug);
      // And the counts the operator asked about.
      expect(response.reply).toMatch(/Pending questions: \d+/);
      expect(response.reply).toMatch(/Pending blockers: \d+/);
      // It did not reach for a model to compose this: the offline mode rendered it.
      expect(response.agentUsed).toBe("stub");
      expect(mockBroker.chatWithTools).not.toHaveBeenCalled();
    });

    /**
     * The detail half. Suite 02 requires the repository path on every surface that shows project metadata,
     * and the inventory block deliberately compresses a container to `repositories=<count>` — so a
     * conversation bound to one project also gets its detail, which carries the urls.
     */
    it("gives the bound project's detail, including the repository path rather than a count", async () => {
      const { ctx: context, config, agentStore, skillStore, store } = setup();
      const repoPath = join(dataDir!, "surface-demo");
      mkdirSync(repoPath, { recursive: true });
      const lead = provisionSubAgent(agentStore, skillStore, {
        slug: "surface-lead",
        name: "Surface Lead",
        responsibilities: "Lead",
        systemPrompt: "Lead",
      });
      const project = createProject(
        store,
        {
          name: "Surface Demo",
          slug: "surface-demo",
          description: "EVAL-SURFACE-MARKER",
          repositories: [{ url: `file://${repoPath}`, role: "web" }],
          project_lead_slug: lead.slug,
        },
        { workspaceRoot: config.workspaceRoot },
        agentStore,
      );

      const response = await runKampakuChat(
        context,
        config,
        { message: "What exists here — projects and teams?", projectId: project.id },
      );

      // The inventory block, and the detail beside it.
      expect(response.reply).toContain("This conversation is about project surface-demo");
      expect(response.reply).toContain("PROJECT DETAIL");
      // The three fields the block compresses away, in resolvable form.
      expect(response.reply).toContain(project.id);
      expect(response.reply).toContain(lead.slug);
      expect(response.reply).toContain(repoPath);
      // And not as a count.
      expect(response.reply).not.toMatch(/repositories: 1\b/);
    });

    it("says the conversation is unbound rather than picking a project", async () => {
      const { ctx: context, config } = setup();

      const response = await runKampakuChat(
        context,
        config,
        "What exists here — projects and teams?",
      );

      expect(response.reply).toContain("This conversation is not scoped to a project");
      expect(response.reply).not.toContain("PROJECT DETAIL");
    });
  });
});

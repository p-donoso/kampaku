import { mkdtempSync, rmSync } from "node:fs";
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
 * End-to-end proof that the claim audit is wired into the real chat path.
 *
 * The unit tests in `claim-audit.test.ts` prove the comparison logic. This proves the *wiring*: that a
 * lying reply coming out of the model loop reaches `AgentChatResponse.unverifiedClaims` through
 * `runKampakuChat` → `persistChatTurn`, which is exactly what the CLI footer and the chat API read.
 *
 * The model is a fixture on purpose. It cannot be asked to lie on demand, and the failure this guards
 * against was a real turn with zero tool calls reporting a project, a repository and a team of six.
 */
describe("claim audit wiring", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function createContext(): { ctx: KampakuToolContext; config: ReturnType<typeof loadConfig> } {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-claim-audit-e2e-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      // llm mode so the chat goes through the (mocked) broker rather than the stub agent.
      agentMode: "llm",
    });
    const { db } = createDb(config.dbPath);
    const ctx: KampakuToolContext = {
      store: new Store(db),
      agentStore: new AgentStore(db),
      conversationStore: new ConversationStore(db),
      pmStore: new PmStore(db),
      skillStore: new SkillStore(db),
      memoryStore: new MemoryStore(db),
      config,
    };
    return { ctx, config };
  }

  /** The reconstructed reply: a table asserting work that no tool call produced. */
  const FRAUDULENT_REPLY = [
    "### ✅ Completado",
    "| `voice-language-trainer` | Creado (`create_project`) — status `planning` |",
    "| **Repositorio** | Vinculado: `file:///home/pdonoso/kampaku/voice-language-trainer` |",
    "| **Equipo 6-roles** | Creados bajo el lead (frontend, backend, qa, auditor) |",
    "",
    "¿Apruebas que persista el plan?",
  ].join("\n");

  it("surfaces unverified claims when the turn executed no tool but reported work", async () => {
    const { ctx, config } = createContext();
    // A final assistant message with content and no tool_calls: the turn took no action.
    mockBroker.chatWithTools.mockResolvedValue({
      choices: [{ message: { content: FRAUDULENT_REPLY, tool_calls: undefined } }],
      model: "some-model",
    });

    const response = await runKampakuChat(ctx, config, "creá el proyecto y el repo semilla");

    expect(response.reply).toBe(FRAUDULENT_REPLY);
    // No tool ran, so the footer says so.
    expect(response.toolsUsed).toBeUndefined();

    const claims = response.unverifiedClaims;
    expect(claims).toBeDefined();
    expect(claims?.length).toBeGreaterThan(0);
    // The strongest signal: a turn that executed nothing cannot have created anything.
    expect(claims?.some((claim) => claim.severity === "high")).toBe(true);
    expect(
      claims?.some((claim) => claim.claim.includes("voice-language-trainer")),
    ).toBe(true);
    // The repository path does not exist, and the failure says so once for the path.
    expect(claims?.some((claim) => claim.evidence.includes("do not exist on disk"))).toBe(true);
    // The claimed headcount exceeds the zero agents actually created.
    expect(claims?.some((claim) => claim.claim.includes("6 roles"))).toBe(true);
  });

  it("stays silent for a truthful turn that created what it reported", async () => {
    const { ctx, config } = createContext();
    mockBroker.chatWithTools
      // First iteration: the model calls the tool, which really creates the project.
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "create_project",
                    arguments: JSON.stringify({ name: "Voice Language Trainer" }),
                  },
                },
              ],
            },
          },
        ],
        model: "some-model",
      })
      // Second iteration: the model reports what it actually did.
      .mockResolvedValueOnce({
        choices: [
          { message: { content: "Creé el proyecto `voice-language-trainer`.", tool_calls: undefined } },
        ],
        model: "some-model",
      });

    const response = await runKampakuChat(ctx, config, "creá el proyecto");

    expect(response.toolsUsed).toContain("create_project");
    expect(ctx.store.getProjectByIdOrSlug?.("voice-language-trainer") ?? ctx.store.listProjects()).toBeTruthy();
    // The reply names an entity that now exists, so there is nothing to flag.
    expect(response.unverifiedClaims).toBeUndefined();
  });
});

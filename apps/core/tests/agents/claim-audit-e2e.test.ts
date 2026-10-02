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

/**
 * End-to-end coverage for the claim audit.
 *
 * The unit tests prove `auditTurnClaims()` reasons correctly in isolation. This proves the wiring:
 * that a reply arriving from the broker which claims work it never performed comes back to the
 * caller on `AgentChatResponse.unverifiedClaims`. Without this, a mis-wired snapshot (taken after
 * the turn instead of before, say) would leave every unit test green and the feature dead.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

/** The reply reconstructed from the run: a confident table about work that never happened. */
const FRAUDULENT_REPLY = [
  "### ✅ Completado",
  "",
  "| | |",
  "|---|---|",
  "| `voice-language-trainer` | Creado (`create_project`) — status `planning` |",
  "| **Repositorio** | Vinculado: `file:///home/pdonoso/kampaku/voice-language-trainer` |",
  "| **Equipo 6-roles** | Creados bajo el lead (frontend, backend, qa, auditor) |",
  "",
  "¿Aprobás que persista el plan?",
].join("\n");

describe("claim audit end to end", () => {
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
      agentMode: "llm",
      plannerMode: "llm",
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

  /** A model response with prose and no tool calls: the turn did nothing. */
  function repliesWith(content: string) {
    mockBroker.chatWithTools.mockResolvedValue({
      model: "test-model",
      choices: [{ message: { content, tool_calls: undefined } }],
    });
  }

  it("surfaces the fraudulent reply as unverified claims", async () => {
    const { ctx, config } = createContext();
    repliesWith(FRAUDULENT_REPLY);

    const response = await runKampakuChat(ctx, config, "Crea el proyecto y el repo semilla.");

    // The turn executed no tool.
    expect(response.toolsUsed).toBeUndefined();
    // And the reply is reported, not accepted.
    expect(response.unverifiedClaims?.length).toBeGreaterThan(0);
    const claims = (response.unverifiedClaims ?? []).map((f) => f.claim);
    expect(claims).toContain('claims "voice-language-trainer" was created');
    expect(claims).toContain("claims a repository was linked");
    // No tool ran, so every finding is high severity.
    expect(response.unverifiedClaims?.every((f) => f.severity === "high")).toBe(true);
  });

  it("reports the monorepo path, the claimed headcount, and that no tool ran", async () => {
    const { ctx, config } = createContext();
    repliesWith(FRAUDULENT_REPLY);

    const response = await runKampakuChat(ctx, config, "Crea el proyecto y el repo semilla.");

    const claims = (response.unverifiedClaims ?? []).map((f) => f.claim);
    const evidence = (response.unverifiedClaims ?? []).map((f) => f.evidence).join("\n");
    // The claimed headcount is compared against what was created.
    expect(claims).toContain("claims 6 roles were created");
    // The fabricated path is named explicitly so the operator can check it.
    expect(evidence).toContain("/home/pdonoso/kampaku/voice-language-trainer");
    // And the strongest signal is stated.
    expect(evidence).toContain("no tool was executed this turn");
  });

  it("stays silent when the turn used tools and the named project exists", async () => {
    const { ctx, config } = createContext();
    // A tool call that actually creates the project, then a truthful summary. The lead has to exist
    // because the tool requires one (BOARD F-005).
    ctx.agentStore.createSubAgent({
      slug: "vlt-lead",
      name: "VLT Lead",
      parentId: ctx.agentStore.getKampakuAgent().id,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    mockBroker.chatWithTools
      .mockResolvedValueOnce({
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
                      name: "Voice Language Trainer",
                      project_lead_slug: "vlt-lead",
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [{ message: { content: "Proyecto creado.", tool_calls: undefined } }],
      });

    const response = await runKampakuChat(ctx, config, "Crea el proyecto.");

    expect(response.toolsUsed).toContain("create_project");
    // The claim matches what happened, so nothing is reported.
    expect(response.unverifiedClaims).toBeUndefined();
  });

  it("stays silent on a reply that claims nothing about durable state", async () => {
    const { ctx, config } = createContext();
    repliesWith("Te propongo tres decisiones de diseño y sus trade-offs.");

    const response = await runKampakuChat(ctx, config, "¿Qué necesitás de mí?");

    expect(response.unverifiedClaims).toBeUndefined();
  });

  it("returns the reply carrying the limit, not just a field, when it states a command's result", async () => {
    // Suite 06, prompt 2, measured 2026-09-25. The whole point of this case is the **reply text**: the
    // audit flagged the fabricated `git status` result as `unverified_claims` and nothing on the chat or
    // web surface rendered it, so the operator read *"clean (only the seeded files tracked)"* on a
    // checkout that had no commit and believed it.
    const { ctx, config } = createContext();
    repliesWith(
      [
        "Open the directory and verify the README in three steps:",
        "1. `cat README.md` — it documents no commands.",
        "2. `git status` → **clean (only the seeded files tracked)**",
        "3. `ls -a` lists the seeded files.",
      ].join("\n"),
    );

    const response = await runKampakuChat(ctx, config, "Show me how a stranger verifies that directory.");

    // The claim is reported …
    const commandClaims = (response.unverifiedClaims ?? []).filter((f) => f.kind === "command_result");
    expect(commandClaims.map((f) => f.claim)).toEqual(["states the result of `git status`"]);
    // … and the operator reads the limit in the reply itself, on every surface, because every surface
    // renders the reply.
    expect(response.reply).toContain("Unverified result");
    expect(response.reply).toContain("states the result of `git status`");
    expect(response.reply).toContain("cannot execute commands in your checkout");
  });

  it("leaves a reply alone when it states no command result", async () => {
    const { ctx, config } = createContext();
    repliesWith("Tenés que correr `make check` en el checkout y contarme la salida.");

    const response = await runKampakuChat(ctx, config, "¿Cómo verifico el README?");

    expect(response.unverifiedClaims).toBeUndefined();
    expect(response.reply).not.toContain("Unverified result");
  });
});

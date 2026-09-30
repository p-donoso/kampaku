import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureProjectsDir, projectsDirGuidance } from "../../src/application/workspace.js";
import { bootstrapFilesystemSettings, getFilesystemSettings } from "../../src/application/settings/filesystem.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { KAMPAKU_BUILTIN_ID } from "../../src/agents/definitions.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";
import { runSubAgentSession } from "../../src/agents/runtime/sub-agent-session.js";
import { createTestContext } from "../helpers/test-context.js";

/**
 * The lock on "the folder where the factory works".
 *
 * Before `KAMPAKU_PROJECTS_DIR` existed there was no such setting: a project checkout landed wherever a
 * model typed a path, which on this operator's machine meant **a directory per project directly in
 * `/home/pdonoso`**, next to the things he keeps there by hand. Two properties are what make the setting
 * worth having, and both are asserted here:
 *
 * 1. the folder is **created and granted** on the operator's own startup paths, so the path the agents are
 *    given is a path that exists — an instruction with nothing behind it is the defect this repository keeps
 *    recording;
 * 2. the agents are **told** the path, in the front office and in the line, because the seat that proposes a
 *    checkout is not always the front office — a lead reads the repository and names the paths.
 *
 * The third property is a refusal, and it is deliberately *not* weakened: naming a folder does not let
 * `create_project` link a path nobody made (`allowMissingPath` stays off there). The guidance says so in
 * words, which is asserted below, because the model's next reasonable move without that sentence is to
 * promise a checkout it cannot create.
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

describe("the projects folder", () => {
  let scratch: string | undefined;

  afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
    vi.resetAllMocks();
  });

  it("defaults to a nursery under the operator's home, and is overridable", () => {
    const previous = process.env.KAMPAKU_PROJECTS_DIR;
    try {
      delete process.env.KAMPAKU_PROJECTS_DIR;
      const byDefault = loadConfig({});
      expect(byDefault.projectsDir.endsWith("/kampaku-projects")).toBe(true);
      // A `~` that reached the runtime unexpanded would be a literal directory named `~` in the cwd.
      expect(byDefault.projectsDir).not.toContain("~");
      expect(byDefault.projectsDir.startsWith("/")).toBe(true);

      process.env.KAMPAKU_PROJECTS_DIR = "/srv/checkouts";
      expect(loadConfig({}).projectsDir).toBe("/srv/checkouts");

      // An empty value is unset, not a folder at the filesystem root.
      process.env.KAMPAKU_PROJECTS_DIR = "   ";
      expect(loadConfig({}).projectsDir).toBe(byDefault.projectsDir);
    } finally {
      if (previous === undefined) delete process.env.KAMPAKU_PROJECTS_DIR;
      else process.env.KAMPAKU_PROJECTS_DIR = previous;
    }
  });

  it("is created once, and reported as existing the second time", () => {
    scratch = mkdtempSync(join(tmpdir(), "kampaku-workspace-"));
    const projectsDir = join(scratch, "kampaku-projects");

    expect(ensureProjectsDir(projectsDir)).toEqual({ path: projectsDir, created: true });
    expect(existsSync(projectsDir)).toBe(true);
    // `bootstrap` twice must not claim it made a directory it did not make.
    expect(ensureProjectsDir(projectsDir)).toEqual({ path: projectsDir, created: false });
  });

  it("is granted as an allowed folder only once it exists", () => {
    scratch = mkdtempSync(join(tmpdir(), "kampaku-workspace-"));
    const workspaceRoot = join(scratch, "workspace");
    const projectsDir = join(scratch, "kampaku-projects");
    const store = new Store(createDb(join(scratch, "kampaku.db")).db);

    // Absent: not invented here. The bootstrapper must not create it, because the default points at the
    // operator's home and every test suite that bootstraps would then write a directory there.
    bootstrapFilesystemSettings(store, workspaceRoot, projectsDir);
    expect(existsSync(projectsDir)).toBe(false);
    expect(getFilesystemSettings(store).folders.map((folder) => folder.label)).not.toContain("projects");

    // Present: allowed, under its own label, and not a second copy of the workspace.
    ensureProjectsDir(projectsDir);
    const fresh = new Store(createDb(join(scratch, "second.db")).db);
    bootstrapFilesystemSettings(fresh, workspaceRoot, projectsDir);
    const labels = getFilesystemSettings(fresh).folders.map((folder) => folder.label);
    expect(labels).toContain("projects");
    expect(labels).toContain("workspace");
  });

  it("tells the agents the path, and that they cannot create it", () => {
    const guidance = projectsDirGuidance("/home/operator/kampaku-projects");

    expect(guidance).toContain("/home/operator/kampaku-projects");
    expect(guidance).toContain("/home/operator/kampaku-projects/<slug>");
    // The refusal, in words: without this the model promises a checkout no seat can create.
    expect(guidance).toMatch(/nothing in the factory creates that directory/i);
    expect(guidance).toMatch(/mkdir -p/);
    expect(guidance).toMatch(/never say a checkout was created or written when only the link was stored/i);
  });

  it("reaches the front office's system prompt, from config and not from a prompt file", async () => {
    scratch = mkdtempSync(join(tmpdir(), "kampaku-workspace-"));
    const projectsDir = join(scratch, "kampaku-projects");
    const context = createTestContext("kampaku-workspace-chat-", { agentMode: "llm", projectsDir });
    try {
      let seen = "";
      mockBroker.chatWithTools.mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
        seen = messages.find((message) => message.role === "system")?.content ?? "";
        return assistantSaying("Understood.");
      });

      await runKampakuChat(context.toolContext, context.config, "Where do projects live?");

      expect(seen).toContain(projectsDir);
      expect(seen).toMatch(/a new project's checkout belongs there/i);
    } finally {
      context.cleanup();
    }
  });

  it("reaches the line's system prompt too, because a lead is the seat that names paths", async () => {
    scratch = mkdtempSync(join(tmpdir(), "kampaku-workspace-"));
    const projectsDir = join(scratch, "kampaku-projects");
    const context = createTestContext("kampaku-workspace-sub-", { agentMode: "llm", projectsDir });
    try {
      const lead = context.agentStore.createSubAgent({
        slug: "path-lead",
        name: "Path Lead",
        responsibilities: "Own the work order",
        systemPrompt: "You lead.",
        parentId: KAMPAKU_BUILTIN_ID,
      });
      // A seat needs a granted tool or the session refuses to assemble at all.
      context.skillStore.upsertSkill({
        slug: "path-probe",
        name: "Path probe",
        description: "Grants one read tool so a session can be assembled.",
        capabilities: ["workflow.path-probe"],
        tools: ["list_agents"],
        promptFragment: "",
        default: false,
      });
      context.skillStore.assignSkill(lead.id, "path-probe");

      let seen = "";
      mockBroker.chatWithTools.mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
        seen = messages.find((message) => message.role === "system")?.content ?? "";
        return assistantSaying("Noted.");
      });

      await runSubAgentSession(context.toolContext, lead, "Plan the work.");

      expect(seen).toContain(projectsDir);
      expect(seen).toMatch(/never say a checkout was created or written when only the link was stored/i);
    } finally {
      context.cleanup();
    }
  });
});

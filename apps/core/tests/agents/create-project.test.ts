import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore, KAMPAKU_AGENT_ID } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import type { AppConfig } from "../../src/config.js";
import { getProjectByIdOrSlug } from "../../src/application/projects.js";
import { executeCreateProject } from "../../src/agents/runtime/tools/create-project.js";
import { executeUpdateProject } from "../../src/agents/runtime/tools/update-project.js";
import { executeToolCall } from "../../src/agents/runtime/tools/index.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * The capability existed in the application layer and was reachable from
 * `POST /api/v1/projects`, but no agent tool exposed it. An agent asked to "create the
 * project" could only update existing ones, so it proposed a team and asked permission
 * instead — leaving the arc with a team scoped to a project that did not exist
 * (LangProbe G-03).
 */
describe("create_project tool", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-create-project-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    // workspaceRoot is a real temp dir so the "outside the workspace" case is testable.
    const config = { workspaceRoot: join(dir, "workspace") } as unknown as AppConfig;
    return {
      ctx: { store, agentStore, pmStore, config } as unknown as KampakuToolContext,
      agentStore,
      dir,
    };
  }

  /**
   * Measured: the agent passed `file:///workspace/voice-language-trainer` — a container-style path
   * that exists on no filesystem here — and the project stored it and reported the repository as
   * linked. A project must not claim a repository it does not have.
   */
  it("refuses a file:// repository path that does not exist", () => {
    const { ctx } = setup();
    expect(() =>
      executeCreateProject(ctx, {
        name: "Voice Language Trainer",
        repositories: [{ url: "file:///workspace/voice-language-trainer", role: "core" }],
      }),
    ).toThrow("does not exist as a directory");
    expect(ctx.store.listProjects()).toHaveLength(0);
  });

  it("refuses a relative file:// repository path", () => {
    const { ctx } = setup();
    expect(() =>
      executeCreateProject(ctx, {
        name: "Voice Language Trainer",
        repositories: [{ url: "file://voice-language-trainer" }],
      }),
    ).toThrow("must use an absolute path");
  });

  it("refuses a repository inside the Kampaku workspace, so the app cannot land in the monorepo", () => {
    const { ctx, dir } = setup();
    const insidePath = join(dir, "workspace", "voice-language-trainer");
    mkdirSync(insidePath, { recursive: true });

    expect(() =>
      executeCreateProject(ctx, {
        name: "Voice Language Trainer",
        repositories: [{ url: `file://${insidePath}` }],
      }),
    ).toThrow("is inside the Kampaku workspace");
    expect(ctx.store.listProjects()).toHaveLength(0);

    // A deliberate, recorded opt-in still works.
    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      repositories: [{ url: `file://${insidePath}` }],
      allow_workspace_repository: true,
    });
    expect(project.repositories).toHaveLength(1);
  });

  it("accepts a repository that exists outside the workspace", () => {
    const { ctx, dir } = setup();
    const outsidePath = join(dir, "voice-language-trainer");
    mkdirSync(outsidePath, { recursive: true });

    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      repositories: [{ url: `file://${outsidePath}`, role: "core" }],
    });

    expect(project.repositories).toHaveLength(1);
    expect(project.repositories[0]?.url).toBe(`file://${outsidePath}`);
    expect(project.repositories[0]?.role).toBe("core");
  });

  it("creates an unlinked project with a derived slug", () => {
    const { ctx } = setup();
    const project = executeCreateProject(ctx, { name: "Voice Language Trainer" });

    expect(project.slug).toBe("voice-language-trainer");
    expect(project.status).toBe("planning");
    expect(project.projectLeadSlug).toBeNull();
    expect(getProjectByIdOrSlug(ctx.store, "voice-language-trainer")?.name).toBe(
      "Voice Language Trainer",
    );
  });

  it("links a repository and a project lead", () => {
    const { ctx, agentStore, dir } = setup();
    const repoPath = join(dir, "voice-language-trainer");
    mkdirSync(repoPath, { recursive: true });
    const lead = agentStore.createSubAgent({
      slug: "vlt-lead",
      name: "VLT Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });

    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      project_lead_slug: lead.slug,
      repositories: [{ url: `file://${repoPath}`, role: "web" }],
    });

    expect(project.projectLeadSlug).toBe(lead.slug);
    expect(project.repositories).toHaveLength(1);
    expect(project.repositories[0]?.url).toBe(`file://${repoPath}`);
    expect(ctx.store.getProject(project.id)?.projectLeadAgentId).toBe(lead.id);
  });

  it("honours an explicit slug and refuses a duplicate", () => {
    const { ctx } = setup();
    executeCreateProject(ctx, { name: "First", slug: "shared-slug" });

    expect(() => executeCreateProject(ctx, { name: "Second", slug: "shared-slug" })).toThrow(
      'Project "shared-slug" already exists.',
    );
    expect(ctx.store.listProjects()).toHaveLength(1);
  });

  it("requires a name", () => {
    const { ctx } = setup();
    expect(() => executeCreateProject(ctx, { name: "   " })).toThrow("Project name is required.");
  });

  it("rejects an unknown project lead instead of creating an unlinked project", () => {
    const { ctx } = setup();
    expect(() =>
      executeCreateProject(ctx, { name: "Voice Language Trainer", project_lead_slug: "ghost" }),
    ).toThrow('Project lead agent "ghost" not found.');
  });

  /**
   * A bare "Project not found" let the caller invent a creation path and state it to the emperor as
   * fact. The error must name the tool that does the job.
   */
  it("points update_project at create_project when the project does not exist", () => {
    const { ctx } = setup();
    expect(() =>
      executeUpdateProject(ctx, { project_slug_or_id: "voice-language-trainer" }),
    ).toThrow("call create_project first");

    // And once it exists, the same call is no longer rejected by the guard.
    executeCreateProject(ctx, { name: "Voice Language Trainer" });
    expect(() =>
      executeUpdateProject(ctx, { project_slug_or_id: "voice-language-trainer", description: "x" }),
    ).not.toThrow();
  });

  /**
   * The root agent is refused `submit_intent` by design (it orchestrates, the lead plans). Measured
   * consequence: that refusal was the first thing the agent hit, and it answered the emperor with an
   * invented creation path because the message gave it nothing to correct with. The refusal must name
   * the tool that works.
   */
  it("submit_intent's root refusal names create_project as the way to get a container", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-create-project-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const skillStore = new SkillStore(db);
    const pmStore = new PmStore(db);
    const ctx = { store, agentStore, pmStore, skillStore } as unknown as KampakuToolContext;

    const error = await executeToolCall(ctx, "submit_intent", JSON.stringify({ intent: "build it" }), {
      agentId: KAMPAKU_AGENT_ID,
    }).catch((thrown: unknown) => thrown);

    expect(String((error as Error).message)).toContain("cannot submit project plans directly");
    expect(String((error as Error).message)).toContain("call create_project");
    expect(String((error as Error).message)).toContain("does not exist yet");
  });

  it("allows only the root agent, so a sub-agent cannot provision top-level projects", () => {
    const { ctx, agentStore } = setup();
    const specialist = agentStore.createSubAgent({
      slug: "vlt-backend",
      name: "Backend",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Backend",
      systemPrompt: "Backend",
    });

    expect(() =>
      executeCreateProject(ctx, { name: "Rogue" }, { agentId: specialist.id }),
    ).toThrow("Only the root agent may create a project.");
    expect(ctx.store.listProjects()).toHaveLength(0);

    // The root agent is still allowed.
    expect(
      executeCreateProject(ctx, { name: "Legitimate" }, { agentId: KAMPAKU_AGENT_ID }).slug,
    ).toBe("legitimate");
  });
});

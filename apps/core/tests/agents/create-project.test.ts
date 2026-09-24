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
import {
  CREATE_PROJECT_TOOL,
  executeCreateProject,
} from "../../src/agents/runtime/tools/create-project.js";
import { executeUpdateProject } from "../../src/agents/runtime/tools/update-project.js";
import { executeToolCall } from "../../src/agents/runtime/tools/index.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * The capability existed in the application layer and was reachable from `POST /api/v1/projects`, but
 * no agent tool exposed it. An agent asked to "create the project" could only update existing ones, so
 * it proposed a team and asked permission instead — leaving the arc with a team scoped to a project
 * that did not exist (LangProbe G-03).
 *
 * This file also locks the two structural rules that the tool grew afterwards, both measured live in
 * baseline run 2 rather than reasoned about:
 *
 * - **A container needs an owner.** The front office created `intake-demo` with `lead=none` and
 *   reported success. A work order nobody owns cannot be approved, scoped, or asked about
 *   (BOARD F-005).
 * - **Nothing may be persisted before the inputs are valid.** The lead slug used to be checked *after*
 *   `createProject`, so a typo left a container behind and then threw: an orphan produced by the
 *   failure path itself.
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
   * Every container now needs a lead, so most cases below start by creating one. That is the point of
   * the rule: the caller cannot reach the interesting assertions without satisfying it.
   */
  function leadSlug(agentStore: AgentStore, slug = "vlt-lead"): string {
    agentStore.createSubAgent({
      slug,
      name: slug,
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    return slug;
  }

  /**
   * Measured: the agent passed `file:///workspace/voice-language-trainer` — a container-style path
   * that exists on no filesystem here — and the project stored it and reported the repository as
   * linked. A project must not claim a repository it does not have.
   */
  it("refuses a file:// repository path that does not exist", () => {
    const { ctx, agentStore } = setup();
    expect(() =>
      executeCreateProject(ctx, {
        name: "Voice Language Trainer",
        project_lead_slug: leadSlug(agentStore),
        repositories: [{ url: "file:///workspace/voice-language-trainer", role: "core" }],
      }),
    ).toThrow("does not exist as a directory");
    expect(ctx.store.listProjects()).toHaveLength(0);
  });

  it("refuses a relative file:// repository path", () => {
    const { ctx, agentStore } = setup();
    expect(() =>
      executeCreateProject(ctx, {
        name: "Voice Language Trainer",
        project_lead_slug: leadSlug(agentStore),
        repositories: [{ url: "file://voice-language-trainer" }],
      }),
    ).toThrow("must use an absolute path");
  });

  it("refuses a repository inside the Kampaku workspace, so the app cannot land in the monorepo", () => {
    const { ctx, dir, agentStore } = setup();
    const insidePath = join(dir, "workspace", "voice-language-trainer");
    mkdirSync(insidePath, { recursive: true });
    const lead = leadSlug(agentStore);

    expect(() =>
      executeCreateProject(ctx, {
        name: "Voice Language Trainer",
        project_lead_slug: lead,
        repositories: [{ url: `file://${insidePath}` }],
      }),
    ).toThrow("is inside the Kampaku workspace");
    expect(ctx.store.listProjects()).toHaveLength(0);

    // A deliberate, recorded opt-in still works.
    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      project_lead_slug: lead,
      repositories: [{ url: `file://${insidePath}` }],
      allow_workspace_repository: true,
    });
    expect(project.repositories).toHaveLength(1);
  });

  it("accepts a repository that exists outside the workspace", () => {
    const { ctx, dir, agentStore } = setup();
    const outsidePath = join(dir, "voice-language-trainer");
    mkdirSync(outsidePath, { recursive: true });

    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      project_lead_slug: leadSlug(agentStore),
      repositories: [{ url: `file://${outsidePath}`, role: "core" }],
    });

    expect(project.repositories).toHaveLength(1);
    expect(project.repositories[0]?.url).toBe(`file://${outsidePath}`);
    expect(project.repositories[0]?.role).toBe("core");
  });

  /**
   * This case used to assert the opposite — that the tool happily created an unlinked project. That
   * behaviour is what produced `intake-demo` with `lead=none` in baseline run 2, so the assertion was
   * inverted along with the rule.
   */
  it("refuses a container with no lead, and creates nothing", () => {
    const { ctx } = setup();

    expect(() => executeCreateProject(ctx, { name: "Voice Language Trainer" })).toThrow(
      /needs an accountable owner/i,
    );
    // The refusal has to be actionable, or the caller retries the same way.
    expect(() => executeCreateProject(ctx, { name: "Voice Language Trainer" })).toThrow(
      /Create the lead with create_sub_agent first/,
    );
    expect(ctx.store.listProjects()).toHaveLength(0);
  });

  it("creates the container with a derived slug and links the lead", () => {
    const { ctx, agentStore } = setup();
    const lead = leadSlug(agentStore);
    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      project_lead_slug: lead,
    });

    expect(project.slug).toBe("voice-language-trainer");
    expect(project.status).toBe("planning");
    expect(project.projectLeadSlug).toBe(lead);
    expect(getProjectByIdOrSlug(ctx.store, "voice-language-trainer")?.name).toBe(
      "Voice Language Trainer",
    );
    // The container is owned, which is the whole point of requiring the slug.
    expect(ctx.store.getProject(project.id)?.projectLeadAgentId).toBeDefined();
  });

  it("links a repository and a project lead", () => {
    const { ctx, agentStore, dir } = setup();
    const repoPath = join(dir, "voice-language-trainer");
    mkdirSync(repoPath, { recursive: true });
    const lead = leadSlug(agentStore);

    const project = executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      project_lead_slug: lead,
      repositories: [{ url: `file://${repoPath}`, role: "web" }],
    });

    expect(project.projectLeadSlug).toBe(lead);
    expect(project.repositories).toHaveLength(1);
    expect(project.repositories[0]?.url).toBe(`file://${repoPath}`);
    expect(ctx.store.getProject(project.id)?.projectLeadAgentId).toBeDefined();
  });

  it("honours an explicit slug and refuses a duplicate", () => {
    const { ctx, agentStore } = setup();
    const lead = leadSlug(agentStore);
    executeCreateProject(ctx, { name: "First", slug: "shared-slug", project_lead_slug: lead });

    expect(() =>
      executeCreateProject(ctx, { name: "Second", slug: "shared-slug", project_lead_slug: lead }),
    ).toThrow('Project "shared-slug" already exists.');
    expect(ctx.store.listProjects()).toHaveLength(1);
  });

  it("requires a name", () => {
    const { ctx, agentStore } = setup();
    expect(() =>
      executeCreateProject(ctx, { name: "   ", project_lead_slug: leadSlug(agentStore) }),
    ).toThrow("Project name is required.");
  });

  /**
   * The check moved in front of the write. Previously a bad slug created the container and then threw,
   * so the failure path left an orphan: a project nobody owns and the caller was never told about.
   */
  it("refuses an unknown lead without persisting a container", () => {
    const { ctx } = setup();

    expect(() =>
      executeCreateProject(ctx, { name: "Voice Language Trainer", project_lead_slug: "ghost" }),
    ).toThrow('Project lead agent "ghost" not found, so no container was created.');

    // The important half: no orphan from the failure path.
    expect(ctx.store.listProjects()).toHaveLength(0);
    expect(getProjectByIdOrSlug(ctx.store, "voice-language-trainer")).toBeUndefined();
  });

  /**
   * A bare "Project not found" let the caller invent a creation path and state it to the emperor as
   * fact. The error must name the tool that does the job.
   */
  it("points update_project at create_project when the project does not exist", () => {
    const { ctx, agentStore } = setup();
    expect(() =>
      executeUpdateProject(ctx, { project_slug_or_id: "voice-language-trainer" }),
    ).toThrow("call create_project first");

    // And once it exists, the same call is no longer rejected by the guard.
    executeCreateProject(ctx, {
      name: "Voice Language Trainer",
      project_lead_slug: leadSlug(agentStore),
    });
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
    const lead = leadSlug(agentStore);
    const specialist = agentStore.createSubAgent({
      slug: "vlt-backend",
      name: "Backend",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Backend",
      systemPrompt: "Backend",
    });

    expect(() =>
      executeCreateProject(
        ctx,
        { name: "Rogue", project_lead_slug: lead },
        { agentId: specialist.id },
      ),
    ).toThrow("Only the root agent may create a project.");
    expect(ctx.store.listProjects()).toHaveLength(0);

    // The root agent is still allowed.
    expect(
      executeCreateProject(ctx, { name: "Legitimate", project_lead_slug: lead }, {
        agentId: KAMPAKU_AGENT_ID,
      }).slug,
    ).toBe("legitimate");
  });

  /**
   * The role gate is checked before the lead gate, so a sub-agent is refused for the right reason and
   * the message does not send it off to create a lead it does not need.
   */
  it("refuses a sub-agent for the role reason even when it passes a valid lead", () => {
    const { ctx, agentStore } = setup();
    const lead = leadSlug(agentStore);
    const specialist = agentStore.createSubAgent({
      slug: "vlt-helper",
      name: "Helper",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Help",
      systemPrompt: "Help",
    });

    expect(() =>
      executeCreateProject(ctx, { name: "Rogue", project_lead_slug: lead }, { agentId: specialist.id }),
    ).toThrow("Only the root agent may create a project.");
  });

  it("advertises the lead as required in its own schema, so the model is told before it calls", () => {
    // A rule the model only learns from an error costs a turn, and reads like a capability limit.
    const schema = JSON.stringify(CREATE_PROJECT_TOOL);

    expect(schema).toContain("project_lead_slug");
    expect(schema).toMatch(/"required":\["name","project_lead_slug"\]/);
    expect(schema).toMatch(/Create it with create_sub_agent before calling this tool/);
    // F-029: the tool states what its own word means, where the model reads tool semantics.
    expect(schema).toMatch(/not a Docker container or any other runtime object/);
  });
});

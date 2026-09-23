import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore, KAMPAKU_AGENT_ID } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { getProjectByIdOrSlug } from "../../src/application/projects.js";
import { executeCreateProject } from "../../src/agents/runtime/tools/create-project.js";
import { executeUpdateProject } from "../../src/agents/runtime/tools/update-project.js";
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
    return { ctx: { store, agentStore, pmStore } as unknown as KampakuToolContext, agentStore };
  }

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
    const { ctx, agentStore } = setup();
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
      repositories: [{ url: "file:///home/pdonoso/projects/voice-language-trainer", role: "web" }],
    });

    expect(project.projectLeadSlug).toBe(lead.slug);
    expect(project.repositories).toHaveLength(1);
    expect(project.repositories[0]?.url).toBe(
      "file:///home/pdonoso/projects/voice-language-trainer",
    );
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

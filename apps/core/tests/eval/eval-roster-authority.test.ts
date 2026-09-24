import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { executeToolCall } from "../../src/agents/runtime/tools/index.js";
import {
  assignProjectTeamSkills,
  createMissingAgentFromSlug,
} from "../../src/application/bootstrap/kampaku-platform-team.js";
import { createProject } from "../../src/application/projects.js";
import { seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { resolve } from "node:path";

/**
 * Three gaps that all have the same shape: **a capability that exists only if something was named,
 * linked, or declared correctly, with nothing reporting the miss.**
 *
 * - F-021 — the documented authority flow says the project lead creates the roster, but the lead held
 *   neither authorizing skill, so it could not; the specialists it managed could. Authority inverted.
 * - F-023 — a seat whose slug matched no known role was created with zero skills and no warning.
 * - F-004 — a linked repository recorded `defaultBranch: main` from a template, whatever the checkout
 *   actually had.
 *
 * Fixed under ADR-0006, with the boundary locked in both directions.
 */

describe("a project lead may create the seats it proposes (ADR-0006)", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  /** A project with an agent linked as its lead, and that lead holding no delegation skill. */
  async function leadWithoutDelegationSkills() {
    context = createTestContext("kampaku-lead-seats-");
    const { toolContext, agentStore, skillStore, store, pmStore } = context;

    const paths = mkdtempSync(join(tmpdir(), "kampaku-lead-repo-"));
    mkdirSync(paths, { recursive: true });

    const project = createProject(store, {
      name: "Lead seats",
      slug: "lead-seats",
      repositories: [{ url: `file://${paths}`, role: "primary" }],
    });

    const lead = agentStore.createSubAgent({
      slug: "lead-seats-lead",
      name: "Lead Seats Lead",
      responsibilities: "Lead the project",
      systemPrompt: "Lead",
      parentId: agentStore.getKampakuAgent().id,
    });

    store.updateProjectPlanning(project.id, { projectLeadAgentId: lead.id });

    // Deliberately no delegation skill: this is the measured state that made the flow impossible.
    const held = skillStore.listAgentSkills(lead.id);
    expect(held).not.toContain("system-agent-roster");
    expect(held).not.toContain("workflow-specialist-delegation");

    return { toolContext, agentStore, lead, pmStore };
  }

  it("allows it, and the seat exists afterwards", async () => {
    const { toolContext, agentStore, lead } = await leadWithoutDelegationSkills();

    await executeToolCall(
      toolContext,
      "create_sub_agent",
      JSON.stringify({
        slug: "lead-seats-data",
        name: "Lead Seats Data",
        responsibilities: "Own the data pipeline",
        system_prompt: "Own the data pipeline",
        parent_slug: lead.slug,
      }),
      { agentId: lead.id },
    );

    const created = agentStore.getAgentBySlugOrId("lead-seats-data");
    expect(created).toBeDefined();
    expect(created?.parentId).toBe(lead.id);
  });

  it("refuses an agent that leads nothing and holds no delegation skill", async () => {
    context = createTestContext("kampaku-non-lead-seats-");
    const { toolContext, agentStore } = context;

    const bystander = agentStore.createSubAgent({
      slug: "not-a-lead",
      name: "Not A Lead",
      responsibilities: "Do work",
      systemPrompt: "Do work",
      parentId: agentStore.getKampakuAgent().id,
    });

    const refused = await executeToolCall(
      toolContext,
      "create_sub_agent",
      JSON.stringify({
        slug: "not-a-lead-child",
        name: "Child",
        responsibilities: "Nothing",
        system_prompt: "Nothing",
        parent_slug: bystander.slug,
      }),
      { agentId: bystander.id },
    ).catch((error: unknown) => String((error as Error).message));

    expect(String(refused)).toMatch(/not authorized to create sub-agents/i);
    expect(agentStore.getAgentBySlugOrId("not-a-lead-child")).toBeUndefined();
  });

  it("still refuses a lead creating outside its own subtree", async () => {
    // The widening is bounded by the pre-existing parent-scope check. Without this assertion, ADR-0006
    // would read as "a lead may create anything anywhere".
    const { toolContext, agentStore, lead } = await leadWithoutDelegationSkills();

    const other = agentStore.createSubAgent({
      slug: "unrelated-lead",
      name: "Unrelated Lead",
      responsibilities: "Own another project",
      systemPrompt: "Other",
      parentId: agentStore.getKampakuAgent().id,
    });

    const refused = await executeToolCall(
      toolContext,
      "create_sub_agent",
      JSON.stringify({
        slug: "hijacked-child",
        name: "Hijacked",
        responsibilities: "Nothing",
        system_prompt: "Nothing",
        parent_slug: other.slug,
      }),
      { agentId: lead.id },
    ).catch((error: unknown) => String((error as Error).message));

    expect(String(refused)).toMatch(/hierarchy/i);
    expect(agentStore.getAgentBySlugOrId("hijacked-child")).toBeUndefined();
  });
});

describe("a seat with no capabilities is reported, not created silently (F-023)", () => {
  it("returns the matched role for a known suffix", () => {
    const context = createTestContext("kampaku-skill-match-");
    try {
      // The catalog has to be seeded, or `assigned` is empty for a different reason than an
      // unmatched role, and the test would pass while proving nothing about the role.
      seedSkillsFromCatalog(context.skillStore, resolve(process.cwd(), "../.."));

      const agent = context.agentStore.createSubAgent({
        slug: "proj-qa",
        name: "QA",
        responsibilities: "QA",
        systemPrompt: "QA",
        parentId: context.agentStore.getKampakuAgent().id,
      });

      const result = assignProjectTeamSkills(context.skillStore, agent.id, "proj-qa");

      expect(result.matchedRole).toBe("-qa");
      expect(result.assigned).toContain("qa-testing");
    } finally {
      context.cleanup();
    }
  });

  it("reports an unmatched role instead of leaving the seat empty and silent", () => {
    const context = createTestContext("kampaku-skill-nomatch-");
    try {
      const agent = context.agentStore.createSubAgent({
        slug: "proj-prompt",
        name: "Prompt",
        responsibilities: "Own prompts",
        systemPrompt: "Prompt",
        parentId: context.agentStore.getKampakuAgent().id,
      });

      const result = assignProjectTeamSkills(context.skillStore, agent.id, "proj-prompt");

      // The role matched nothing, and the caller can now tell.
      expect(result.matchedRole).toBeNull();
      expect(result.assigned).toEqual([]);
      expect(context.skillStore.listAgentSkills(agent.id)).toEqual([]);
    } finally {
      context.cleanup();
    }
  });

  it("exposes the miss through the seat-creation path that planning uses", () => {
    const context = createTestContext("kampaku-skill-create-");
    try {
      const created = createMissingAgentFromSlug(
        context.agentStore,
        "proj-prompt",
        "Own prompts",
        "kampaku",
        context.skillStore,
      );

      expect(created?.agent.slug).toBe("proj-prompt");
      expect(created?.skills.matchedRole).toBeNull();

      const known = createMissingAgentFromSlug(
        context.agentStore,
        "proj-qa",
        "Own QA",
        "kampaku",
        context.skillStore,
      );
      expect(known?.skills.matchedRole).toBe("-qa");
    } finally {
      context.cleanup();
    }
  });
});

describe("a linked repository records the branch it was given, or none (F-004)", () => {
  it("does not invent `main` when no branch was stated", () => {
    const context = createTestContext("kampaku-branch-unknown-");
    try {
      const directory = mkdtempSync(join(tmpdir(), "kampaku-branch-repo-"));
      try {
        const project = createProject(context.store, {
          name: "Branch unknown",
          slug: "branch-unknown",
          repositories: [{ url: `file://${directory}`, role: "primary" }],
        });

        // A template would have written `main` here. The branch is unknown, and saying so is the
        // honest value: a stored claim about a repository nobody read is the defect.
        expect(project.repositories[0].defaultBranch).toBeUndefined();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    } finally {
      context.cleanup();
    }
  });

  it("keeps a branch the caller actually stated", () => {
    const context = createTestContext("kampaku-branch-stated-");
    try {
      const directory = mkdtempSync(join(tmpdir(), "kampaku-branch-repo-"));
      try {
        const project = createProject(context.store, {
          name: "Branch stated",
          slug: "branch-stated",
          repositories: [{ url: `file://${directory}`, role: "primary", defaultBranch: "trunk" }],
        });

        expect(project.repositories[0].defaultBranch).toBe("trunk");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    } finally {
      context.cleanup();
    }
  });
});

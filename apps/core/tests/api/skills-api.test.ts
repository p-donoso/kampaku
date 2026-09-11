import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import {
  readSkillFromCatalog,
  writeSkillToCatalog,
} from "../../src/persistence/skill-catalog.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

describe("skills store", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-skills-store-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const skillStore = new SkillStore(db);
    const agentStore = new AgentStore(db);
    return { skillStore, agentStore };
  }

  it("lists agents assigned to a skill", () => {
    const { skillStore, agentStore } = createStores();
    skillStore.upsertSkill({
      slug: "qa-testing",
      name: "QA",
      description: "Test",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      promptFragment: "Test QA",
    });

    const kampaku = agentStore.getKampakuAgent();
    const sub = agentStore.createSubAgent({
      slug: "qa-agent",
      name: "QA Agent",
      responsibilities: "QA",
      systemPrompt: "QA",
      parentId: kampaku.id,
    });

    skillStore.assignSkill(sub.id, "qa-testing");
    expect(skillStore.listAgentsForSkill("qa-testing")).toEqual([sub.id]);
  });

  it("deleteSkill rejects when skill is assigned", () => {
    const { skillStore, agentStore } = createStores();
    skillStore.upsertSkill({
      slug: "docs-writer",
      name: "Docs",
      description: "Docs",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      promptFragment: "Write docs",
    });

    const kampaku = agentStore.getKampakuAgent();
    const sub = agentStore.createSubAgent({
      slug: "writer",
      name: "Writer",
      responsibilities: "Docs",
      systemPrompt: "Docs",
      parentId: kampaku.id,
    });
    skillStore.assignSkill(sub.id, "docs-writer");

    expect(() => skillStore.deleteSkill("docs-writer")).toThrow(/assigned/);
  });

  it("deleteSkill removes unassigned skill", () => {
    const { skillStore } = createStores();
    skillStore.upsertSkill({
      slug: "temp-skill",
      name: "Temp",
      description: "Temp",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      promptFragment: "Temp",
    });

    skillStore.deleteSkill("temp-skill");
    expect(skillStore.getSkill("temp-skill")).toBeUndefined();
  });

  it("renameSkill updates assignments", () => {
    const { skillStore, agentStore } = createStores();
    skillStore.upsertSkill({
      slug: "old-skill",
      name: "Old",
      description: "Old",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      promptFragment: "Old",
    });

    const kampaku = agentStore.getKampakuAgent();
    const sub = agentStore.createSubAgent({
      slug: "helper",
      name: "Helper",
      responsibilities: "Help",
      systemPrompt: "Help",
      parentId: kampaku.id,
    });
    skillStore.assignSkill(sub.id, "old-skill");

    skillStore.renameSkill("old-skill", "new-skill");
    expect(skillStore.getSkill("old-skill")).toBeUndefined();
    expect(skillStore.getSkill("new-skill")?.name).toBe("Old");
    expect(skillStore.listAgentsForSkill("new-skill")).toEqual([sub.id]);
  });

  it("assigns default skills to all agents except Kampaku", () => {
    const { skillStore, agentStore } = createStores();
    skillStore.upsertSkill({
      slug: "workflow-questions",
      name: "Questions",
      description: "Questions",
      capabilities: ["workflow.questions"],
      tools: ["ask_superior"],
      promptFragment: "Ask questions",
      default: true,
    });
    skillStore.upsertSkill({
      slug: "workflow-blockers",
      name: "Blockers",
      description: "Blockers",
      capabilities: ["workflow.blockers"],
      tools: ["report_blocker"],
      promptFragment: "Report blockers",
      default: true,
    });

    const kampaku = agentStore.getKampakuAgent();
    const sub = agentStore.createSubAgent({
      slug: "worker",
      name: "Worker",
      responsibilities: "Work",
      systemPrompt: "Work",
      parentId: kampaku.id,
    });

    skillStore.syncDefaultSkills(agentStore);

    expect(skillStore.listAgentSkills(kampaku.id)).not.toContain("workflow-questions");
    expect(skillStore.listAgentSkills(sub.id)).toEqual(
      expect.arrayContaining(["workflow-questions", "workflow-blockers"]),
    );
  });

  it("rejects unassign and delete for default skills", () => {
    const { skillStore, agentStore } = createStores();
    skillStore.upsertSkill({
      slug: "workflow-questions",
      name: "Questions",
      description: "Questions",
      capabilities: ["workflow.questions"],
      tools: ["ask_superior"],
      promptFragment: "Ask questions",
      default: true,
    });
    const sub = agentStore.createSubAgent({
      slug: "worker",
      name: "Worker",
      responsibilities: "Work",
      systemPrompt: "Work",
      parentId: agentStore.getKampakuAgent().id,
    });
    skillStore.syncDefaultSkillsForAgent(sub.id);

    expect(() => skillStore.unassignSkill(sub.id, "workflow-questions")).toThrow(/cannot be unassigned/);
    expect(() => skillStore.deleteSkill("workflow-questions")).toThrow(/cannot be deleted/);
  });
});

describe("skills api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-skills-api-"));
    const workspaceRoot = join(dataDir, "workspace");
    const catalogDir = join(workspaceRoot, "packages/contracts", "skills");
    mkdirSync(catalogDir, { recursive: true });
    writeSkillToCatalog(workspaceRoot, {
        slug: "seed-skill",
        name: "Seed Skill",
        description: "Seeded",
        capabilities: ["code.agent"],
        tools: ["code-agent"],
        promptFragment: "Seed",
    });

    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot,
      agentMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    bootstrapProject(store, config, db);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
    return { app, config, agentStore, skillStore };
  }

  it("GET /api/v1/skills lists skills with assignments", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/skills");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ slug: string }> };
    expect(body.skills.some((skill) => skill.slug === "seed-skill")).toBe(true);
  });

  it("GET /api/v1/skills/:slug returns skill detail", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/skills/seed-skill");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; assignedAgentSlugs: string[] };
    expect(body.slug).toBe("seed-skill");
    expect(body.assignedAgentSlugs).toEqual([]);
  });

  it("POST /api/v1/skills creates skill in catalog and DB", async () => {
    const { app, config } = createTestApp();
    const res = await app.request("/api/v1/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "new-skill",
        name: "New Skill",
        description: "Created via API",
        capabilities: ["code.agent"],
        tools: ["code-agent"],
        prompt_fragment: "Do new things",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("new-skill");
    expect(readSkillFromCatalog(config.workspaceRoot, "new-skill")?.name).toBe("New Skill");
  });

  it("POST /api/v1/skills rejects duplicate slug", async () => {
    const { app } = createTestApp();
    const payload = {
      slug: "dup-skill",
      name: "Dup",
      description: "Duplicate skill",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      prompt_fragment: "Dup",
    };
    const first = await app.request("/api/v1/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);

    const second = await app.request("/api/v1/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(409);
  });

  it("PATCH /api/v1/skills/:slug updates fields", async () => {
    const { app } = createTestApp();
    await app.request("/api/v1/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "patch-me",
        name: "Patch Me",
        description: "Before",
        capabilities: ["code.agent"],
        tools: ["code-agent"],
        prompt_fragment: "Before",
      }),
    });

    const res = await app.request("/api/v1/skills/patch-me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "After" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { description: string };
    expect(body.description).toBe("After");
  });

  it("DELETE /api/v1/skills/:slug removes skill", async () => {
    const { app, config } = createTestApp();
    await app.request("/api/v1/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "delete-me",
        name: "Delete Me",
        description: "Skill to delete",
        capabilities: ["code.agent"],
        tools: ["code-agent"],
        prompt_fragment: "Delete",
      }),
    });

    const res = await app.request("/api/v1/skills/delete-me", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(readSkillFromCatalog(config.workspaceRoot, "delete-me")).toBeUndefined();
  });

  it("DELETE /api/v1/skills/:slug conflicts when assigned", async () => {
    const { app, agentStore, skillStore, config } = createTestApp();
    skillStore.upsertSkill({
      slug: "assigned-skill",
      name: "Assigned",
      description: "Assigned skill",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      promptFragment: "Assigned",
    });
    writeSkillToCatalog(config.workspaceRoot, {
        slug: "assigned-skill",
        name: "Assigned",
        description: "Assigned skill",
        capabilities: ["code.agent"],
        tools: ["code-agent"],
        promptFragment: "Assigned",
    });

    const kampaku = agentStore.getKampakuAgent();
    const sub = agentStore.createSubAgent({
      slug: "user-agent",
      name: "User Agent",
      responsibilities: "Use skill",
      systemPrompt: "Use",
      parentId: kampaku.id,
    });
    skillStore.assignSkill(sub.id, "assigned-skill");

    const res = await app.request("/api/v1/skills/assigned-skill", { method: "DELETE" });
    expect(res.status).toBe(409);
  });
});

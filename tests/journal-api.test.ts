import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { createApp } from "../src/api/app.js";
import { bootstrapProject } from "../src/application/projects.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { BlockageStore } from "../src/persistence/blockage-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { JournalStore } from "../src/persistence/journal-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";

describe("journal api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-journal-api-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const journalStore = new JournalStore(db, pmStore);
    questionStore.setBlockageStore(blockageStore);
    questionStore.setJournalStore(journalStore);
    blockageStore.setQuestionStore(questionStore);
    blockageStore.setJournalStore(journalStore);
    bootstrapProject(store, config);
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      undefined,
      blockageStore,
      journalStore,
    );
    return { app, store, pmStore, journalStore, agentStore };
  }

  it("GET /api/v1/projects/:projectId/journal returns project entries", async () => {
    const { app, store, pmStore, journalStore, agentStore } = createTestApp();
    const project = store.listProjects()[0]!;
    const manager = agentStore.getAgentBySlugOrId("kampaku-manager");
    const parentId = uuidv4();
    const childId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: parentId,
      projectId: project.id,
      title: "Parent",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: childId,
      projectId: project.id,
      parentId,
      title: "Child",
      status: "done",
      priority: 0,
      sortOrder: 1,
      assigneeAgentId: manager?.id,
      assignedByAgentId: manager?.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    journalStore.append({
      projectId: project.id,
      workItemId: childId,
      kind: "completion_report",
      fromAgentId: manager?.id,
      toAgentId: manager?.id,
      title: "Completed: Child",
      body: "Done.",
    });

    const res = await app.request(`/api/v1/projects/${project.id}/journal`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ kind: string; body: string }> };
    expect(body.entries.some((entry) => entry.kind === "completion_report")).toBe(true);
  });

  it("GET /api/v1/work-items/:id/journal returns anchored entries", async () => {
    const { app, store, pmStore, journalStore } = createTestApp();
    const project = store.listProjects()[0]!;
    const parentId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: parentId,
      projectId: project.id,
      title: "Parent",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    journalStore.append({
      projectId: project.id,
      workItemId: parentId,
      kind: "audit_proposal",
      title: "Improve prompts",
      body: "Add clearer completion reporting guidance.",
    });

    const res = await app.request(`/api/v1/work-items/${parentId}/journal`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ kind: string }> };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.kind).toBe("audit_proposal");
  });
});

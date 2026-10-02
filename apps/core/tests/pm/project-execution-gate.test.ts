import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  advanceProjectIfAutoExecuting,
  playProject,
  setProjectAutoExecuting,
} from "../../src/application/pm/execute-project.js";
import { getProjectExecutionGate } from "../../src/application/pm/project-execution-gate.js";
import { retryWorkItem } from "../../src/application/pm/execute-work-item.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { loadConfig } from "../../src/config.js";

describe("project execution gate", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-project-gate-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const skillStore = new SkillStore(db);
    const conversationStore = new ConversationStore(db);
    const memoryStore = new MemoryStore(db);
    questionStore.setBlockageStore(blockageStore);
    blockageStore.setQuestionStore(questionStore);
    return { store, pmStore, agentStore, questionStore, blockageStore, skillStore, conversationStore, memoryStore, config };
  }

  it("gates on the first blocked task in plan order", () => {
    const { store, pmStore, agentStore } = createStores();
    const project = createProject(store, { slug: "gate", name: "Gate", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const blockedId = uuidv4();
    const nextId = uuidv4();

    pmStore.createWorkItem({
      id: blockedId,
      projectId: project.id,
      title: "Failed step",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: nextId,
      projectId: project.id,
      title: "Next step",
      status: "todo",
      priority: 0,
      sortOrder: 1,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const gate = getProjectExecutionGate({ pmStore, projectId: project.id });
    expect(gate.gated).toBe(true);
    expect(gate.reason).toBe("blocked_task");
    // The sentence names the item. It used to *be* the item's title, which told the operator neither the
    // rule that refused it nor what would clear it — three causes were listed one layer up instead, and all
    // three were empty on the measured specimen (BOARD F-088).
    expect(gate.detail).toContain("Failed step");
    expect(gate.detail).toContain(blockedId.slice(0, 8));
    expect(gate.detail, "a list of possible causes is not a cause").not.toMatch(
      /an error, pending question, or blocker/i,
    );
  });

  it("does not advance while gated even if auto-execute is enabled", async () => {
    const { store, pmStore, agentStore, questionStore, blockageStore, skillStore, conversationStore, memoryStore, config } = createStores();
    const project = createProject(store, { slug: "wait", name: "Wait", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();

    pmStore.createWorkItem({
      id: uuidv4(),
      projectId: project.id,
      title: "Blocked",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    setProjectAutoExecuting(store, project.id, true);
    const advanced = await advanceProjectIfAutoExecuting(
      { store, pmStore, agentStore, skillStore, config, questionStore, blockageStore },
      project.id,
    );
    expect(advanced).toBeNull();
  });

  it("resumes after a blocked task is reset to todo", async () => {
    const { store, pmStore, agentStore, questionStore, blockageStore, skillStore, conversationStore, memoryStore, config } = createStores();
    const project = createProject(store, { slug: "resume", name: "Resume", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const taskId = uuidv4();

    pmStore.createWorkItem({
      id: taskId,
      projectId: project.id,
      title: "Retry me",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    setProjectAutoExecuting(store, project.id, true);
    pmStore.updateWorkItem(taskId, { status: "todo" });

    expect(getProjectExecutionGate({ pmStore, projectId: project.id }).gated).toBe(false);
  });

  it("play retries the head blocked task when gated on blocked_task", async () => {
    const { store, pmStore, agentStore, questionStore, blockageStore, skillStore, conversationStore, memoryStore, config } = createStores();
    const project = createProject(store, { slug: "play-gated", name: "Play Gated", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const blockedId = uuidv4();

    pmStore.createWorkItem({
      id: blockedId,
      projectId: project.id,
      title: "Blocked",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const result = await playProject(
      {
        store,
        pmStore,
        agentStore,
        skillStore,
        config,
        questionStore,
        blockageStore,
        conversationStore,
        memoryStore,
      },
      project.slug,
    );

    expect(result.autoExecute).toBe(true);
    expect(result.started?.workItemId).toBe(blockedId);
    expect(result.gated).toBeUndefined();
    expect(pmStore.getWorkItem(blockedId)?.status).toBe("in_progress");
  });

  it("retryWorkItem resets a blocked leaf and queues a fresh execution", async () => {
    const { store, pmStore, agentStore, skillStore, config } = createStores();
    const project = createProject(store, { slug: "retry", name: "Retry", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const taskId = uuidv4();
    const oldGoalId = uuidv4();
    const oldJobId = uuidv4();

    pmStore.createWorkItem({
      id: taskId,
      projectId: project.id,
      title: "Failed leaf",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      goalId: oldGoalId,
      jobId: oldJobId,
      createdAt: now,
      updatedAt: now,
    });

    const result = await retryWorkItem(
      { store, pmStore, agentStore, skillStore, config },
      taskId,
    );

    expect(result.workItemId).toBe(taskId);
    expect(result.goalId).not.toBe(oldGoalId);
    expect(result.jobId).not.toBe(oldJobId);
    expect(pmStore.getWorkItem(taskId)?.status).toBe("in_progress");
  });

  it("retryWorkItem rejects non-blocked tasks", async () => {
    const { store, pmStore, agentStore, skillStore, config } = createStores();
    const project = createProject(store, { slug: "retry-invalid", name: "Retry Invalid", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const taskId = uuidv4();

    pmStore.createWorkItem({
      id: taskId,
      projectId: project.id,
      title: "Todo leaf",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      retryWorkItem({ store, pmStore, agentStore, skillStore, config }, taskId),
    ).rejects.toThrow("Only blocked tasks can be retried.");
  });
});

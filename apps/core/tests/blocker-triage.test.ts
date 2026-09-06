import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { playProject } from "../src/application/pm/execute-project.js";
import { escalateFailedJobToBlocker } from "../src/application/pm/job-failure-escalation.js";
import {
  buildBlockerTriageRoutingReason,
  findTriageWorkItemForBlocker,
} from "../src/application/pm/blocker-triage.js";
import { getProjectExecutionGate } from "../src/application/pm/project-execution-gate.js";
import { createProject } from "../src/application/projects.js";
import { KAMPAKU_AGENT_ID, AgentStore } from "../src/persistence/agent-store.js";
import { BlockageStore } from "../src/persistence/blockage-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { createDb } from "../src/persistence/db.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../src/persistence/skill-store.js";
import { Store, type JobResultRecord } from "../src/persistence/store.js";
import { loadConfig } from "../src/config.js";

describe("blocker triage workflow", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createContext() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-blocker-triage-"));
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
      seedSkillsFromCatalog(skillStore, join(process.cwd(), "..", "..", "packages/contracts"));
    return {
      store,
      pmStore,
      agentStore,
      questionStore,
      blockageStore,
      skillStore,
      conversationStore,
      memoryStore,
      config,
    };
  }

  it("creates a triage work item when a job failure is escalated to a blocker", () => {
    const ctx = createContext();
    const lead = ctx.agentStore.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    ctx.skillStore.syncDefaultSkillsForAgent(lead.id);
    const dev = ctx.agentStore.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    ctx.skillStore.syncDefaultSkillsForAgent(dev.id);

    const projectId = uuidv4();
    const workItemId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();

    ctx.store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    ctx.pmStore.createWorkItem({
      id: workItemId,
      projectId,
      title: "Build optimizer service",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      assigneeAgentId: dev.id,
      jobId,
      createdAt: now,
      updatedAt: now,
    });

    const result: JobResultRecord = {
      jobId,
      status: "failed",
      output: { executor: "freellmapi", successfulMutations: 0 },
      error: {
        code: "WORKER_NO_DELIVERABLES",
        message: "The task finished without writing or updating any files in the repository.",
        successfulMutations: 0,
      },
      finishedAt: now,
    };

    escalateFailedJobToBlocker(
      {
        store: ctx.store,
        pmStore: ctx.pmStore,
        agentStore: ctx.agentStore,
        blockageStore: ctx.blockageStore,
      },
      ctx.pmStore.getWorkItem(workItemId)!,
      result,
    );

    const blockers = ctx.blockageStore.listPending();
    expect(blockers).toHaveLength(1);
    const triage = findTriageWorkItemForBlocker(ctx.pmStore, projectId, blockers[0]!.id);
    expect(triage).toBeDefined();
    expect(triage?.assigneeAgentId).toBe(lead.id);
    expect(triage?.routingReason).toBe(buildBlockerTriageRoutingReason(blockers[0]!.id));
    expect(ctx.pmStore.getWorkItem(workItemId)?.status).toBe("blocked");
  });

  it("runs lead triage before retrying a blocked coding task", async () => {
    const ctx = createContext();
    const project = createProject(ctx.store, { slug: "stranger-lab", name: "Stranger Lab", status: "planning" });
    const lead = ctx.agentStore.createSubAgent({
      slug: "stranger-lab-lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    ctx.skillStore.syncDefaultSkillsForAgent(lead.id);
    const backend = ctx.agentStore.createSubAgent({
      slug: "stranger-lab-backend",
      name: "Backend",
      parentId: lead.id,
      responsibilities: "Backend",
      systemPrompt: "Backend",
    });
    ctx.skillStore.syncDefaultSkillsForAgent(backend.id);

    const now = new Date().toISOString();
    const blockedId = uuidv4();

    ctx.pmStore.createWorkItem({
      id: blockedId,
      projectId: project.id,
      title: "Create optimiser service",
      status: "blocked",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: backend.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const blocker = ctx.blockageStore.report({
      reportedByAgentId: backend.id,
      description: "The task finished without writing or updating any files in the repository.",
      projectId: project.id,
      workItemId: blockedId,
    });

    const gate = getProjectExecutionGate(
      ctx.pmStore,
      project.id,
      ctx.questionStore,
      ctx.blockageStore,
    );
    expect(gate.gated).toBe(false);

    const result = await playProject(
      {
        store: ctx.store,
        pmStore: ctx.pmStore,
        agentStore: ctx.agentStore,
        skillStore: ctx.skillStore,
        config: ctx.config,
        questionStore: ctx.questionStore,
        blockageStore: ctx.blockageStore,
        conversationStore: ctx.conversationStore,
        memoryStore: ctx.memoryStore,
      },
      project.slug,
    );

    const triage = findTriageWorkItemForBlocker(ctx.pmStore, project.id, blocker.id);
    expect(ctx.blockageStore.listPending()).toHaveLength(0);
    expect(ctx.pmStore.getWorkItem(triage!.id)?.status).toBe("done");
    expect(result.started?.workItemId).toBe(blockedId);
    expect(ctx.pmStore.getWorkItem(blockedId)?.status).toBe("in_progress");
    expect(ctx.pmStore.getWorkItem(blockedId)?.jobId).toBeDefined();
  });
});

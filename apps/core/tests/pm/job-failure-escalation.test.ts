import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { escalateFailedJobToBlocker } from "../../src/application/pm/job-failure-escalation.js";
import { KAMPAKU_AGENT_ID, AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { createDb } from "../../src/persistence/db.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { Store, type JobResultRecord } from "../../src/persistence/store.js";

function createContext() {
  const dir = mkdtempSync(join(tmpdir(), "kampaku-job-failure-escalation-"));
  const { db } = createDb(join(dir, "test.db"));
  const store = new Store(db);
  const agentStore = new AgentStore(db);
  const pmStore = new PmStore(db);
  const questionStore = new QuestionStore(db, agentStore, pmStore);
  const blockageStore = new BlockageStore(db, agentStore, pmStore);
  questionStore.setBlockageStore(blockageStore);
  blockageStore.setQuestionStore(questionStore);
  return { dir, store, agentStore, pmStore, blockageStore };
}

describe("escalateFailedJobToBlocker", () => {
  const dirs: string[] = [];

  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("reports a blocker to the assignee superior on initial the model endpoint timeout", () => {
    const { dir, store, agentStore, pmStore, blockageStore } = createContext();
    dirs.push(dir);

    const lead = agentStore.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agentStore.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });

    const projectId = uuidv4();
    const workItemId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();

    store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: workItemId,
      projectId,
      title: "Define API contracts",
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
      output: { executor: "endpoint" },
      error: {
        code: "KAMPAKU_MODEL_INITIAL_TIMEOUT",
        message: "the model endpoint did not respond within 120000ms after 3 attempts.",
        attempts: 3,
        timeoutMs: 120_000,
      },
      finishedAt: now,
    };

    const workItem = pmStore.getWorkItem(workItemId)!;
    escalateFailedJobToBlocker({ store, pmStore, agentStore, blockageStore }, workItem, result);

    const blockers = blockageStore.listPending();
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.recipientAgentId).toBe(lead.id);
    expect(blockers[0]?.workItemId).toBe(workItemId);
    expect(blockers[0]?.description).toContain("the model endpoint did not respond");
    expect(pmStore.getWorkItem(workItemId)?.status).toBe("blocked");
  });

  it("reports a blocker when file mutations never succeeded", () => {
    const { dir, store, agentStore, pmStore, blockageStore } = createContext();
    dirs.push(dir);

    const lead = agentStore.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agentStore.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });

    const projectId = uuidv4();
    const workItemId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();

    store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: workItemId,
      projectId,
      title: "Set up CI/CD pipeline",
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
      output: { executor: "endpoint", failedMutations: 4, successfulMutations: 0 },
      error: {
        code: "WORKER_INCOMPLETE_MUTATIONS",
        message: "All file write/replace attempts failed; the task was not completed in the repository.",
        failedMutations: 4,
        successfulMutations: 0,
      },
      finishedAt: now,
    };

    const workItem = pmStore.getWorkItem(workItemId)!;
    escalateFailedJobToBlocker({ store, pmStore, agentStore, blockageStore }, workItem, result);

    const blockers = blockageStore.listPending();
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.recipientAgentId).toBe(lead.id);
    expect(blockers[0]?.description).toContain("file write/replace attempts failed");
  });

  it("reports a blocker when the worker finishes without deliverables", () => {
    const { dir, store, agentStore, pmStore, blockageStore } = createContext();
    dirs.push(dir);

    const lead = agentStore.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agentStore.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });

    const projectId = uuidv4();
    const workItemId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();

    store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: workItemId,
      projectId,
      title: "Document API",
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
      output: { executor: "endpoint", successfulMutations: 0 },
      error: {
        code: "WORKER_NO_DELIVERABLES",
        message: "The task finished without writing or updating any files in the repository.",
        successfulMutations: 0,
      },
      finishedAt: now,
    };

    const workItem = pmStore.getWorkItem(workItemId)!;
    escalateFailedJobToBlocker({ store, pmStore, agentStore, blockageStore }, workItem, result);

    const blockers = blockageStore.listPending();
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.description).toContain("without writing or updating any files");
  });
});

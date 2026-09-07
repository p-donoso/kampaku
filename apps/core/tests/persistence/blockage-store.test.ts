import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore, KAMPAKU_AGENT_ID } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";

function createStores() {
  const dir = mkdtempSync(join(tmpdir(), "kampaku-blockers-"));
  const { db } = createDb(join(dir, "test.db"));
  const agents = new AgentStore(db);
  const pm = new PmStore(db);
  const questions = new QuestionStore(db, agents, pm);
  const blockers = new BlockageStore(db, agents, pm);
  questions.setBlockageStore(blockers);
  blockers.setQuestionStore(questions);
  return { dir, agents, pm, questions, blockers };
}

describe("BlockageStore", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("routes upward, blocks the work item, and restores it after resolve", () => {
    const { dir, agents, pm, blockers } = createStores();
    dirs.push(dir);
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: workItemId,
      projectId: "project-1",
      title: "Implement API",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const blocker = blockers.report({
      reportedByAgentId: dev.id,
      description: "Missing dependency",
      workItemId,
      projectId: "project-1",
    });
    expect(blocker.recipientAgentId).toBe(lead.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("blocked");
    expect(blockers.escalate(blocker.id, lead.id).recipientAgentId).toBe(KAMPAKU_AGENT_ID);
    blockers.resolve(blocker.id, "Use the public API.", KAMPAKU_AGENT_ID);
    expect(pm.getWorkItem(workItemId)?.status).toBe("todo");
  });

  it("convertToQuestion creates a question and resolves the blocker", () => {
    const { dir, agents, pm, questions, blockers } = createStores();
    dirs.push(dir);
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: workItemId,
      projectId: "project-1",
      title: "Implement API",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const blocker = blockers.report({
      reportedByAgentId: dev.id,
      description: "Which API?",
      workItemId,
      projectId: "project-1",
    });
    const result = blockers.convertToQuestion(blocker.id, lead.id, questions);
    expect(result.blocker.status).toBe("resolved");
    expect(result.blocker.resolutionKind).toBe("converted_to_question");
    expect(result.question.status).toBe("pending");
    expect(result.question.recipientAgentId).toBe(lead.id);
    expect(questions.list("pending")).toHaveLength(1);
    questions.answer(result.question.id, "Use REST.", lead.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("todo");
  });

  it("delegate creates a work item and unblocks when blocker is resolved", () => {
    const { dir, agents, pm, blockers } = createStores();
    dirs.push(dir);
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const specialist = agents.createSubAgent({
      slug: "specialist",
      name: "Specialist",
      parentId: lead.id,
      responsibilities: "Specialist",
      systemPrompt: "Specialist",
    });
    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: workItemId,
      projectId: "project-1",
      title: "Implement API",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const blocker = blockers.report({
      reportedByAgentId: dev.id,
      description: "Needs security review",
      workItemId,
      projectId: "project-1",
    });
    const result = blockers.delegate(blocker.id, lead.id, {
      title: "Security review",
      assigneeAgentId: specialist.id,
    });
    expect(result.blocker.status).toBe("resolved");
    expect(result.blocker.resolutionKind).toBe("delegated");
    expect(result.workItem.assigneeAgentId).toBe(specialist.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("todo");
  });

  it("keeps work item blocked until both question and blocker are cleared", () => {
    const { dir, agents, pm, questions, blockers } = createStores();
    dirs.push(dir);
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: lead.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: workItemId,
      projectId: "project-1",
      title: "Implement API",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const question = questions.ask({
      askedByAgentId: dev.id,
      question: "Which API?",
      workItemId,
    });
    blockers.report({
      reportedByAgentId: dev.id,
      description: "Build failing",
      workItemId,
      projectId: "project-1",
    });

    questions.answer(question.id, "Use REST.", lead.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("blocked");

    const pendingBlocker = blockers.list("pending")[0]!;
    blockers.resolve(pendingBlocker.id, "Fix applied.", lead.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("todo");
  });
});

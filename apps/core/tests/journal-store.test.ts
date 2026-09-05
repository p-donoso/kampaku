import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { syncWorkItemFromJobResult } from "../src/application/pm/execute-work-item.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { JournalStore } from "../src/persistence/journal-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import { BlockageStore } from "../src/persistence/blockage-store.js";

describe("JournalStore", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function createFixture() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-journal-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const journal = new JournalStore(db, pm);
    const memory = new MemoryStore(db);
    const questions = new QuestionStore(db, agents, pm);
    const blockers = new BlockageStore(db, agents, pm);
    questions.setBlockageStore(blockers);
    questions.setJournalStore(journal);
    blockers.setQuestionStore(questions);
    blockers.setJournalStore(journal);
    return { agents, pm, journal, memory, questions, blockers };
  }

  it("anchors entries on the parent work item", () => {
    const { agents, pm, journal } = createFixture();
    const manager = agents.createSubAgent({
      slug: "manager",
      name: "Manager",
      parentId: agents.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Manager",
      systemPrompt: "Manager",
    });
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: manager.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const now = new Date().toISOString();
    const parentId = uuidv4();
    const childId = uuidv4();
    pm.createWorkItem({
      id: parentId,
      projectId: "project-1",
      title: "Epic",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: manager.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pm.createWorkItem({
      id: childId,
      projectId: "project-1",
      parentId,
      title: "Leaf task",
      status: "done",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: dev.id,
      assignedByAgentId: manager.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    journal.append({
      projectId: "project-1",
      workItemId: childId,
      kind: "completion_report",
      fromAgentId: dev.id,
      toAgentId: manager.id,
      title: "Completed: Leaf task",
      body: "Implemented the feature.",
    });

    const parentEntries = journal.listByAnchor(parentId);
    expect(parentEntries).toHaveLength(1);
    expect(parentEntries[0]?.kind).toBe("completion_report");
    expect(parentEntries[0]?.body).toContain("Implemented");

    const leafEntries = journal.listForWorkItem(childId);
    expect(leafEntries).toHaveLength(1);
    expect(leafEntries[0]?.workItemId).toBe(childId);
  });

  it("records question and blocker events on the parent journal", () => {
    const { agents, pm, journal, questions, blockers } = createFixture();
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: agents.getAgentBySlugOrId("kampaku")!.id,
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
    const parentId = uuidv4();
    const childId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: parentId,
      projectId: "project-1",
      title: "Epic",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pm.createWorkItem({
      id: childId,
      projectId: "project-1",
      parentId,
      title: "Leaf",
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
      workItemId: childId,
      projectId: "project-1",
    });
    questions.answer(question.id, "Use REST.", lead.id);

    blockers.report({
      reportedByAgentId: dev.id,
      description: "Build fails",
      workItemId: childId,
      projectId: "project-1",
    });

    const kinds = journal.listByAnchor(parentId).map((entry) => entry.kind);
    expect(kinds).toContain("question_raised");
    expect(kinds).toContain("question_answered");
    expect(kinds).toContain("blocker_reported");
  });

  it("syncWorkItemFromJobResult writes a completion report and agent log from job output", () => {
    const { agents, pm, journal, memory } = createFixture();
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: agents.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const parentId = uuidv4();
    const childId = uuidv4();
    const jobId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: parentId,
      projectId: "project-1",
      title: "Epic",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pm.createWorkItem({
      id: childId,
      projectId: "project-1",
      parentId,
      title: "Leaf",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: dev.id,
      jobId,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    syncWorkItemFromJobResult(pm, jobId, "succeeded", journal, {
      jobId,
      leaseId: "lease-1",
      status: "succeeded",
      output: { summary: "Added health endpoint." },
      finishedAt: now,
    }, memory);

    expect(pm.getWorkItem(childId)?.status).toBe("done");
    const entries = journal.listForWorkItem(childId);
    expect(entries.some((entry) => entry.kind === "completion_report")).toBe(true);
    const report = entries.find((entry) => entry.kind === "completion_report");
    expect(report?.body).toContain("health endpoint");
    expect(report?.body).toContain("Job:");
    expect(memory.list({ agentId: dev.id, kind: "log" })).toHaveLength(1);
    expect(memory.list({ agentId: dev.id, kind: "log" })[0]?.body).toBe('Completed "Leaf".');
  });
});

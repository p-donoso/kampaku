import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { createDb } from "../src/persistence/db.js";
import { AgentStore, KAMPAKU_AGENT_ID } from "../src/persistence/agent-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { BlockageStore } from "../src/persistence/blockage-store.js";

describe("QuestionStore", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("routes upward, blocks the work item, and restores it after the answer", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-questions-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const questions = new QuestionStore(db, agents, pm);
    const blockers = new BlockageStore(db, agents, pm);
    questions.setBlockageStore(blockers);
    blockers.setQuestionStore(questions);
    const lead = agents.createSubAgent({ slug: "lead", name: "Lead", parentId: KAMPAKU_AGENT_ID, responsibilities: "Lead", systemPrompt: "Lead" });
    const dev = agents.createSubAgent({ slug: "dev", name: "Dev", parentId: lead.id, responsibilities: "Dev", systemPrompt: "Dev" });
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

    const question = questions.ask({ askedByAgentId: dev.id, question: "Which API?", workItemId });
    expect(question.recipientAgentId).toBe(lead.id);
    expect(pm.getWorkItem(workItemId)?.status).toBe("blocked");
    expect(questions.escalate(question.id, lead.id).recipientAgentId).toBe(KAMPAKU_AGENT_ID);
    questions.answer(question.id, "Use the public API.");
    expect(pm.getWorkItem(workItemId)?.status).toBe("todo");
  });
});

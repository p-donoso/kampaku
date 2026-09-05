import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { executeProposeAuditImprovement } from "../src/agents/runtime/tools/journal-tools.js";
import type { KampakuToolContext } from "../src/agents/runtime/tools/index.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { BlockageStore } from "../src/persistence/blockage-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { JournalStore } from "../src/persistence/journal-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";
import { loadConfig } from "../src/config.js";

describe("auditor journal tools", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("allows propose_audit_improvement only for system-audit agents", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-audit-tool-"));
    dirs.push(dir);
    const config = loadConfig({
      dataDir: dir,
      dbPath: join(dir, "kampaku.db"),
      workspaceRoot: join(dir, "workspace"),
      agentMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    skillStore.upsertSkill({
      slug: "system-audit",
      name: "Communication Audit",
      description: "Audit",
      capabilities: ["system.audit"],
      tools: ["propose_audit_improvement"],
      promptFragment: "Audit",
    });
    const journalStore = new JournalStore(db, pmStore);
    const auditor = agentStore.createSubAgent({
      slug: "kampaku-auditor",
      name: "Auditor",
      parentId: agentStore.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Audit",
      systemPrompt: "Audit",
    });
    skillStore.assignSkill(auditor.id, "system-audit");
    const dev = agentStore.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: auditor.id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });

    const ctx = {
      store,
      agentStore,
      conversationStore: new ConversationStore(db),
      pmStore,
      skillStore,
      config,
      journalStore,
      memoryStore: undefined,
    } as unknown as KampakuToolContext;

    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: workItemId,
      projectId: "project-1",
      title: "Root",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(() =>
      executeProposeAuditImprovement(ctx, {
        agent_slug: dev.slug,
        project_id: "project-1",
        anchor_work_item_id: workItemId,
        title: "Improve dev prompt",
        proposal: "Add examples.",
      }),
    ).toThrow(/system-audit/);

    const result = executeProposeAuditImprovement(ctx, {
      agent_slug: auditor.slug,
      project_id: "project-1",
      anchor_work_item_id: workItemId,
      title: "Improve dev prompt",
      proposal: "Add examples.",
      target_agent_slug: dev.slug,
    });
    expect(result.anchorWorkItemId).toBe(workItemId);
    expect(journalStore.listByAnchor(workItemId)).toHaveLength(1);
  });
});

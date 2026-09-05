import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { resolveCompletionRecipient } from "../src/application/pm/journal-events.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";

describe("resolveCompletionRecipient", () => {
  it("routes completion reports to the assignee agent parent, not stale assignedBy", () => {
    const { db } = createDb(":memory:");
    const store = new Store(db);
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const kampaku = agents.getAgentBySlugOrId("kampaku")!;
    const lead = agents.createSubAgent({
      slug: "demo-lead",
      name: "Demo Lead",
      parentId: kampaku.id,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const specialist = agents.createSubAgent({
      slug: "demo-arch",
      name: "Demo Arch",
      parentId: lead.id,
      responsibilities: "Arch",
      systemPrompt: "Arch",
    });
    const manager = agents.createSubAgent({
      slug: "kampaku-manager",
      name: "Manager",
      parentId: kampaku.id,
      responsibilities: "Manager",
      systemPrompt: "Manager",
    });
    const projectId = uuidv4();
    store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      repositories: [],
      projectLeadAgentId: lead.id,
      createdAt: new Date().toISOString(),
    });
    const workItemId = uuidv4();
    const now = new Date().toISOString();
    pm.createWorkItem({
      id: workItemId,
      projectId,
      title: "Task",
      status: "done",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: specialist.id,
      assignedByAgentId: manager.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const recipient = resolveCompletionRecipient(pm.getWorkItem(workItemId)!, {
      agentStore: agents,
      store,
    });

    expect(recipient).toBe(lead.id);
  });
});

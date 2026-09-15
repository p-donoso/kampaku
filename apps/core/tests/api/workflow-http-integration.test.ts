import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject, createProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import { v4 as uuidv4 } from "uuid";

describe("workflow HTTP integration", () => {
  let dataDir = "";
  afterEach(() => { if (dataDir) rmSync(dataDir, { recursive: true, force: true }); });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-workflow-http-"));
    const config = loadConfig({ dataDir, dbPath: join(dataDir, "kampaku.db"), workspaceRoot: join(dataDir, "workspace"), agentMode: "stub", plannerMode: "stub" });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const conversationStore = new ConversationStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const wikiStore = new WikiStore(db);
    bootstrapProject(store, config, db);
    seedSkillsFromCatalog(skillStore, resolve(process.cwd(), "../.."));
    const manager = agentStore.getAgentBySlugOrId("kampaku-manager");
    if (manager && skillStore.listAgentSkills(manager.id).indexOf("system-delegation") < 0) skillStore.assignSkill(manager.id, "system-delegation");
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore, undefined, memoryStore, undefined, journalStore, wikiStore, db);
    return { app, store, agentStore, pmStore, skillStore, journalStore, wikiStore };
  }

  it("rejects approve_plan for an agent without planning authority", async () => {
    const { app, agentStore } = fixture();
    agentStore.createSubAgent({ slug: "untrusted-planner", name: "Untrusted Planner", parentId: agentStore.getKampakuAgent().id, responsibilities: "Observe", systemPrompt: "Observe" });
    const response = await app.request("/api/v1/plans/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent_slug: "untrusted-planner", project_slug: "demo", approval_reference: "plan-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" }) });
    expect(response.status).toBe(403);
    expect(await response.text()).toMatch(/authorized planning agent|project lead/i);
  });

  it("rejects apply after a persisted approval is revoked", async () => {
    const { app, agentStore } = fixture();
    const lead = agentStore.getAgentBySlugOrId("kampaku-manager")!;
    const preview = await app.request("/api/v1/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "Create a small approved project", projectSlug: "approved-http", mode: "preview" }) });
    const previewBody = await preview.json() as { approvalReference: string; planFingerprint: string; planContentHash: string };
    await app.request("/api/v1/plans/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent_slug: lead.slug, project_slug: "approved-http", approval_reference: previewBody.approvalReference, plan_fingerprint: previewBody.planFingerprint, plan_content_hash: previewBody.planContentHash }) });
    const mismatched = await app.request("/api/v1/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "Create a small approved project", projectSlug: "approved-http", mode: "apply", approvalReference: previewBody.approvalReference, approvalFingerprint: previewBody.planFingerprint, approvalContentHash: "wrong-content-hash" }) });
    expect(mismatched.status).toBe(409);
    await app.request("/api/v1/plans/revoke", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent_slug: lead.slug, project_slug: "approved-http", approval_reference: previewBody.approvalReference, plan_fingerprint: previewBody.planFingerprint, plan_content_hash: previewBody.planContentHash }) });
    const applied = await app.request("/api/v1/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "Create a small approved project", projectSlug: "approved-http", mode: "apply", approvalReference: previewBody.approvalReference, approvalFingerprint: previewBody.planFingerprint, approvalContentHash: previewBody.planContentHash }) });
    expect(applied.status).toBe(409);
    expect(await applied.text()).toMatch(/persisted approval|fingerprint/i);
  });

  it("reports the missing required wiki page over HTTP", async () => {
    const { app, store, pmStore, agentStore } = fixture();
    const project = createProject(store, { slug: "wiki-gated-http", name: "Wiki Gated HTTP", status: "active", wikiSyncRequired: true, wikiSyncPhasePages: { "phase-1": "phase-1-overview" } });
    const agent = agentStore.getAgentBySlugOrId("kampaku-manager")!;
    const itemId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({ id: itemId, projectId: project.id, title: "Phase 1 verification", status: "in_progress", priority: 0, sortOrder: 0, assigneeAgentId: agent.id, assignedByAgentId: agent.id, acceptanceCriteria: [], dependsOn: [], createdAt: now, updatedAt: now });
    const response = await app.request(`/api/v1/work-items/${itemId}/reporting-status?agent_slug=${agent.slug}&require_wiki_sync=true`);
    expect(response.status).toBe(200);
    const body = await response.json() as { readyForClosure: boolean; missing: string[] };
    expect(body.readyForClosure).toBe(false);
    expect(body.missing).toContain("wiki_sync");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { ensurePhaseAuditorAfterLeafDone, isPhaseGateWorkItem } from "../../src/application/pm/phase-auditor-gate.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { loadConfig } from "../../src/config.js";
import { getProjectExecutionGate } from "../../src/application/pm/project-execution-gate.js";
import { JournalStore } from "../../src/persistence/journal-store.js";

describe("phase auditor gate", () => {
  let dataDir: string;
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-phase-gate-"));
    const config = loadConfig({ dataDir, dbPath: join(dataDir, "kampaku.db") });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const project = createProject(store, { slug: "demo", name: "Demo", status: "active" });
    const kampaku = agentStore.getKampakuAgent();
    const auditor = agentStore.createSubAgent({
      slug: "demo-auditor",
      name: "Demo Auditor",
      parentId: kampaku.id,
      responsibilities: "Audit",
      systemPrompt: "Audit",
    });
    return { store, pmStore, agentStore, project, auditor, journalStore };
  }

  it("creates an auditor leaf after the last coding leaf in a root phase", () => {
    const { store, pmStore, agentStore, project, auditor } = fixture();
    const now = new Date().toISOString();
    const phaseId = uuidv4();
    const leafId = uuidv4();
    pmStore.createWorkItem({
      id: phaseId,
      projectId: project.id,
      title: "Phase 1",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: leafId,
      projectId: project.id,
      parentId: phaseId,
      title: "Implement module",
      status: "done",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["npm test succeeds"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const created = ensurePhaseAuditorAfterLeafDone(pmStore, agentStore, store, leafId);
    expect(created).toBeDefined();
    expect(isPhaseGateWorkItem(created!)).toBe(true);
    expect(created?.assigneeAgentId).toBe(auditor.id);
    // **The audit of somebody else's checkout is the platform's record, not a new directory in their tree.**
    //
    // This used to assert that the leaf's criteria name `docs/audit/latest.md`, and they did — which is why job
    // `c1c30b0e` on suite 19 run `s19r17` (scenario M, a brownfield monorepo) created `docs/audit/latest.md` at the
    // top of a repository whose request was one small feature in `packages/orders` and no document at all
    // (BOARD F-144). The criterion was the instruction. The audit is still demanded — the gate refuses a phase
    // whose recorded audit is missing or a stub (`auditArtifactIsHonest`) — but it is demanded *as the platform's
    // record of the audit*, and the leaf carries only the checkout's own check.
    expect(created?.acceptanceCriteria.some((item) => item.includes("docs/audit/latest.md"))).toBe(false);
    expect(created?.acceptanceCriteria.some((item) => item.includes("docs/"))).toBe(false);
    expect(created?.description).toContain("Do not add files to this checkout");
    expect(created?.description).not.toContain("Write docs/audit/latest.md");
    expect(created?.description, "the verdict and score are still demanded").toMatch(/verdict/i);
    expect(created?.acceptanceCriteria.length).toBeGreaterThan(0);

    const phase = pmStore.getWorkItem(phaseId);
    expect(phase?.status).not.toBe("done");
  });

  it("gates execution while an auditor leaf is in progress", () => {
    const { store, pmStore, agentStore, project } = fixture();
    const now = new Date().toISOString();
    const phaseId = uuidv4();
    const leafId = uuidv4();
    pmStore.createWorkItem({
      id: phaseId,
      projectId: project.id,
      title: "Phase 1",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: leafId,
      projectId: project.id,
      parentId: phaseId,
      title: "Implement module",
      status: "done",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["npm test succeeds"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    const auditorItem = ensurePhaseAuditorAfterLeafDone(pmStore, agentStore, store, leafId);
    pmStore.updateWorkItem(auditorItem!.id, { status: "in_progress" });

    const gate = getProjectExecutionGate({ pmStore, projectId: project.id });
    expect(gate.gated).toBe(true);
    expect(gate.reason).toBe("pending_phase_audit");
  });

  it("gates execution when a high-impact risk is still open", () => {
    const { store, pmStore, agentStore, project, journalStore } = fixture();
    const now = new Date().toISOString();
    const itemId = uuidv4();
    pmStore.createWorkItem({
      id: itemId,
      projectId: project.id,
      title: "Risk anchor",
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
      workItemId: itemId,
      kind: "risk_reported",
      title: "Risk: provider outage",
      body: "The provider may be unavailable.",
      metadata: { impact: "critical", probability: "medium" },
    });

    const gate = getProjectExecutionGate({
      pmStore,
      projectId: project.id,
      journalStore,
    });
    expect(gate.gated).toBe(true);
    expect(gate.reason).toBe("open_high_risk");
  });
});

/**
 * The platform's own project is the one checkout whose `docs/` **is** the platform's record.
 *
 * Splitting the rule matters: the fix for F-144 must not remove the artifact the platform's own phase gates are
 * written against, only stop the platform writing it into repositories it does not own.
 */
describe("where a phase audit is recorded (suite 19 / s19r17)", () => {
  let dataDir = "";
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function fixtureWith(slug: string) {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-phase-gate-"));
    const config = loadConfig({ dataDir, dbPath: join(dataDir, "kampaku.db") });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const project = createProject(store, { slug, name: slug, status: "active" });
    const kampaku = agentStore.getKampakuAgent();
    agentStore.createSubAgent({
      slug: `${slug}-auditor`,
      name: "Auditor",
      parentId: kampaku.id,
      responsibilities: "Audit",
      systemPrompt: "Audit",
    });
    const now = new Date().toISOString();
    const phaseId = uuidv4();
    const leafId = uuidv4();
    pmStore.createWorkItem({
      id: phaseId,
      projectId: project.id,
      title: "Phase 1",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: leafId,
      projectId: project.id,
      parentId: phaseId,
      title: "Implement module",
      status: "done",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["npm test succeeds"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return ensurePhaseAuditorAfterLeafDone(pmStore, agentStore, store, leafId);
  }

  it("keeps the artifact for the platform's own project", () => {
    const created = fixtureWith("kampaku");
    expect(created).toBeDefined();
    expect(created?.acceptanceCriteria.some((item) => item.includes("docs/audit/latest.md"))).toBe(true);
    expect(created?.description).toContain("Write docs/audit/latest.md");
  });

  it("records it as the platform's own record for every other project", () => {
    const created = fixtureWith("stranger");
    expect(created).toBeDefined();
    expect(created?.acceptanceCriteria.some((item) => item.includes("docs/audit/latest.md"))).toBe(false);
    expect(created?.description).not.toContain("Write docs/audit/latest.md");
    expect(created?.description).toMatch(/Record the audit in your completion report/i);
  });
});

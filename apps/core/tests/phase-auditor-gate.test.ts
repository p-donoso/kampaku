import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { ensurePhaseAuditorAfterLeafDone, isPhaseGateWorkItem } from "../src/application/pm/phase-auditor-gate.js";
import { createProject } from "../src/application/projects.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";
import { loadConfig } from "../src/config.js";
import { getProjectExecutionGate } from "../src/application/pm/project-execution-gate.js";

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
    const project = createProject(store, { slug: "demo", name: "Demo", status: "active" });
    const kampaku = agentStore.getKampakuAgent();
    const auditor = agentStore.createSubAgent({
      slug: "demo-auditor",
      name: "Demo Auditor",
      parentId: kampaku.id,
      responsibilities: "Audit",
      systemPrompt: "Audit",
    });
    return { store, pmStore, agentStore, project, auditor };
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
    expect(created?.acceptanceCriteria.some((item) => item.includes("docs/audit/latest.md"))).toBe(true);

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

    const gate = getProjectExecutionGate(pmStore, project.id);
    expect(gate.gated).toBe(true);
    expect(gate.reason).toBe("pending_phase_audit");
  });
});

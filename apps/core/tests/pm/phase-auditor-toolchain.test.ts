import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  auditCheckCriterion,
  ensurePhaseAuditorWorkItem,
} from "../../src/application/pm/phase-auditor-gate.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * **A phase gate is decided by the checkout's own check, and signed by the project's own seat.**
 *
 * Two defects, both measured on suite 18's first run (`s18a1`, 2026-11-05), both read back by that run's own
 * cross-check prompt without being asked to look for them:
 *
 * 1. The gate's third acceptance criterion was the literal *"npm test passes when package.json defines a test
 *    script"* on every project, including a Makefile-wrapped Python checkout with no `package.json` — a
 *    criterion that checkout can neither satisfy nor meaningfully fail. It is the same leaked template as
 *    BOARD F-003's other three instances, in the one place nothing had looked yet.
 * 2. The gate was assigned to `kampaku-auditor`, a station that serves the platform's own project, on a work
 *    order opened for a stranger's checkout — while the project's own team stood idle.
 *
 * The rule these tests hold: the gate's check criterion comes from the linked checkout (and states the file
 * that declares it), the platform's auditor never signs an external project's gate, and a project that has no
 * auditor seat gets its own lead rather than somebody else's station.
 */
describe("phase gate — the checkout's check, the project's own auditor (F-003)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  function pythonCheckout(): string {
    const root = tempDir("kampaku-s18-gate-py-");
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "Makefile"), "check:\n\tpython3 -m unittest discover -s tests -v\n");
    return root;
  }

  function bareCheckout(): string {
    const root = tempDir("kampaku-s18-gate-bare-");
    writeFileSync(join(root, "main.py"), "def main():\n    pass\n");
    return root;
  }

  function setup(checkout: string | undefined, slug: string) {
    const dataDir = tempDir("kampaku-s18-gate-data-");
    const { db } = createDb(join(dataDir, "t.db"));
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const project = createProject(store, {
      slug,
      name: slug,
      status: "active",
      repositories: checkout ? [{ url: `file://${checkout}`, role: "core" }] : [],
    });
    const lead = agentStore.createSubAgent({
      slug: `${slug}-lead`,
      name: `${slug} lead`,
      responsibilities: "Own the project",
      systemPrompt: "Own the project",
      parentId: agentStore.getKampakuAgent().id,
    });
    store.updateProjectPlanning(project.id, { projectLeadAgentId: lead.id });

    const now = new Date().toISOString();
    const phase = pmStore.createWorkItem({
      id: uuidv4(),
      projectId: project.id,
      title: "One small change",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    // The gate only exists for a phase whose leaves are all closed.
    pmStore.createWorkItem({
      id: uuidv4(),
      projectId: project.id,
      parentId: phase.id,
      title: "The leaf that finished",
      status: "done",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["`make check` exits 0 from the repository root."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return { store, pmStore, agentStore, project, phase, lead };
  }

  it("writes the check the checkout declares, with the file that declares it", () => {
    const ctx = setup(pythonCheckout(), "demo");
    const gate = ensurePhaseAuditorWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, ctx.phase);
    expect(gate).toBeDefined();
    expect(gate?.acceptanceCriteria).toContain("make check exits 0 (declared by Makefile target check).");
    expect(gate?.acceptanceCriteria.join(" ")).not.toMatch(/\bnpm\b/);
    expect(gate?.description).not.toMatch(/\bnpm run\b/);
  });

  it("states that no check is declared instead of naming a command the checkout cannot run", () => {
    const ctx = setup(bareCheckout(), "bare");
    const gate = ensurePhaseAuditorWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, ctx.phase);
    expect(gate?.acceptanceCriteria?.join(" ")).not.toMatch(/\bnpm\b/);
    expect(gate?.acceptanceCriteria?.join(" ")).toContain("no check is declared by this repository");
    expect(auditCheckCriterion([])).toContain("no check is declared by this repository");
  });

  it("gives the gate to the project's own lead rather than to the platform's auditor", () => {
    const ctx = setup(pythonCheckout(), "external");
    // The platform has an auditor; an external project must not borrow it.
    ctx.agentStore.createSubAgent({
      slug: "kampaku-auditor",
      name: "Kampaku auditor",
      responsibilities: "Audit the platform's own work",
      systemPrompt: "Audit",
      parentId: ctx.agentStore.getKampakuAgent().id,
    });
    const gate = ensurePhaseAuditorWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, ctx.phase);
    expect(gate?.assigneeAgentId).toBe(ctx.lead.id);
  });

  it("prefers the project's own auditor when it has one", () => {
    const ctx = setup(pythonCheckout(), "staffed");
    const auditor = ctx.agentStore.createSubAgent({
      slug: "staffed-auditor",
      name: "Staffed auditor",
      responsibilities: "Audit this project",
      systemPrompt: "Audit",
      parentId: ctx.lead.id,
    });
    const gate = ensurePhaseAuditorWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, ctx.phase);
    expect(gate?.assigneeAgentId).toBe(auditor.id);
  });
});

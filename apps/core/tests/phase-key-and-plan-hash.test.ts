import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/persistence/db.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";

describe("formal phase identity and plan content hash", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("persists phaseKey independently of the display title", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-phase-key-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const pmStore = new PmStore(db);
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: "item-1",
      projectId: "project-1",
      title: "Authentication and login",
      phaseKey: "phase-authentication",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(pmStore.getWorkItem("item-1")?.phaseKey).toBe("phase-authentication");
  });

  it("does not accept approval when the plan content hash changes", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-plan-hash-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    store.recordPlanApproval({ projectSlug: "demo", approvalReference: "plan-1", planFingerprint: "request-1", planContentHash: "content-1", agentId: "lead-1" });

    expect(store.hasPlanApproval("demo", "plan-1", "request-1", "content-1")).toBe(true);
    expect(store.hasPlanApproval("demo", "plan-1", "request-1", "content-2")).toBe(false);
  });
});

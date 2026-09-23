import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/persistence/db.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

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

  /**
   * An approval must correspond to a persisted preview.
   *
   * This test originally recorded an approval for a reference no preview ever produced and asserted it
   * was queryable. That contract was the defect: an approval with a fabricated or mistyped fingerprint
   * can never be applied, because the apply path re-derives both values and compares them — but
   * recording one succeeded silently and reported "persisted", so the operator found out two steps
   * later. The test is strengthened here rather than relaxed: the approval is now performed against a
   * real preview, and the fabrication case is asserted to fail.
   */
  function recordPreview(store: Store, overrides: Partial<{ approvalReference: string; planFingerprint: string; planContentHash: string; projectSlug: string }> = {}) {
    store.recordPlanPreview({
      projectSlug: overrides.projectSlug ?? "demo",
      approvalReference: overrides.approvalReference ?? "plan-1",
      planFingerprint: overrides.planFingerprint ?? "request-1",
      planContentHash: overrides.planContentHash ?? "content-1",
      plan: { title: "Demo", summary: "demo", work_items: [] } as never,
      plannerUsed: "llm",
    });
  }

  it("does not accept approval when the plan content hash changes", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-plan-hash-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    recordPreview(store);
    store.recordPlanApproval({ projectSlug: "demo", approvalReference: "plan-1", planFingerprint: "request-1", planContentHash: "content-1", agentId: "lead-1" });

    expect(store.hasPlanApproval("demo", "plan-1", "request-1", "content-1")).toBe(true);
    expect(store.hasPlanApproval("demo", "plan-1", "request-1", "content-2")).toBe(false);
  });

  it("rejects an approval for a reference no preview ever produced", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-plan-hash-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);

    expect(() =>
      store.recordPlanApproval({ projectSlug: "demo", approvalReference: "never-previewed", planFingerprint: "fabricated", planContentHash: "fabricated", agentId: "lead-1" }),
    ).toThrow(/No previewed plan found/);
    expect(store.hasPlanApproval("demo", "never-previewed", "fabricated", "fabricated")).toBe(false);
  });

  it("rejects an approval whose fingerprint does not match the preview, and names the real one", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-plan-hash-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    recordPreview(store);

    // The exact shape of attempt 9: the agent offered a fingerprint no preview returned.
    expect(() =>
      store.recordPlanApproval({ projectSlug: "demo", approvalReference: "plan-1", planFingerprint: "6d38bb60c2e6cd806648e6c613a87c53a6b8796face6137e9f846244af0460c8", planContentHash: "content-1", agentId: "lead-1" }),
    ).toThrow(/Preview returned "request-1"/);
    expect(store.hasPlanApproval("demo", "plan-1", "request-1", "content-1")).toBe(false);
  });

  it("rejects an approval whose content hash does not match the preview", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-plan-hash-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    recordPreview(store);

    expect(() =>
      store.recordPlanApproval({ projectSlug: "demo", approvalReference: "plan-1", planFingerprint: "request-1", planContentHash: "wrong", agentId: "lead-1" }),
    ).toThrow(/content hash does not match/);
  });

  it("rejects an approval that targets a different project than the preview", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-plan-hash-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    recordPreview(store);

    expect(() =>
      store.recordPlanApproval({ projectSlug: "other-project", approvalReference: "plan-1", planFingerprint: "request-1", planContentHash: "content-1", agentId: "lead-1" }),
    ).toThrow(/Approval project does not match/);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { planAndDelegate } from "../../src/delegator/plan-and-delegate.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

describe("one-shot plan quality (granularity:fine)", () => {
  let dataDir: string;
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("produces a validated fine-grained tree for a multi-feature greenfield intent", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-oneshot-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const result = await planAndDelegate(
      { store, pmStore, agentStore: new AgentStore(db), config },
      {
        intent:
          "Create project Icon Studio with canvas drawing, BYOT upload, SSIM optimiser, REST API, E2E tests, wiki, CI, and a sensei audit",
        projectSlug: "icon-studio",
        granularity: "fine",
      },
    );

    expect(result.granularity).toBe("fine");
    expect(result.planValidation.ok).toBe(true);
    expect(result.planValidation.leafCount).toBeGreaterThanOrEqual(45);
    expect(result.workItemsCreated).toBeGreaterThan(result.planValidation.leafCount);

    const project = store.getProjectBySlug("icon-studio")!;
    expect(project.planGranularity).toBe("fine");
    const items = pmStore.listWorkItemsByProject(project.id);
    const leaves = items.filter((item) => !items.some((other) => other.parentId === item.id));
    expect(leaves.length).toBe(result.planValidation.leafCount);
    expect(leaves.every((leaf) => (leaf.description?.length ?? 0) >= 200)).toBe(true);
    expect(items.every((item) => item.complexity?.granularity === "fine")).toBe(true);
    expect(items.some((item) => item.complexity?.role === "container")).toBe(true);
  });
});

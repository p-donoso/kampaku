import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  findNextExecutableWorkItem,
  previewNextStep,
} from "../../src/application/pm/work-item-order.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * **A container is never offered as the next step, because `play` refuses it.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r23`. The plan's lead cancelled all four leaves of its track in one
 * turn, and from then on the execution read and the act disagreed, every round, for eleven rounds:
 *
 *     GET /api/v1/projects/legacy-ledger/execution
 *       nextStep.workItemId: "ac52e7ec-…"     ← the track container itself, `blockedReason: null`
 *     kampaku projects play legacy-ledger
 *       400 {"error":"Container tasks cannot be executed directly.","code":"VALIDATION"}
 *
 * `previewNextStep` built its candidates with `collectLeavesUnderNode`, which answers `[node.item]` for a container
 * with no **remaining** children — cancelled children are not active items — so the container entered the leaf loop
 * and `canExecuteLeaf` approved it. `executeWorkItem` then refused it, correctly. The surface whose whole job is to
 * say what happens next was naming something that could not happen.
 *
 * The rule: a candidate is a node with no work under it in the plan's own record. A container whose children exist
 * but none is live holds no executable leaf, and the read says so instead of handing back an id `play` will refuse.
 */
describe("what the project's read may offer as the next step (F-160)", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-next-step-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    return { store: new Store(db), pmStore: new PmStore(db), agentStore: new AgentStore(db) };
  }

  function workItem(
    pmStore: PmStore,
    input: { projectId: string; title: string; status?: string; parentId?: string },
  ) {
    const id = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id,
      projectId: input.projectId,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      title: input.title,
      status: input.status ?? "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["`./run-tests.sh` exits 0."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  it("offers a live leaf, as it always did", () => {
    const { store, pmStore } = createStores();
    const project = createProject(store, { slug: "track", name: "Track", status: "planning" });
    const container = workItem(pmStore, { projectId: project.id, title: "Repair track", status: "in_progress" });
    const leaf = workItem(pmStore, { projectId: project.id, title: "Fix parse", parentId: container });

    const preview = previewNextStep(pmStore, project.id);
    expect(preview.workItem?.id).toBe(leaf);
    expect(findNextExecutableWorkItem(pmStore, project.id)?.id).toBe(leaf);
  });

  it("never offers the container whose children were all cancelled", () => {
    const { store, pmStore } = createStores();
    const project = createProject(store, { slug: "track", name: "Track", status: "planning" });
    const container = workItem(pmStore, { projectId: project.id, title: "Repair track", status: "in_progress" });
    workItem(pmStore, { projectId: project.id, title: "Diagnose", status: "cancelled", parentId: container });
    workItem(pmStore, { projectId: project.id, title: "Fix parse", status: "cancelled", parentId: container });

    const preview = previewNextStep(pmStore, project.id);
    // The container itself is not a candidate...
    expect(preview.workItem?.id).not.toBe(container);
    // ...and with nothing executable under it, the read says so rather than naming an id `play` refuses.
    expect(preview.workItem).toBeNull();
    expect(preview.track?.id).toBe(container);
    expect(preview.blockedReason ?? "").toMatch(/no executable|no live (leaf|work)|nothing/i);
    expect(findNextExecutableWorkItem(pmStore, project.id)).toBeNull();
  });

  it("still offers a track that is itself a leaf, because that is the work", () => {
    const { store, pmStore } = createStores();
    const project = createProject(store, { slug: "single", name: "Single", status: "planning" });
    const only = workItem(pmStore, { projectId: project.id, title: "Do the one thing" });

    expect(previewNextStep(pmStore, project.id).workItem?.id).toBe(only);
    expect(findNextExecutableWorkItem(pmStore, project.id)?.id).toBe(only);
  });
});

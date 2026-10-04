import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { Store } from "../../src/persistence/store.js";
import { canExecuteLeaf, collectLeavesInOrder } from "../../src/application/pm/work-item-order.js";
import {
  applyWorkItemStatusRollup,
  derivedWorkItemStatuses,
  rolledWorkItemStatus,
} from "../../src/application/pm/work-item-status-rollup.js";
import {
  explainBlockedWorkItem,
  reportBlockedWorkItemsFromDerivation,
} from "../../src/application/pm/blocked-item-explanation.js";
import { blockWorkItemSubtree, readPausedWorkItems } from "../../src/persistence/escalation-work-item.js";
import { resumePausedWorkItems } from "../../src/persistence/escalation-work-item.js";
import { releaseUnaccountedBlock, BlockReleaseError } from "../../src/application/pm/block-release.js";
import { readLatestClosureRefusal, recordClosureRefusal } from "../../src/application/pm/closure-refusal.js";

/**
 * **BOARD F-089 — a container that reads blocked, refuses everything under it, and cannot be cleared.**
 *
 * The measurement that opened the row, 2026-10-02 on suite 08's third run `s08r10`: the phase container
 * `c04462e4` ("CLI surface and packaging") read `blocked` on every read surface, while **no closure refusal of
 * its own** was on record. The operator ran the discharge the product itself prints —
 * `kampaku projects closure c04462e4…` — and it answered *"is done. No new job was spent"*, while
 * `projects show` printed `[blocked]` for the same id in the same second and the journal held no entry for it.
 * `execute_work_item` on the leaf beneath it was refused with *'Parent "CLI surface and packaging" (c04462e4)
 * is blocked'* — a parent whose stored column said `done`. And the product's documented escape hatch
 * (*triage, split and phase-gate items are releasable under a blocked ancestor*) was falsified by the front
 * office in its own words: *"The gate follows the parent chain, not the item kind."* Net state: 4 jobs, all
 * succeeded, seven items blocked, three of them never releasable.
 *
 * Each case below is a way the fix could be false:
 *
 * 1. **The container's sentence names what it waits on and the command that clears it** — never a closure of
 *    its own settled job, and never *"no closure decision naming the rule is on record"*; and in the report,
 *    where every blocked item has an entry, the child's rule is printed under the child's id, not under the
 *    container's (the row's smallest leg, fixed in `13dee64`).
 * 2. **The discharge reports the read-back, not the decision.** A container whose own job satisfies every rule
 *    still reads whatever its children say, and the discharge says so.
 * 3. **A container's block is clearable by an operator action that changes the state**, with the read-back
 *    shown: decide the child's criteria, and the container and the leaf under it both move.
 * 4. **A freeze is a set.** What an escalation froze is on record, and clearing the escalation thaws exactly
 *    that set — including the descendants that have no record of their own.
 * 5. **An item born inside a blocked container is releasable where its kind says it is**, and a plain leaf in
 *    the same place is not.
 * 6. **A block nothing accounts for names a command that clears it**, and that command refuses every block
 *    that *is* accounted for — so it cannot be used to walk past a gate.
 * 7. **The rollup cannot lift an item's own refusal:** a container blocked by a rule of its own stays blocked
 *    however its children read.
 */
describe("eval 14/24 — a blocked container: read, discharged, released", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  const CONTAINER_ID = "c04462e4-fdf5-46f1-835a-b36cd53e4d29";
  const CHILD_ID = "b7421984-0f30-46f2-9c40-0a14780bade9";
  const LEAF_ID = "447e4e2b-2640-4315-acf4-edba7d8420bf";
  const SLICE_ID = "a2401119-f38c-408a-a0b9-74de8cb91e3f";

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-blocked-container-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    questionStore.setJournalStore(journalStore);
    questionStore.setBlockageStore(blockageStore);
    blockageStore.setJournalStore(journalStore);
    blockageStore.setQuestionStore(questionStore);

    const now = new Date().toISOString();
    const project = store.createProject({
      id: "project-textstats",
      slug: "textstats",
      name: "textstats",
      status: "active",
      repositories: [{ url: `file://${join(dataDir, "checkout")}`, role: "core" }],
      createdAt: now,
      updatedAt: now,
    });
    mkdirSync(join(dataDir, "checkout"), { recursive: true });
    const lead = agentStore.getKampakuAgent();

    const parent = pmStore.createWorkItem({
      id: "8419cdbd-2f80-4140-b53d-14ac16e099fa",
      projectId: project.id,
      title: "textstats CLI slice",
      description: "Phase container.",
      status: "todo",
      priority: 3,
      sortOrder: 1,
      assigneeAgentId: lead.id,
      assignedByAgentId: lead.id,
      acceptanceCriteria: ["Every child of this container is done."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    const container = pmStore.createWorkItem({
      id: CONTAINER_ID,
      projectId: project.id,
      parentId: parent.id,
      title: "CLI surface and packaging",
      description: "Container task: its children ship the CLI surface.",
      status: "in_progress",
      priority: 3,
      sortOrder: 2,
      assigneeAgentId: lead.id,
      assignedByAgentId: lead.id,
      acceptanceCriteria: ["Every child of this container is done."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    const child = pmStore.createWorkItem({
      id: CHILD_ID,
      projectId: project.id,
      parentId: container.id,
      title: "Package surface and console-script entry point declaration",
      description: "Declare [project.scripts].",
      status: "blocked",
      priority: 3,
      sortOrder: 3,
      assigneeAgentId: lead.id,
      assignedByAgentId: lead.id,
      acceptanceCriteria: ["pyproject.toml declares [project.scripts]."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    const leaf = pmStore.createWorkItem({
      id: LEAF_ID,
      projectId: project.id,
      parentId: container.id,
      title: "End-to-end CLI smoke test and README command documentation",
      description: "Smoke test plus README.",
      status: "todo",
      priority: 3,
      sortOrder: 4,
      assigneeAgentId: lead.id,
      assignedByAgentId: lead.id,
      acceptanceCriteria: ["tests/test_cli_e2e.py drives the CLI."],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    return { store, pmStore, agentStore, journalStore, questionStore, blockageStore, project, parent, container, child, leaf, now };
  }

  /** The closure rule the run's own specimen carried on the child: a criterion rejected by the emperor. */
  function refuseClosure(f: ReturnType<typeof fixture>, workItemId: string, title: string, code: string, reason: string) {
    recordClosureRefusal(f.journalStore, {
      code: code as never,
      field: "acceptanceCriteria",
      reason,
      workItemId,
      workItemTitle: title,
      projectId: f.project.id,
      decidedAt: new Date().toISOString(),
      clearWith:
        `kampaku projects closure ${workItemId} --criterion ac-1 --accept --by <who> ` +
        `--notes "<what was checked>"`,
      criterionIds: ["ac-1"],
      missing: ["ac-1"],
    });
  }
  const refuseChildClosure = (f: ReturnType<typeof fixture>) =>
    refuseClosure(
      f,
      CHILD_ID,
      f.child.title,
      "manual_review_rejected",
      "Rejected by the emperor, which is a decision and not missing evidence: ac-1.",
    );

  it("reports a container's entry as the container's: the child's rule is printed under the child's id", async () => {
    const f = fixture();
    refuseChildClosure(f);
    const report = reportBlockedWorkItemsFromDerivation(
      { pmStore: f.pmStore, journalStore: f.journalStore },
      f.project.id,
      f.project.slug,
    );
    const container = report.find((entry) => entry.workItemId === CONTAINER_ID);
    const child = report.find((entry) => entry.workItemId === CHILD_ID);
    expect(container, "the container is in the report at all").toBeDefined();
    expect(container?.refusal, "with no refusal attributed to it").toBeUndefined();
    expect(container?.detail, "it names what it waits on").toContain(CHILD_ID.slice(0, 8));
    expect(container?.detail, "and does not reprint the child's command under its own id").not.toContain(
      `kampaku projects closure ${CHILD_ID}`,
    );
    expect(child?.detail, "the child's own entry carries its rule").toContain(
      `kampaku projects closure ${CHILD_ID}`,
    );
  });

  it("reads a container's block as what it waits on, never as a closure of its own job", () => {
    const f = fixture();
    refuseChildClosure(f);
    const derived = derivedWorkItemStatuses(f.pmStore, f.project.id);
    expect(derived.get(CONTAINER_ID)?.status, "the container reads its children's status").toBe("blocked");
    expect(derived.get(CONTAINER_ID)?.waitingOn?.workItemId, "and names the child that carries it").toBe(CHILD_ID);

    const explanation = explainBlockedWorkItem(
      { pmStore: f.pmStore, journalStore: f.journalStore },
      f.container,
      f.project.slug,
      { derived },
    );
    expect(explanation.refusal, "no refusal is attributed to the container").toBeUndefined();
    expect(explanation.detail, "the child is named as what it waits on").toContain(CHILD_ID.slice(0, 8));
    expect(explanation.detail).toContain("is blocked and has no closure rule of its own");
    expect(explanation.detail).toContain(`kampaku projects closure ${CHILD_ID}`);
    expect(explanation.detail, "never the run's own dead-end sentence").not.toContain(
      "no closure decision naming the rule is on record",
    );
  });

  it("a plain leaf under a container blocked by a child's rule is refused, and names that rule", () => {
    const f = fixture();
    refuseChildClosure(f);
    const items = f.pmStore.listWorkItemsByProject(f.project.id);
    const leaves = collectLeavesInOrder(f.pmStore.buildWorkItemTree(items));
    const check = canExecuteLeaf(
      leaves.find((item) => item.id === LEAF_ID)!,
      leaves,
      items,
      f.pmStore,
      { journalStore: f.journalStore },
    );
    expect(check.ok, "the container's block refuses the leaf").toBe(false);
    expect(check.ok === false && check.reason).toContain(CHILD_ID.slice(0, 8));
    expect(check.ok === false && check.reason).toContain(`kampaku projects closure ${CHILD_ID}`);
  });

  it("a split slice born under the same blocked container is releasable, because that is what its kind is for", () => {
    const f = fixture();
    refuseChildClosure(f);
    f.pmStore.createWorkItem({
      id: SLICE_ID,
      projectId: f.project.id,
      parentId: CHILD_ID,
      title: "Package surface — slice 2",
      description: "A slice the splitter wrote.",
      status: "blocked",
      priority: 3,
      sortOrder: 5,
      assigneeAgentId: f.agentStore.getKampakuAgent().id,
      assignedByAgentId: f.agentStore.getKampakuAgent().id,
      acceptanceCriteria: ["make check exits 0 (declared by Makefile target check)."],
      dependsOn: [],
      routingReason: `split_of:${CHILD_ID}`,
      createdAt: f.now,
      updatedAt: f.now,
    });
    const items = f.pmStore.listWorkItemsByProject(f.project.id);
    const leaves = collectLeavesInOrder(f.pmStore.buildWorkItemTree(items));
    const slice = leaves.find((item) => item.id === SLICE_ID)!;
    const sliceCheck = canExecuteLeaf(slice, leaves, items, f.pmStore, { journalStore: f.journalStore });
    expect(sliceCheck.ok, "a slice releases under the ancestor that is blocked").toBe(true);

    const plain = leaves.find((item) => item.id === LEAF_ID)!;
    const plainCheck = canExecuteLeaf(plain, leaves, items, f.pmStore, { journalStore: f.journalStore });
    expect(plainCheck.ok, "a plain leaf in the same place does not").toBe(false);
  });

  it("thaws exactly what an escalation froze, descendants included", () => {
    const f = fixture();
    const before = f.pmStore.getWorkItem(LEAF_ID)!.status;
    // A blocker is reported by a station, not by the front office: the reporter needs a superior.
    const lead = f.agentStore.createSubAgent({
      slug: "textstats-lead",
      name: "textstats lead",
      parentId: f.agentStore.getKampakuAgent().id,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const blocker = f.blockageStore.report({
      projectId: f.project.id,
      workItemId: CONTAINER_ID,
      reportedByAgentId: lead.id,
      description: "The frozen module drifted and nobody can run git.",
    });
    expect(f.pmStore.getWorkItem(CONTAINER_ID)?.status).toBe("blocked");
    expect(f.pmStore.getWorkItem(LEAF_ID)?.status, "the freeze reaches the descendants").toBe("blocked");

    const frozen = readPausedWorkItems(f.journalStore, "blocker", blocker.id);
    expect(frozen.map((item) => item.workItemId), "the whole set is on record").toEqual(
      expect.arrayContaining([CONTAINER_ID, LEAF_ID]),
    );

    const resolved = f.blockageStore.resolve(blocker.id, "Measured by hand; nothing left to decide.", blocker.recipientAgentId);
    expect(resolved.status).toBe("resolved");
    // What the freeze wrote is gone: the leaf is back to the status it held, and the container's remaining
    // block is the one that was always there — the child's own rule — not an escalation nobody can find.
    expect(f.pmStore.getWorkItem(LEAF_ID)?.status, "the descendant the freeze wrote is thawed").toBe(before);
    expect(f.pmStore.getWorkItem(CHILD_ID)?.status, "and an item that was already blocked is untouched").toBe(
      "blocked",
    );
    const after = derivedWorkItemStatuses(f.pmStore, f.project.id);
    expect(after.get(CONTAINER_ID)?.status).toBe("blocked");
    expect(after.get(CONTAINER_ID)?.waitingOn?.workItemId, "the container waits on the child's rule").toBe(CHILD_ID);
    const explanation = explainBlockedWorkItem(
      { pmStore: f.pmStore, journalStore: f.journalStore, blockageStore: f.blockageStore, questionStore: f.questionStore },
      f.pmStore.getWorkItem(CONTAINER_ID)!,
      f.project.slug,
      { derived: after },
    );
    expect(explanation.escalations, "the cleared escalation is gone from the sentence").toEqual([]);
    expect(explanation.detail).toContain(CHILD_ID.slice(0, 8));
  });

  const ctx = (f: ReturnType<typeof fixture>) => ({
    pmStore: f.pmStore,
    journalStore: f.journalStore,
    blockageStore: f.blockageStore,
    questionStore: f.questionStore,
    agentStore: f.agentStore,
  });

  it("a block nothing accounts for says so and gives the command, which refuses every block that is accounted for", () => {
    const f = fixture();
    f.pmStore.updateWorkItem(LEAF_ID, { status: "blocked" });
    f.pmStore.updateWorkItem(CHILD_ID, { status: "blocked" });

    const blocked = explainBlockedWorkItem(
      { pmStore: f.pmStore, journalStore: f.journalStore },
      f.pmStore.getWorkItem(LEAF_ID)!,
      f.project.slug,
    );
    expect(blocked.detail).toContain("nothing accounts for it");
    expect(blocked.detail).toContain(`kampaku projects release ${LEAF_ID}`);

    // Accounted for by the item's own closure rule: refused, and the refusal is the rule's own sentence —
    // which names the command that clears it.
    refuseChildClosure(f);
    expect(() =>
      releaseUnaccountedBlock(ctx(f), { workItemId: CHILD_ID, by: "pdonoso", notes: "trying to route around the rule" }),
    ).toThrowError(/kampaku projects closure/);

    // Accounted for by an escalation open on the item itself: refused, naming the blocker surface.
    const lead = f.agentStore.createSubAgent({
      slug: "textstats-lead-2",
      name: "textstats lead",
      parentId: f.agentStore.getKampakuAgent().id,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const blocker = f.blockageStore.report({
      projectId: f.project.id,
      workItemId: LEAF_ID,
      reportedByAgentId: lead.id,
      description: "No station in this line can run git.",
    });
    expect(() =>
      releaseUnaccountedBlock(ctx(f), { workItemId: LEAF_ID, by: "pdonoso", notes: "again" }),
    ).toThrowError(/kampaku blockers resolve/);
    f.blockageStore.resolve(blocker.id, "Measured by hand.", blocker.recipientAgentId);

    // An item with nothing behind it, and nothing above it either: released, on record, and read back.
    f.pmStore.createWorkItem({
      id: "02643727-2235-4ce4-99ae-05e634eb2777",
      projectId: f.project.id,
      parentId: "8419cdbd-2f80-4140-b53d-14ac16e099fa",
      title: "Verification and phase gate",
      description: "The container the freeze left holding itself blocked.",
      status: "blocked",
      priority: 3,
      sortOrder: 7,
      assigneeAgentId: f.agentStore.getKampakuAgent().id,
      assignedByAgentId: f.agentStore.getKampakuAgent().id,
      acceptanceCriteria: ["The phase is verified."],
      dependsOn: [],
      createdAt: f.now,
      updatedAt: f.now,
    });
    const orphan = f.pmStore.createWorkItem({
      id: "593b665a-ec04-4265-8f03-6478a637ffd6",
      projectId: f.project.id,
      parentId: "02643727-2235-4ce4-99ae-05e634eb2777",
      title: "Independent end-to-end verification of the CLI slice",
      description: "A leaf the run's freeze left blocked with no record of its own.",
      status: "blocked",
      priority: 3,
      sortOrder: 6,
      assigneeAgentId: f.agentStore.getKampakuAgent().id,
      assignedByAgentId: f.agentStore.getKampakuAgent().id,
      acceptanceCriteria: ["The CLI slice is verified end to end."],
      dependsOn: [],
      createdAt: f.now,
      updatedAt: f.now,
    });
    const result = releaseUnaccountedBlock(ctx(f), {
      workItemId: orphan.id,
      by: "pdonoso",
      notes: "The freeze that wrote this block recorded nothing.",
    });
    expect(result.status, "the read-back is the released status").toBe("todo");
    expect(f.pmStore.getWorkItem(orphan.id)?.status).toBe("todo");
    const released = f.journalStore
      .listAboutWorkItem(orphan.id)
      .find((entry) => entry.kind === "block_released");
    expect(released, "a release is a decision on record").toBeDefined();
    expect(released?.body).toContain("pdonoso");
  });

  it("cannot lift an item's own refusal however its children read", () => {
    const f = fixture();
    const child = f.pmStore.getWorkItem(CHILD_ID)!;
    // The specimen's own shape: the container's block is a rule of **its own** (a criterion the emperor
    // rejected), and every item under it is `done`. Without the guard the derivation rewrites the container
    // from its children and the refusal disappears from the tree while the journal still holds it.
    f.pmStore.createWorkItem({
      id: SLICE_ID,
      projectId: f.project.id,
      parentId: CHILD_ID,
      title: "Package surface — slice 1",
      description: "A slice the splitter wrote.",
      status: "done",
      priority: 3,
      sortOrder: 5,
      assigneeAgentId: f.agentStore.getKampakuAgent().id,
      assignedByAgentId: f.agentStore.getKampakuAgent().id,
      acceptanceCriteria: ["make check exits 0 (declared by Makefile target check)."],
      dependsOn: [],
      routingReason: `split_of:${CHILD_ID}`,
      createdAt: f.now,
      updatedAt: f.now,
    });
    refuseChildClosure(f);
    expect(readLatestClosureRefusal(f.journalStore, CHILD_ID), "the rule is on record").toBeDefined();
    const nodes = applyWorkItemStatusRollup(
      f.pmStore.buildWorkItemTree(f.pmStore.listWorkItemsByProject(f.project.id)),
    );
    const flat = new Map<string, string>();
    const walk = (list: typeof nodes) => {
      for (const node of list) {
        flat.set(node.item.id, node.item.status);
        walk(node.children as typeof nodes);
      }
    };
    walk(nodes);
    expect(
      flat.get(CHILD_ID),
      "an item whose own rule refused it keeps that block however its children read",
    ).toBe("blocked");
    expect(flat.get(CONTAINER_ID), "and the container above it reads blocked with it").toBe("blocked");
    expect(rolledWorkItemStatus("blocked", "done")).toBe("blocked");
    expect(rolledWorkItemStatus("in_progress", "done")).toBe("done");
    expect(existsSync(join(dataDir, "kampaku.db"))).toBe(true);
  });
});

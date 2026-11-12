import { describe, expect, it } from "vitest";
import { applyWorkItemStatusRollup } from "../../src/application/pm/work-item-status-rollup.js";
import type { WorkItemTreeNode } from "../../src/persistence/pm-store.js";

/**
 * **A container's stored block is not its own, so it cannot outlive the reason it was written.**
 *
 * Measured live on suite 19 run `s19r18`. `LL-P1 Baseline reconnaissance` was written `blocked` twice by
 * `blockWorkItemSubtree` — once when a leaf's job failed, once when a blocker was raised on a child — and cleared
 * neither time: the blocker was resolved, the triage child closed, both leaves closed, and the container still read
 * `blocked with nothing accounting for it`. Every `play` then answered *"Parent LL-P1 is blocked"*
 * (`canExecuteLeaf`), so the line could not advance without an operator `release` per cycle — once per phase, for
 * a phase whose own children were all fine.
 *
 * `rolledContainerStatus` already states the rule the reporting surfaces use: *"The status of an item that has
 * children: its children's, and never a block of its own."* The **acting** derivation — `applyWorkItemStatusRollup`,
 * which `derivedWorkItemStatuses` feeds to the release gate — was still calling `rolledWorkItemStatus`, which keeps
 * the stored `blocked` for every item. For a leaf that is right (its own closure refusal is its block); for a
 * container it is the stall.
 */
describe("a container whose children are fine (suite 19 / s19r18, BOARD F-108)", () => {
  const now = "2026-11-11T00:00:00.000Z";
  function node(
    id: string,
    status: string,
    children: WorkItemTreeNode[] = [],
  ): WorkItemTreeNode {
    return {
      item: {
        id,
        projectId: "p1",
        title: id,
        status,
        priority: 1,
        sortOrder: 1,
        acceptanceCriteria: [],
        dependsOn: [],
        createdAt: now,
        updatedAt: now,
      },
      children,
    } as unknown as WorkItemTreeNode;
  }

  it("reads its children's status, not the block it was written with", () => {
    const tree = [node("container", "blocked", [node("leaf-a", "done"), node("leaf-b", "todo")])];
    const rolled = applyWorkItemStatusRollup(tree);
    expect(rolled[0].item.status).toBe("in_progress");
  });

  it("reads done when its children are done, even though it was written blocked", () => {
    const tree = [node("container", "blocked", [node("leaf-a", "done"), node("leaf-b", "done")])];
    expect(applyWorkItemStatusRollup(tree)[0].item.status).toBe("done");
  });

  it("is still blocked while a child is blocked", () => {
    const tree = [node("container", "in_progress", [node("leaf-a", "done"), node("leaf-b", "blocked")])];
    expect(applyWorkItemStatusRollup(tree)[0].item.status).toBe("blocked");
  });

  it("keeps a leaf's own block, which is its own refusal and not a rollup", () => {
    const tree = [node("leaf-a", "blocked")];
    expect(applyWorkItemStatusRollup(tree)[0].item.status, "a leaf's block is a rule on record").toBe("blocked");
  });

  it("keeps a container that was cancelled, which is a decision about the container itself", () => {
    const tree = [node("container", "cancelled", [node("leaf-a", "done")])];
    expect(applyWorkItemStatusRollup(tree)[0].item.status).toBe("cancelled");
  });
});

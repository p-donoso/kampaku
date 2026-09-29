import { describe, expect, it } from "vitest";
import {
  dependsOnSatisfied,
  resolveDependencyReferences,
} from "../../src/application/pm/work-item-order.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

/**
 * The lock on **BOARD F-069**: a work item's dependency graph is keyed to ids, not to titles.
 *
 * Measured 2026-09-29 in suite 07 run 18's store: W2's `dependsOn_json` read
 * `["W1 — Add word-statistics aggregation API with unit tests"]` — a **title**, resolved by comparing strings
 * against the set of `done` titles. So editing one leaf's title silently detached everything downstream of it,
 * and two leaves that happened to share a title made the edge ambiguous — while the suite's own oracle asks for
 * *"multiple steps with **stable ids**"*. The row is not about the plan's shape: it is about an edge being
 * keyed to the one property of a work item that is meant to change.
 */

function item(overrides: Partial<WorkItemRecord> & { id: string; title: string }): WorkItemRecord {
  return {
    projectId: "p1",
    parentId: undefined,
    description: "",
    status: "todo",
    priority: 0,
    sortOrder: 0,
    assigneeAgentId: undefined,
    assignedByAgentId: undefined,
    routingReason: undefined,
    acceptanceCriteria: [],
    dependsOn: [],
    complexity: undefined,
    phaseKey: undefined,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  } as WorkItemRecord;
}

describe("dependsOnSatisfied — keyed by id (F-069)", () => {
  it("is satisfied by the dependency's id, and does not care that its title changed", () => {
    // The defect, exactly: the predecessor is done and its title has since been edited. Keyed by title this
    // leaf stalls forever with nothing on the board to explain why.
    const done = item({ id: "wi-01", title: "Add the aggregation API (retitled later)", status: "done" });
    const leaf = item({ id: "wi-02", title: "Render the report", dependsOn: ["wi-01"] });

    expect(dependsOnSatisfied(leaf, [done, leaf])).toBe(true);
  });

  it("is not satisfied by a different, unfinished item that carries the id-shaped title", () => {
    // The other direction, and the reason ids are the key: a title is a string anyone may reuse, so an edge
    // that matched on text could be satisfied by a leaf that is not the one it names.
    const impostor = item({ id: "wi-99", title: "wi-01", status: "todo" });
    const leaf = item({ id: "wi-02", title: "Render the report", dependsOn: ["wi-01"] });

    expect(dependsOnSatisfied(leaf, [impostor, leaf])).toBe(false);
  });

  it("still honours a title, so records written before this change do not stall", () => {
    // The fallback is deliberate and it is the difference between a migration and an outage: every existing
    // store holds titles, and a dependency that cannot be satisfied is a stall, which is worse than a
    // preference. What changed is which of the two a new plan writes.
    const done = item({ id: "wi-01", title: "Add the aggregation API", status: "done" });
    const leaf = item({ id: "wi-02", title: "Render the report", dependsOn: ["Add the aggregation API"] });

    expect(dependsOnSatisfied(leaf, [done, leaf])).toBe(true);
  });

  it("treats a dependency nothing defines as unsatisfied rather than as absent", () => {
    const leaf = item({ id: "wi-02", title: "Render the report", dependsOn: ["wi-01"] });
    expect(dependsOnSatisfied(leaf, [leaf])).toBe(false);
  });
});

describe("resolveDependencyReferences", () => {
  const assigned = new Map([["w1 — add api", "11111111-1111-4111-8111-111111111111"]]);

  it("replaces a title the plan has already written with the id it was given", () => {
    // The planner authors titles — that is what a model can name while writing a plan — and the loop that
    // creates the items is the only place that knows which id each one got.
    expect(resolveDependencyReferences(["W1 — Add API"], assigned)).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("matches case-insensitively, because a plan's back-reference is typed by hand by a model", () => {
    expect(resolveDependencyReferences(["w1 — ADD API"], assigned)).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("keeps a forward reference verbatim instead of dropping the edge", () => {
    // `resolveDependencyReferences` is called as each step is created, so a step may name one that does not
    // exist yet. Dropping it would turn a real dependency into no dependency at all — the leaf would run early
    // and the board would say nothing was wrong.
    expect(resolveDependencyReferences(["W5 — Document the CLI"], assigned)).toEqual([
      "W5 — Document the CLI",
    ]);
  });

  it("does not turn an empty reference into a match on the empty string", () => {
    const withEmpty = new Map([...assigned, ["", "should-not-be-used"]]);
    expect(resolveDependencyReferences(["  "], withEmpty)).toEqual([""]);
  });
});

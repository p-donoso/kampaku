import { describe, expect, it } from "vitest";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";
import { dependsOnSatisfied } from "../../src/application/pm/work-item-order.js";

/**
 * **A dependency that is cancelled is settled, so a phase gate is not blocked by the triage leaf it outlived.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`. The baseline leaf raised a blocker, the platform created a triage
 * leaf for it, and the blocker was cleared, which cancels the triage leaf. The phase then finished and created its
 * audit gate — listing **every** child in `dependsOn`, the cancelled triage leaf included. `dependsOnSatisfied`
 * counted only `done`, so the gate could never open and `kampaku projects play` answered forever:
 *
 *     Phase siblings must be completed before the auditor gate.
 *
 * The phase had done its work and could never be audited, and every leaf behind it was refused. It is the same
 * sentence the rollup already applies (BOARD F-142): a child that will not be done because it is not needed is not
 * outstanding work.
 */
function item(over: Partial<WorkItemRecord> & { id: string; title: string; status: WorkItemRecord["status"] }) {
  return { dependsOn: [], ...over } as WorkItemRecord;
}

describe("a dependency is settled when it is done or cancelled (suite 19 / s19r22)", () => {
  it("does not hold a gate behind a cancelled sibling, which is the measured stall", () => {
    const items = [
      item({ id: "leaf", title: "Reproduce both check failures", status: "done" }),
      item({ id: "triage", title: "Triage blocker — Reproduce both check failures", status: "cancelled" }),
    ];
    const gate = item({
      id: "gate",
      title: "Audit phase — Phase 1",
      status: "todo",
      dependsOn: ["Reproduce both check failures", "Triage blocker — Reproduce both check failures"],
    });
    expect(dependsOnSatisfied(gate, items)).toBe(true);
  });

  it("still refuses while a dependency is real work still to do", () => {
    const items = [
      item({ id: "leaf", title: "Reproduce both check failures", status: "done" }),
      item({ id: "repair", title: "Return 0 from ledger.totals.total", status: "todo" }),
    ];
    const gate = item({
      id: "gate",
      title: "Audit phase — Phase 1",
      status: "todo",
      dependsOn: ["Reproduce both check failures", "Return 0 from ledger.totals.total"],
    });
    expect(dependsOnSatisfied(gate, items)).toBe(false);
  });

  it("still refuses on a dependency that is blocked, in progress or unknown", () => {
    for (const status of ["blocked", "in_progress", "queued"] as const) {
      const items = [item({ id: "dep", title: "A dependency", status })];
      const gate = item({ id: "gate", title: "A gate", status: "todo", dependsOn: ["A dependency"] });
      expect(dependsOnSatisfied(gate, items), status).toBe(false);
    }
    const unknown = item({ id: "gate", title: "A gate", status: "todo", dependsOn: ["a title nobody holds"] });
    expect(dependsOnSatisfied(unknown, [])).toBe(false);
  });

  it("resolves an edge by id as well as by title", () => {
    const items = [item({ id: "dep-id", title: "Some leaf renamed since", status: "cancelled" })];
    const gate = item({ id: "gate", title: "A gate", status: "todo", dependsOn: ["dep-id"] });
    expect(dependsOnSatisfied(gate, items)).toBe(true);
  });
});

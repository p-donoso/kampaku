import { describe, expect, it } from "vitest";
import { assignFormalPhaseKeys } from "../../src/delegator/plan-and-delegate.js";
import { validatePlan } from "../../src/delegator/plan-validation.js";
import type { PlannedWorkItem } from "../../src/delegator/types.js";

/**
 * **A `parent_ref` that names no node in its own plan is a finding, not a stack overflow.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r23`: the front office repaired a plan, applied it, and from then on
 * every `submit_intent` for that project answered `{"ok": false, "error": "Maximum call stack size exceeded"}` —
 * six attempts, three different intents, before and after flipping the project to active. Nothing could be added
 * to the project again, so the run had no way to dispatch work.
 *
 * The cause is one line: `assignFormalPhaseKeys` resolves a node's parent by title and falls back to the node
 * **itself** when the title is not in the plan, so the resolver calls itself until the stack ends. The planner can
 * write that reference the moment a plan is repaired by hand (this run's lead cancelled four leaves and wrote one
 * new leaf), and it is BOARD F-103's exact reproduction, measured twice, now on a second surface.
 *
 * The rule this locks: a node whose parent it cannot resolve stands as its own phase root. The reference is still
 * wrong, and `validatePlan` says so by name (`dangling_parent_ref`) so the plan can be repaired instead of being
 * applied with a silent reshuffle.
 */
describe("phase keys over a plan whose parent_ref resolves to nothing (F-103)", () => {
  const dangling: PlannedWorkItem[] = [
    {
      title: "Repair track: get the checkout green",
      description: "Container.",
      priority: 0,
      acceptance_criteria: ["`./run-tests.sh` exits 0."],
    },
    {
      title: "Apply the two-line minimal fix",
      description: "Leaf whose parent is named under a title the plan no longer carries.",
      priority: 0,
      parent_ref: "Phase that was cancelled and is not in this plan",
      acceptance_criteria: ["`./run-tests.sh` exits 0."],
    },
  ];

  it("returns a phase key instead of recursing until the stack ends", () => {
    // Before the fix this threw `RangeError: Maximum call stack size exceeded`.
    const keyed = assignFormalPhaseKeys(dangling);
    expect(keyed).toHaveLength(2);
    for (const item of keyed) expect(typeof item.phase_key).toBe("string");
  });

  it("stands the node as its own phase root rather than adopting a stranger's key", () => {
    const keyed = assignFormalPhaseKeys(dangling);
    expect(keyed[1].phase_key).toBe("phase-apply-the-two-line-minimal-fix");
    // The container keeps its own key and is not dragged under the dangling child.
    expect(keyed[0].phase_key).toBe("phase-repair-track-get-the-checkout-green");
  });

  it("still inherits the parent's key when the reference does resolve", () => {
    const resolvable: PlannedWorkItem[] = [
      {
        title: "Repair track: get the checkout green",
        description: "Container.",
        priority: 0,
        acceptance_criteria: ["`./run-tests.sh` exits 0."],
      },
      {
        title: "Apply the two-line minimal fix",
        description: "Leaf under the container it names.",
        priority: 0,
        parent_ref: "Repair track: get the checkout green",
        acceptance_criteria: ["`./run-tests.sh` exits 0."],
      },
    ];
    const keyed = assignFormalPhaseKeys(resolvable);
    expect(keyed[1].phase_key).toBe("phase-repair-track-get-the-checkout-green");
  });

  it("survives two nodes that point at each other, and at themselves", () => {
    const cyclic: PlannedWorkItem[] = [
      {
        title: "A",
        description: "Points at B.",
        priority: 0,
        parent_ref: "B",
        acceptance_criteria: ["`make check` exits 0."],
      },
      {
        title: "B",
        description: "Points at A.",
        priority: 0,
        parent_ref: "A",
        acceptance_criteria: ["`make check` exits 0."],
      },
      {
        title: "C",
        description: "Points at itself.",
        priority: 0,
        parent_ref: "C",
        acceptance_criteria: ["`make check` exits 0."],
      },
    ];
    const keyed = assignFormalPhaseKeys(cyclic);
    // Every node gets a key and the answer is stable; which root a cycle elects is arbitrary, and the point of the
    // lock is that the call terminates and says the same thing twice.
    for (const item of keyed) expect(typeof item.phase_key).toBe("string");
    expect(keyed[2].phase_key).toBe("phase-c");
    expect(assignFormalPhaseKeys(cyclic).map((item) => item.phase_key)).toEqual(
      keyed.map((item) => item.phase_key),
    );
  });
});

describe("validatePlan over a plan whose parent_ref resolves to nothing (F-103)", () => {
  const plan = (parentRef: string | undefined) => ({
    work_items: [
      {
        title: "Repair track: get the checkout green",
        description: "Container.".padEnd(220, " "),
        priority: 0,
        acceptance_criteria: ["`./run-tests.sh` exits 0."],
      },
      {
        title: "Apply the two-line minimal fix",
        description: "Leaf whose parent the plan must name.".padEnd(220, " "),
        priority: 0,
        ...(parentRef ? { parent_ref: parentRef } : {}),
        acceptance_criteria: ["`./run-tests.sh` exits 0."],
      },
    ],
  });

  it("names the node and the reference instead of applying the plan with a guess", () => {
    const result = validatePlan(plan("Phase that was cancelled and is not in this plan"), {
      intent: "Bring the checkout to a working state.",
      granularity: "standard",
      mode: "incremental",
    });
    const issue = result.issues.find((entry) => entry.code === "dangling_parent_ref");
    expect(issue).toBeDefined();
    expect(issue?.title).toBe("Apply the two-line minimal fix");
    expect(issue?.message).toContain("Phase that was cancelled and is not in this plan");
  });

  it("stays silent when the reference names a node the plan carries", () => {
    const result = validatePlan(plan("Repair track: get the checkout green"), {
      intent: "Bring the checkout to a working state.",
      granularity: "standard",
      mode: "incremental",
    });
    expect(result.issues.some((entry) => entry.code === "dangling_parent_ref")).toBe(false);
  });
});

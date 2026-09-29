import { describe, expect, it } from "vitest";
import {
  declaredRequirementIds,
  referencedRequirementIds,
  validatePlan,
} from "../../src/delegator/plan-validation.js";
import type { PlannedProject, PlannedWorkItem } from "../../src/delegator/types.js";

/**
 * The lock on **BOARD F-071**: a plan may not cite a requirement identifier that nothing in it defines.
 *
 * Measured 2026-09-29 by suite 07 run 19. The phase container's third acceptance criterion read *"Requirement
 * statements R1-R5 are each covered by at least one leaf acceptance criterion, with no requirement left
 * unowned"*, and `R1`–`R5` appeared **nowhere else in the project** — not in a document, not in a work item,
 * not in the journal. The criterion was therefore neither satisfiable nor falsifiable, and the front office
 * raised it as a `required` question without being asked to. The register that would have defined them did
 * exist, in the lead's out-of-scope list, and could not be published because every wiki write answered
 * `Wiki store is not available`.
 *
 * This is the other half of that row: the write path is fixed separately (the chat context now carries the
 * store), and this is the read path — a plan that cites something must be made to define it, or to stop
 * citing it, **before** it becomes durable.
 */

const LONG_DESCRIPTION =
  "Implement the aggregation in src/textstats/summary.py so callers can obtain total, unique and top-N counts. " +
  "The module stays stdlib-only and the whole file is exercised by tests/test_summary.py, which asserts exact " +
  "values rather than shapes so a regression in the tie-break order fails the suite rather than passing it.";

/**
 * A two-item plan: one phase container carrying the criteria under test, one leaf under it.
 *
 * Written as a literal rather than through `parsePlannedProject` so the lock is on `validatePlan`'s rule and
 * not on the plan schema. The shapes are `PlannedProject`'s, asserted by the type.
 */
function planWith(criteria: string[], requirementIds: string[] = []): PlannedProject {
  const workItems: PlannedWorkItem[] = [
    {
      title: "Phase 1",
      description: LONG_DESCRIPTION,
      acceptance_criteria: criteria,
      priority: 0,
    },
    {
      title: "Add the aggregation",
      parent_ref: "Phase 1",
      description: LONG_DESCRIPTION,
      acceptance_criteria: [
        "A file-exists check confirms src/textstats/summary.py exists; make check exits 0.",
      ],
      priority: 0,
    },
  ];
  return {
    project: { slug: "textstats", name: "textstats", description: "Word statistics." },
    work_items: workItems,
    vertical_slices: [
      {
        id: "slice-1",
        title: "A caller can count words",
        outcome: "PYTHONPATH=src python3 -m textstats counts words and exits 0.",
        requirement_ids: requirementIds,
        work_item_ids: ["Add the aggregation"],
        evidence_kinds: ["command_output"],
      },
    ],
  } as unknown as PlannedProject;
}

describe("referencedRequirementIds", () => {
  it("expands a range, in both directions and with either dash", () => {
    expect(referencedRequirementIds("R1-R3 are covered")).toEqual(["r1", "r2", "r3"]);
    expect(referencedRequirementIds("R3–R1 are covered")).toEqual(["r1", "r2", "r3"]);
  });

  it("reads a bare identifier", () => {
    expect(referencedRequirementIds("see R12 for the contract")).toEqual(["r12"]);
  });

  it("does not match inside another word", () => {
    // The reason the boundaries exist: a rule that fires on `JSON1` would send the repair pass chasing text
    // that says nothing about requirements.
    expect(referencedRequirementIds("ORDER1 and JSON1 and R2D2")).toEqual([]);
  });

  it("does not expand a range so wide it stops being a requirement list", () => {
    expect(referencedRequirementIds("R1-R999")).toEqual(["r1", "r999"]);
  });

  it("reports each identifier once, however often it is named", () => {
    expect(referencedRequirementIds("R2, R2, R2")).toEqual(["r2"]);
  });
});

describe("declaredRequirementIds", () => {
  it("reads the plan's own declaration and nothing else", () => {
    expect([...declaredRequirementIds(planWith([], ["R1", "R2"]))].sort()).toEqual(["r1", "r2"]);
    expect([...declaredRequirementIds(planWith([]))]).toEqual([]);
  });
});

describe("validatePlan — an undefined requirement reference (F-071)", () => {
  it("flags the criterion run 19 produced, naming the identifiers and the item", () => {
    // The measured sentence, verbatim from the run's plan.
    const plan = planWith([
      "All seven child leaves are complete and were only marked complete against observed make check exit 0.",
      "Requirement statements R1-R5 are each covered by at least one leaf acceptance criterion, with no requirement left unowned.",
    ]);

    const result = validatePlan(plan, { intent: "Plan the first vertical slice.", granularity: "standard" });

    const issue = result.issues.find((entry) => entry.code === "undefined_requirement_reference");
    expect(issue, "the criterion cites five requirements the plan never defines").toBeDefined();
    expect(issue?.title).toBe("Phase 1");
    for (const id of ["R1", "R2", "R3", "R4", "R5"]) {
      expect(issue?.message).toContain(id);
    }
    // And it says what to do about it, because the repair pass is a model reading this text.
    expect(issue?.message).toMatch(/declare them in the plan's vertical slices/i);
  });

  it("stays silent when the plan declares the identifiers it cites", () => {
    // The other branch, and the one that keeps this rule from being noise: a plan that carries its requirement
    // statements has done exactly what the row asks for.
    const plan = planWith(
      ["Requirement statements R1-R3 are each covered by at least one leaf."],
      ["R1", "R2", "R3"],
    );

    const result = validatePlan(plan, { intent: "Plan the first vertical slice.", granularity: "standard" });

    expect(result.issues.some((entry) => entry.code === "undefined_requirement_reference")).toBe(false);
  });

  it("flags only the identifiers that are missing, not the whole citation", () => {
    const plan = planWith(
      ["R1 and R2 are covered, and R7 is not."],
      ["R1", "R2"],
    );

    const result = validatePlan(plan, { intent: "Plan the first vertical slice.", granularity: "standard" });

    const issue = result.issues.find((entry) => entry.code === "undefined_requirement_reference");
    expect(issue?.message).toContain("R7");
    expect(issue?.message).not.toContain("R1,");
    expect(issue?.message).toMatch(/requirement identifier \\bR7\\b|cites requirement identifier R7/);
  });

  it("leaves a plan that cites nothing alone", () => {
    const plan = planWith([
      "A file-exists check confirms src/textstats/summary.py exists; make check exits 0 with tests/test_summary.py collected.",
    ]);

    const result = validatePlan(plan, { intent: "Plan the first vertical slice.", granularity: "standard" });

    expect(result.issues.some((entry) => entry.code === "undefined_requirement_reference")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { complexityBudget, countIntentFeatures, resolvePlanGranularity } from "../../src/delegator/plan-granularity.js";
import {
  dropInvalidLeaves,
  isOverweightPlannedLeaf,
  validatePlan,
} from "../../src/delegator/plan-validation.js";
import { expandPhaseLeavesStub, findNodesNeedingExpansion } from "../../src/delegator/expand-phase-leaves.js";
import type { PlannedProject } from "../../src/delegator/types.js";

describe("plan validation", () => {
  it("counts major features from intent", () => {
    expect(
      countIntentFeatures("canvas editor, BYOT upload, SSIM loop, wiki, CI, and audit"),
    ).toBeGreaterThanOrEqual(5);
  });

  it("defaults to standard, and `fine` is an escalation a caller asks for", () => {
    // The default used to be `fine` for any new project, which priced the plan before it knew the request:
    // suite 07's run 17 asked for one vertical slice and the `fine` quota answered with 29,481 output tokens
    // in one response and 231,464 in five minutes. A quota is a ceiling, not a target — see
    // `resolvePlanGranularity`.
    expect(resolvePlanGranularity({})).toBe("standard");
    expect(resolvePlanGranularity({ existingProject: true })).toBe("standard");
    expect(resolvePlanGranularity({ granularity: "standard" })).toBe("standard");
    // Escalation still works, and is how a whole-program plan asks for the detail.
    expect(resolvePlanGranularity({ granularity: "fine" })).toBe("fine");
  });

  it("keeps standard plans compact enough to avoid filler tasks", () => {
    const budget = complexityBudget("Build a learning UI, lesson, speech activity, and progress model", "standard", 4);
    expect(budget.minLeavesPerPhase).toBe(1);
    expect(budget.minTotalLeaves).toBeLessThanOrEqual(20);
  });

  it("rejects thin leaves and missing verifiable AC", () => {
    const plan: PlannedProject = {
      work_items: [
        { title: "Phase 1", description: "Container", priority: 0 },
        {
          title: "Do everything",
          description: "Too short",
          priority: 1,
          parent_ref: "Phase 1",
          acceptance_criteria: ["looks good"],
        },
      ],
    };
    const result = validatePlan(plan, {
      intent: "Build canvas, API, tests, wiki, CI",
      granularity: "fine",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "thin_description")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "missing_verifiable_ac")).toBe(true);
    expect(findNodesNeedingExpansion(plan, "fine", "greenfield", "Build canvas, API, tests, wiki, CI").map((item) => item.title)).toContain("Do everything");
  });

  it("accepts an acceptance criterion that names a produced technical artifact", () => {
    // The verifiable-criterion check must not require one ecosystem's test command: a criterion that
    // names a produced artifact of the build is as verifiable as a passing test run.
    const plan: PlannedProject = {
      work_items: [
        { title: "Ingest phase", description: "Container", priority: 0 },
        {
          title: "Emit the daily metrics artifact",
          description:
            "Extend the existing pipeline so the daily job renders the metrics artifact the downstream consumer reads, keeping the current schema documented beside the code and a reviewer checklist linked to the project requirements so another person can inspect the result independently.",
          priority: 1,
          parent_ref: "Ingest phase",
          acceptance_criteria: [
            "artifact exists at dist/metrics.json and is produced by the pipeline run",
          ],
        },
      ],
    };
    expect(
      validatePlan(plan, {
        intent: "Extend the metrics pipeline",
        granularity: "standard",
        mode: "incremental",
      }).ok,
    ).toBe(true);
  });

  it("rejects leaves that pack too many files", () => {
    const description =
      "Implement a.tsx, b.ts, c.ts, and d.ts in the linked repository with full AGENTS.md context, wiring, and checks before closure of this leaf.".repeat(2);
    const plan: PlannedProject = {
      work_items: [
        { title: "Phase 1", description: "Container", priority: 0 },
        {
          title: "Pack files",
          description,
          priority: 1,
          parent_ref: "Phase 1",
          acceptance_criteria: ["npm test succeeds"],
        },
      ],
    };
    const result = validatePlan(plan, { intent: "tiny", granularity: "standard", mode: "incremental" });
    expect(result.issues.some((issue) => issue.code === "overweight_files")).toBe(true);
  });

  it("stub expansion meets the fine per-phase budget", () => {
    const phase = { title: "REST API", description: "Phase", priority: 0 };
    const extra = expandPhaseLeavesStub(phase, "Build a REST API with tests", "fine", [phase]);
    expect(extra.length).toBeGreaterThanOrEqual(15);
    const plan: PlannedProject = { work_items: [phase, ...extra] };
    const result = validatePlan(plan, {
      intent: "Build a REST API with tests",
      granularity: "fine",
      mode: "incremental",
    });
    expect(result.ok).toBe(true);
  });

  it("drops thin leaves but keeps overweight leaves for recursive split", () => {
    const description =
      "Implement a.tsx, b.ts, c.ts, and d.ts in the linked repository with full AGENTS.md context, wiring, and checks before closure of this leaf.".repeat(
        2,
      );
    const plan: PlannedProject = {
      work_items: [
        { title: "Phase 1", description: "Container", priority: 0 },
        { title: "Thin", description: "nope", priority: 1, parent_ref: "Phase 1" },
        {
          title: "Fat",
          description,
          priority: 2,
          parent_ref: "Phase 1",
          acceptance_criteria: ["npm test succeeds"],
        },
      ],
    };
    const cleaned = dropInvalidLeaves(plan);
    expect(cleaned.work_items.map((item) => item.title)).toEqual(["Phase 1", "Fat"]);
  });

  it("recursively expands until the complexity budget holds", async () => {
    const { expandUntilBudget } = await import("../../src/delegator/expand-phase-leaves.js");
    const plan: PlannedProject = {
      work_items: [
        { title: "Phase 1", description: "Container", priority: 0 },
        {
          title: "Nested module",
          description: "Nested container that still needs leaves under the complexity budget.",
          priority: 1,
          parent_ref: "Phase 1",
        },
      ],
    };
    const expanded = await expandUntilBudget({
      plan,
      intent: "Build a REST API with tests and docs",
      granularity: "fine",
      mode: "greenfield",
    });
    const result = validatePlan(expanded, {
      intent: "Build a REST API with tests and docs",
      granularity: "fine",
      mode: "greenfield",
    });
    expect(result.ok).toBe(true);
    expect(result.leafCount).toBeGreaterThanOrEqual(15);
  });

  it("recursively splits overweight leaves into nested micro-tasks", async () => {
    const { expandUntilBudget } = await import("../../src/delegator/expand-phase-leaves.js");
    const description =
      "Implement src/a.tsx, src/b.ts, src/c.ts, and src/d.ts in the linked repository with full context, wiring, and checks before closure of this leaf.".repeat(
        2,
      );
    const plan: PlannedProject = {
      work_items: [
        { title: "Phase 1", description: "Container", priority: 0 },
        {
          title: "Pack files",
          description,
          priority: 1,
          parent_ref: "Phase 1",
          acceptance_criteria: ["npm test succeeds"],
        },
      ],
    };
    const expanded = await expandUntilBudget({
      plan,
      intent: "tiny feature",
      granularity: "standard",
      mode: "incremental",
    });
    const leaves = expanded.work_items.filter(
      (item) => !expanded.work_items.some((other) => other.parent_ref === item.title),
    );
    expect(leaves.every((leaf) => !isOverweightPlannedLeaf(leaf))).toBe(true);
    expect(expanded.work_items.some((item) => item.parent_ref === "Pack files")).toBe(true);
  });

  it("sets a higher total leaf floor for fine greenfield intents", () => {
    const budget = complexityBudget(
      "canvas, upload, optimiser, tests, wiki, CI, and audit",
      "fine",
      5,
    );
    expect(budget.minLeavesPerPhase).toBe(15);
    expect(budget.minTotalLeaves).toBeGreaterThanOrEqual(75);
  });
});

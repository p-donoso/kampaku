import { isContainerPlannedItem, type PlannedProject, type PlannedWorkItem } from "./types.js";
import {
  complexityBudget,
  type PlanGranularity,
} from "./plan-granularity.js";
import { validateVerticalSlicePlan } from "./vertical-slice.js";

export const VERIFIABLE_AC_PATTERN =
  /\bnpm (test|run)\b|\b(file|document|artifact|dataset|image|audio|video) exists\b|\bpytest\b|\bcargo test\b|\bgo test\b|\b(run|execute|invoke)\b.{0,80}\b(check|command|script|test)\b|\b(endpoint|route|URL|API)\b.{0,100}\b(return|respond|status|behave|reachable)\b|\b(UI|screen|page|form|workflow)\b.{0,100}\b(open|render|display|navigate|submit|complete|work)\b|\b(published|exported|recorded|transcribed|plays back|persists|saved)\b|\.(ts|tsx|js|mjs|py|go|rs|md|yaml|yml|json|csv|pdf|png|jpg|jpeg|wav|mp3|mp4)\b/i;

const FILE_PATH_PATTERN =
  /(?:[\w@./-]+\/)*[\w.-]+\.(?:tsx|ts|mjs|cjs|jsx|js|py|go|rs|md|json|ya?ml|css|svg)/gi;

const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  { pattern: /\bnpm run test:e2e\b/i, script: "test:e2e" },
  { pattern: /\bnpm run build\b/i, script: "build" },
  { pattern: /\bnpm run typecheck\b/i, script: "typecheck" },
  { pattern: /\bnpm run test(?!:)/i, script: "test" },
  { pattern: /\bnpm test\b/i, script: "test" },
];

export interface PlanValidationIssue {
  code:
    | "too_few_leaves"
    | "thin_description"
    | "missing_verifiable_ac"
    | "overweight_files"
    | "overweight_scripts"
    | "too_few_leaves_in_phase"
    | "invalid_vertical_slice"
    | "undefined_requirement_reference";
  message: string;
  title?: string;
}

/**
 * A requirement identifier, as a plan cites it: `R1`, `R12`, and the range forms `R1-R5` / `R1–R5`.
 *
 * The boundary classes are load-bearing. Without them `R1` matches inside `JSON1` and `ORDER1`, and a rule
 * that fires on unrelated text is a rule the repair pass will be sent chasing for no reason.
 */
const REQUIREMENT_ID_PATTERN = /(?<![A-Za-z0-9_])(R\d{1,3})(?![A-Za-z0-9_])/gi;
const REQUIREMENT_RANGE_PATTERN = /(?<![A-Za-z0-9_])R(\d{1,3})\s*[–—-]\s*R?(\d{1,3})(?![A-Za-z0-9_])/gi;

/**
 * Requirement identifiers a plan can actually be checked against.
 *
 * Taken from the plan's own vertical slices, which are the only place a plan declares `requirement_ids`.
 * Deliberately **not** taken from prose: a criterion saying *"requirements live in the phase description"* is
 * the defect, not the definition.
 */
export function declaredRequirementIds(plan: PlannedProject): Set<string> {
  const declared = new Set<string>();
  for (const slice of plan.vertical_slices ?? []) {
    for (const id of slice.requirement_ids ?? []) declared.add(id.trim().toLowerCase());
  }
  return new Set([...declared].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
}

/**
 * Requirement identifiers a block of text names, ranges expanded.
 *
 * Measured 2026-09-29 by suite 07 run 19, which is why this exists: the phase container's third acceptance
 * criterion read *"Requirement statements R1-R5 are each covered by at least one leaf acceptance criterion, with
 * no requirement left unowned"* and **`R1`–`R5` appeared nowhere else in the project** — not in a document, not
 * in a work item, not in the journal. So the phase gate the plan wrote for itself could be neither satisfied
 * nor falsified, and the front office raised it as a required question without being asked to (BOARD F-071).
 * A criterion that names something the phase must cover has to name something that exists.
 */
export function referencedRequirementIds(text: string): string[] {
  const referenced = new Set<string>();
  for (const match of text.matchAll(REQUIREMENT_ID_PATTERN)) {
    referenced.add(match[1]!.toLowerCase());
  }
  for (const match of text.matchAll(REQUIREMENT_RANGE_PATTERN)) {
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const [low, high] = from <= to ? [from, to] : [to, from];
    // A range wider than 200 identifiers is not a requirement list, and expanding one would produce a finding
    // the reader cannot act on. The literal endpoints are still reported.
    if (high - low > 200) {
      referenced.add(`r${from}`);
      referenced.add(`r${to}`);
      continue;
    }
    for (let n = low; n <= high; n += 1) referenced.add(`r${n}`);
  }
  // Ordered by number, not by the order the two passes happened to find them: this list is printed into a
  // finding a model is asked to act on, and `R1, R3, R2` reads as a defect in the report rather than in the plan.
  return [...referenced].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export interface PlanValidationResult {
  ok: boolean;
  issues: PlanValidationIssue[];
  leafCount: number;
  minTotalLeaves: number;
  sliceIssues: string[];
}

export function extractImpliedFilePaths(text: string): string[] {
  const matches = text.match(FILE_PATH_PATTERN) ?? [];
  return [...new Set(matches.map((path) => path.replace(/^\.\//, "")))];
}

export function extractImpliedNpmScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

export function hasVerifiableAcceptanceCriterion(criteria: string[] | undefined): boolean {
  return (criteria ?? []).some((criterion) => VERIFIABLE_AC_PATTERN.test(criterion));
}

export function plannedLeaves(items: PlannedWorkItem[]): PlannedWorkItem[] {
  return items.filter((item) => !isContainerPlannedItem(item, items));
}

export function plannedPhaseContainers(items: PlannedWorkItem[]): PlannedWorkItem[] {
  const roots = items.filter((item) => !item.parent_ref);
  const withChildren = roots.filter((item) => isContainerPlannedItem(item, items));
  return withChildren.length > 0 ? withChildren : roots;
}

/** Count leaf tasks anywhere under a container (direct and nested). */
export function countLeavesUnderPhase(
  phase: PlannedWorkItem,
  items: PlannedWorkItem[],
): number {
  if (!isContainerPlannedItem(phase, items)) return 1;
  const phaseKey = phase.title.toLowerCase();
  let total = 0;
  for (const child of items) {
    if (child.parent_ref?.toLowerCase() !== phaseKey) continue;
    if (isContainerPlannedItem(child, items)) {
      total += countLeavesUnderPhase(child, items);
    } else {
      total += 1;
    }
  }
  return total;
}

export function isOverweightPlannedLeaf(leaf: PlannedWorkItem): boolean {
  const blob = [leaf.title, leaf.description ?? "", ...(leaf.acceptance_criteria ?? [])].join("\n");
  return extractImpliedFilePaths(blob).length > 3 || extractImpliedNpmScripts(blob).length > 2;
}

export function validatePlan(
  plan: PlannedProject,
  input: {
    intent: string;
    granularity: PlanGranularity;
    mode?: "greenfield" | "incremental";
    requireVerticalSlices?: boolean;
  },
): PlanValidationResult {
  const items = plan.work_items;
  const leaves = plannedLeaves(items);
  const phases = plannedPhaseContainers(items);
  const budget = complexityBudget(input.intent, input.granularity, phases.length || undefined);
  const issues: PlanValidationIssue[] = [];
  const sliceIssues = plan.vertical_slices?.flatMap((slice) => validateVerticalSlicePlan([{
    id: slice.id,
    title: slice.title,
    outcome: slice.outcome,
    requirementIds: slice.requirement_ids,
    workItemIds: slice.work_item_ids,
    evidenceKinds: slice.evidence_kinds,
  }]).issues) ?? [];
  for (const message of sliceIssues) issues.push({ code: "invalid_vertical_slice", message });
  const incremental = input.mode === "incremental";
  if (input.requireVerticalSlices && (!plan.vertical_slices || plan.vertical_slices.length === 0)) {
    issues.push({ code: "invalid_vertical_slice", message: "Product plan must contain at least one vertical slice with an observable outcome." });
  }

  if (!incremental && leaves.length < budget.minTotalLeaves) {
    issues.push({
      code: "too_few_leaves",
      message: `Plan has ${leaves.length} leaf tasks; granularity ${input.granularity} requires at least ${budget.minTotalLeaves}.`,
    });
  }

  // An acceptance criterion may only cite requirements the plan itself declares. Checked for every item and
  // not just leaves, because the measured case was the **phase container's** own criterion — the one the phase
  // gate is scored against, where an unfalsifiable requirement does the most damage (BOARD F-071).
  const declaredRequirements = declaredRequirementIds(plan);
  for (const item of items) {
    const text = [item.title, item.description ?? "", ...(item.acceptance_criteria ?? [])].join("\n");
    const missing = referencedRequirementIds(text).filter((id) => !declaredRequirements.has(id));
    if (missing.length === 0) continue;
    issues.push({
      code: "undefined_requirement_reference",
      message:
        `"${item.title}" cites requirement ${missing.length === 1 ? "identifier" : "identifiers"} ` +
        `${missing.map((id) => id.toUpperCase()).join(", ")}, which nothing in this plan defines. ` +
        "Either declare them in the plan's vertical slices (`requirement_ids`) or write the criterion " +
        "against the work-item ids it can see, so the criterion can be satisfied or falsified.",
      title: item.title,
    });
  }

  if (!incremental) {
    for (const phase of phases) {
      const count = countLeavesUnderPhase(phase, items);
      if (count < budget.minLeavesPerPhase) {
        issues.push({
          code: "too_few_leaves_in_phase",
          title: phase.title,
          message: `Phase "${phase.title}" has ${count} leaves; need at least ${budget.minLeavesPerPhase}.`,
        });
      }
    }
  }

  for (const leaf of leaves) {
    const description = leaf.description?.trim() ?? "";
    if (description.length < 200) {
      issues.push({
        code: "thin_description",
        title: leaf.title,
        message: `Leaf "${leaf.title}" description is ${description.length} characters; need at least 200.`,
      });
    }
    if (!hasVerifiableAcceptanceCriterion(leaf.acceptance_criteria)) {
      issues.push({
        code: "missing_verifiable_ac",
        title: leaf.title,
        message: `Leaf "${leaf.title}" acceptance criteria must state observable evidence: a passing check, an artifact path, a documented endpoint/UI behavior, or an explicit publication/export/persistence result.`,
      });
    }
    const blob = [leaf.title, description, ...(leaf.acceptance_criteria ?? [])].join("\n");
    const files = extractImpliedFilePaths(blob);
    if (files.length > 3) {
      issues.push({
        code: "overweight_files",
        title: leaf.title,
        message: `Leaf "${leaf.title}" implies ${files.length} files (max 3): ${files.slice(0, 6).join(", ")}.`,
      });
    }
    const scripts = extractImpliedNpmScripts(blob);
    if (scripts.length > 2) {
      issues.push({
        code: "overweight_scripts",
        title: leaf.title,
        message: `Leaf "${leaf.title}" lists ${scripts.length} npm scripts (max 2): ${scripts.join(", ")}.`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    leafCount: leaves.length,
    minTotalLeaves: incremental ? 0 : budget.minTotalLeaves,
    sliceIssues,
  };
}

/** Drop thin / unverifiable leaves. Overweight leaves stay so recursive expansion can split them. */
export function dropInvalidLeaves(plan: PlannedProject): PlannedProject {
  const items = plan.work_items;
  const work_items = items.filter((item) => {
    if (isContainerPlannedItem(item, items) || !item.parent_ref) return true;
    const description = item.description?.trim() ?? "";
    if (description.length < 200) return false;
    if (!hasVerifiableAcceptanceCriterion(item.acceptance_criteria)) return false;
    return true;
  });
  return { ...plan, work_items };
}

export function formatPlanValidationIssues(issues: PlanValidationIssue[]): string {
  return issues.map((issue) => `- [${issue.code}] ${issue.message}`).join("\n");
}

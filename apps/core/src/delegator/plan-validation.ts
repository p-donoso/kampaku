import { isContainerPlannedItem, type PlannedProject, type PlannedWorkItem } from "./types.js";
import {
  complexityBudget,
  type PlanGranularity,
} from "./plan-granularity.js";

export const VERIFIABLE_AC_PATTERN =
  /\bnpm (test|run)\b|\bfile exists\b|\bpytest\b|\bcargo test\b|\bgo test\b|\.(ts|tsx|js|mjs|py|go|rs|md|yaml|yml)\b/i;

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
    | "too_few_leaves_in_phase";
  message: string;
  title?: string;
}

export interface PlanValidationResult {
  ok: boolean;
  issues: PlanValidationIssue[];
  leafCount: number;
  minTotalLeaves: number;
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
  },
): PlanValidationResult {
  const items = plan.work_items;
  const leaves = plannedLeaves(items);
  const phases = plannedPhaseContainers(items);
  const budget = complexityBudget(input.intent, input.granularity, phases.length || undefined);
  const issues: PlanValidationIssue[] = [];
  const incremental = input.mode === "incremental";

  if (!incremental && leaves.length < budget.minTotalLeaves) {
    issues.push({
      code: "too_few_leaves",
      message: `Plan has ${leaves.length} leaf tasks; granularity ${input.granularity} requires at least ${budget.minTotalLeaves}.`,
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
        message: `Leaf "${leaf.title}" acceptance criteria must include a runnable command (npm test, npm run build) or an explicit file-exists check.`,
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

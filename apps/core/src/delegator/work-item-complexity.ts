import {
  GRANULARITY_BUDGETS,
  type PlanGranularity,
} from "./plan-granularity.js";
import {
  extractImpliedFilePaths,
  extractImpliedNpmScripts,
} from "./plan-validation.js";
import {
  isContainerPlannedItem,
  type PlannedWorkItem,
} from "./types.js";

export const FILE_BUDGET_MAX = 3;
export const SCRIPT_BUDGET_MAX = 2;
export const MIN_DESCRIPTION_CHARS = 200;

export interface WorkItemComplexity {
  granularity: PlanGranularity;
  depth: number;
  role: "container" | "leaf";
  leafCount: number;
  targetLeaves: number;
  minLeaves: number;
  filesUsed: number;
  filesMax: number;
  scriptsUsed: number;
  scriptsMax: number;
  descriptionChars: number;
  minDescriptionChars: number;
}

function plannedDescendantLeaves(node: PlannedWorkItem, items: PlannedWorkItem[]): number {
  const key = node.title.toLowerCase();
  let total = 0;
  for (const child of items) {
    if (child.parent_ref?.toLowerCase() !== key) continue;
    if (isContainerPlannedItem(child, items)) {
      total += plannedDescendantLeaves(child, items);
    } else {
      total += 1;
    }
  }
  return total;
}

function plannedDepth(item: PlannedWorkItem, byTitle: Map<string, PlannedWorkItem>): number {
  let depth = 0;
  let current: PlannedWorkItem | undefined = item;
  const seen = new Set<string>();
  while (current?.parent_ref) {
    const parentKey = current.parent_ref.toLowerCase();
    if (seen.has(parentKey)) break;
    seen.add(parentKey);
    depth += 1;
    current = byTitle.get(parentKey);
  }
  return depth;
}

export function snapshotPlannedComplexity(
  item: PlannedWorkItem,
  allItems: PlannedWorkItem[],
  granularity: PlanGranularity,
): WorkItemComplexity {
  const budget = GRANULARITY_BUDGETS[granularity];
  const byTitle = new Map(allItems.map((entry) => [entry.title.toLowerCase(), entry]));
  const isContainer = isContainerPlannedItem(item, allItems);
  const blob = [item.title, item.description ?? "", ...(item.acceptance_criteria ?? [])].join("\n");
  const filesUsed = extractImpliedFilePaths(blob).length;
  const scriptsUsed = extractImpliedNpmScripts(blob).length;
  const leafCount = isContainer ? plannedDescendantLeaves(item, allItems) : 1;

  return {
    granularity,
    depth: plannedDepth(item, byTitle),
    role: isContainer ? "container" : "leaf",
    leafCount,
    targetLeaves: isContainer ? budget.targetLeavesPerPhase : 1,
    minLeaves: isContainer ? budget.minLeavesPerPhase : 1,
    filesUsed,
    filesMax: FILE_BUDGET_MAX,
    scriptsUsed,
    scriptsMax: SCRIPT_BUDGET_MAX,
    descriptionChars: (item.description ?? "").trim().length,
    minDescriptionChars: MIN_DESCRIPTION_CHARS,
  };
}

export function parseWorkItemComplexity(raw: string | null | undefined): WorkItemComplexity | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkItemComplexity>;
    if (parsed.granularity !== "standard" && parsed.granularity !== "fine") return undefined;
    if (parsed.role !== "container" && parsed.role !== "leaf") return undefined;
    return {
      granularity: parsed.granularity,
      depth: Number(parsed.depth ?? 0),
      role: parsed.role,
      leafCount: Number(parsed.leafCount ?? 0),
      targetLeaves: Number(parsed.targetLeaves ?? 0),
      minLeaves: Number(parsed.minLeaves ?? 0),
      filesUsed: Number(parsed.filesUsed ?? 0),
      filesMax: Number(parsed.filesMax ?? FILE_BUDGET_MAX),
      scriptsUsed: Number(parsed.scriptsUsed ?? 0),
      scriptsMax: Number(parsed.scriptsMax ?? SCRIPT_BUDGET_MAX),
      descriptionChars: Number(parsed.descriptionChars ?? 0),
      minDescriptionChars: Number(parsed.minDescriptionChars ?? MIN_DESCRIPTION_CHARS),
    };
  } catch {
    return undefined;
  }
}

export function deriveWorkItemComplexity(input: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  granularity?: PlanGranularity;
  depth?: number;
  role: "container" | "leaf";
  leafCount?: number;
}): WorkItemComplexity {
  const granularity = input.granularity ?? "standard";
  const budget = GRANULARITY_BUDGETS[granularity];
  const blob = [input.title, input.description ?? "", ...(input.acceptanceCriteria ?? [])].join("\n");
  return {
    granularity,
    depth: input.depth ?? 0,
    role: input.role,
    leafCount: input.role === "container" ? (input.leafCount ?? 0) : 1,
    targetLeaves: input.role === "container" ? budget.targetLeavesPerPhase : 1,
    minLeaves: input.role === "container" ? budget.minLeavesPerPhase : 1,
    filesUsed: extractImpliedFilePaths(blob).length,
    filesMax: FILE_BUDGET_MAX,
    scriptsUsed: extractImpliedNpmScripts(blob).length,
    scriptsMax: SCRIPT_BUDGET_MAX,
    descriptionChars: (input.description ?? "").trim().length,
    minDescriptionChars: MIN_DESCRIPTION_CHARS,
  };
}

export function formatComplexityShort(complexity: WorkItemComplexity): string {
  if (complexity.role === "container") {
    return `${complexity.granularity} · ${complexity.leafCount}/${complexity.targetLeaves} leaves`;
  }
  return `${complexity.granularity} · ${complexity.filesUsed}/${complexity.filesMax} files · ${complexity.scriptsUsed}/${complexity.scriptsMax} scripts`;
}

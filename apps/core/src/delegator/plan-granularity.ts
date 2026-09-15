export const PLAN_GRANULARITIES = ["standard", "fine"] as const;
export type PlanGranularity = (typeof PLAN_GRANULARITIES)[number];

export interface GranularityBudget {
  minLeavesPerPhase: number;
  maxLeavesPerPhase: number;
  targetLeavesPerPhase: number;
}

export const GRANULARITY_BUDGETS: Record<PlanGranularity, GranularityBudget> = {
  standard: { minLeavesPerPhase: 1, maxLeavesPerPhase: 8, targetLeavesPerPhase: 3 },
  fine: { minLeavesPerPhase: 15, maxLeavesPerPhase: 25, targetLeavesPerPhase: 18 },
};

const FEATURE_HINTS: RegExp[] = [
  /canvas|draw|shape/i,
  /upload|byot|compose|raster/i,
  /optimis|ssim|vector/i,
  /auth|login|oauth/i,
  /api|endpoint|rest|graphql/i,
  /\be2e\b|cypress|playwright/i,
  /\btest|qa|coverage/i,
  /wiki|docs|readme/i,
  /\bci\b|github actions|pipeline/i,
  /audit|oss|license/i,
  /frontend|ui|interface/i,
  /backend|server|fastapi|express/i,
];

export function parsePlanGranularity(value: unknown): PlanGranularity | undefined {
  if (value === "standard" || value === "fine") return value;
  return undefined;
}

export function resolvePlanGranularity(input: {
  granularity?: string;
  existingProject?: boolean;
}): PlanGranularity {
  const parsed = parsePlanGranularity(input.granularity);
  if (parsed) return parsed;
  return input.existingProject ? "standard" : "fine";
}

export function countIntentFeatures(intent: string): number {
  const hinted = FEATURE_HINTS.filter((pattern) => pattern.test(intent)).length;
  const parts = intent
    .split(/\s+(?:and|plus)\s+|[,;/]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
  return Math.max(hinted, Math.min(parts.length, 12), 1);
}

export function complexityBudget(
  intent: string,
  granularity: PlanGranularity,
  phaseCount = 0,
): {
  featureCount: number;
  minLeavesPerPhase: number;
  maxLeavesPerPhase: number;
  targetLeavesPerPhase: number;
  estimatedPhases: number;
  minTotalLeaves: number;
} {
  const budget = GRANULARITY_BUDGETS[granularity];
  const featureCount = countIntentFeatures(intent);
  const estimatedPhases =
    phaseCount > 0
      ? phaseCount
      : Math.max(3, Math.min(6, Math.ceil(featureCount / 2)));
  const minFromFeatures = granularity === "standard" ? 1 : featureCount * 2;
  const minTotalLeaves = Math.max(minFromFeatures, estimatedPhases * budget.minLeavesPerPhase);

  return {
    featureCount,
    minLeavesPerPhase: budget.minLeavesPerPhase,
    maxLeavesPerPhase: budget.maxLeavesPerPhase,
    targetLeavesPerPhase: budget.targetLeavesPerPhase,
    estimatedPhases,
    minTotalLeaves,
  };
}

export function granularityPromptBlock(granularity: PlanGranularity): string {
  const budget = GRANULARITY_BUDGETS[granularity];
  return [
    `Granularity: ${granularity}.`,
    `- Target ${budget.targetLeavesPerPhase} leaf tasks per phase container (min ${budget.minLeavesPerPhase}, max ${budget.maxLeavesPerPhase}).`,
    "- Recursively decompose coarse nodes until every leaf meets micro-task rules; do not stop after two levels.",
    "- If the intent mentions N major features, plan at least 2N leaf tasks overall.",
    "- Split phases rather than packing features into a handful of oversized leaves.",
  ].join("\n");
}

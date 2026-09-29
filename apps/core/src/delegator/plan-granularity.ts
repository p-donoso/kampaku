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

/**
 * The budget a plan is planned under, and **the default is the small one**.
 *
 * `standard` targets 3 leaves per phase (max 8); `fine` targets 18 (min 15, max 25). The default used to be
 * `fine` whenever the project was new, on the reasoning that a greenfield product deserves a thorough plan.
 * That reasoning priced the plan before it knew the request, and the price is not small: **the quota is what
 * the model has to write.**
 *
 * Measured 2026-09-29 taking suite 07 (run 17), from the endpoint's own token accounting, on a request for
 * **one vertical slice**: one decomposition response of **29,481 output tokens in 96.7 s**, then expansion
 * responses of 10.8k-11.4k output tokens at 37-42 s each — **231,464 output tokens in five minutes**, still
 * expanding, against a 60-minute turn budget. The input was never the problem (2-3k tokens, creeping): ~11k
 * of each response is the *answer*, because the quota asks for ~18 leaf descriptions of 600 characters. A
 * quota is a ceiling, not a target to hit, and paying it by default on every greenfield project is paying
 * roughly twenty times the plan a slice request asks for.
 *
 * Practice agrees on the size, from two directions. A first vertical slice is a *walking skeleton* — one
 * thin path a caller can use end to end — and that is a handful of steps, not fifteen to twenty-five per
 * phase. The rest is *progressive elaboration*: detail is added as the work approaches, not all up front,
 * because a plan refined long before the work is refined against what was known at the time. And work items
 * are sized to be finishable, which a phase of twenty-five leaves is not by virtue of the count alone.
 *
 * So `fine` is an **escalation a caller asks for**, not a default the plan receives: name it when the
 * request is a whole-program plan and the extra leaves are wanted. Nothing else changes — what makes a plan
 * executable is the leaf rules (one concern, a 200-character description, the repository's own check
 * command, at most three files), and those are unaffected by the count.
 */
export function resolvePlanGranularity(input: {
  granularity?: string;
  existingProject?: boolean;
}): PlanGranularity {
  const parsed = parsePlanGranularity(input.granularity);
  if (parsed) return parsed;
  return "standard";
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

import { planAndDelegate, type PlanAndDelegateContext, type PlanAndDelegateResult } from "../../delegator/plan-and-delegate.js";
import type { PlanGranularity } from "../../delegator/plan-granularity.js";

export interface SubmitIntentInput {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
  granularity?: PlanGranularity;
}

export async function submitIntent(
  ctx: PlanAndDelegateContext,
  input: SubmitIntentInput,
): Promise<PlanAndDelegateResult> {
  return planAndDelegate(ctx, {
    intent: input.intent,
    projectSlug: input.projectSlug,
    createMissingAgents: input.createMissingAgents,
    granularity: input.granularity,
  });
}

export type { PlanAndDelegateContext, PlanAndDelegateResult };

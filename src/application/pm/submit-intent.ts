import { planAndDelegate, type PlanAndDelegateContext, type PlanAndDelegateResult } from "../../delegator/plan-and-delegate.js";

export interface SubmitIntentInput {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
}

export async function submitIntent(
  ctx: PlanAndDelegateContext,
  input: SubmitIntentInput,
): Promise<PlanAndDelegateResult> {
  return planAndDelegate(ctx, {
    intent: input.intent,
    projectSlug: input.projectSlug,
    createMissingAgents: input.createMissingAgents,
  });
}

export type { PlanAndDelegateContext, PlanAndDelegateResult };

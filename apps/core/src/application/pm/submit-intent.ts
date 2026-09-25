import { planAndDelegate, type PlanAndDelegateContext, type PlanAndDelegateResult } from "../../delegator/plan-and-delegate.js";
import type { TurnDeadline } from "../../agents/runtime/turn-budget.js";
import type { PlanGranularity } from "../../delegator/plan-granularity.js";

export interface SubmitIntentInput {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
  granularity?: PlanGranularity;
  mode?: "preview" | "apply";
  approvalReference?: string;
  approvalFingerprint?: string;
  approvalContentHash?: string;
  /** The turn's clock, so planning cannot outlive the turn that asked for it. */
  turn?: TurnDeadline | undefined;
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
    mode: input.mode,
    approvalReference: input.approvalReference,
    approvalFingerprint: input.approvalFingerprint,
    approvalContentHash: input.approvalContentHash,
    turn: input.turn,
  });
}

export type { PlanAndDelegateContext, PlanAndDelegateResult };

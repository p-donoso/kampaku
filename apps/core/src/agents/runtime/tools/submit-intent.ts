import type { KampakuToolContext } from "./index.js";
import { submitIntent } from "../../../application/pm/submit-intent.js";
import type { PlanRosterFinding } from "../../../delegator/roster-validation.js";
import {
  parsePlanGranularity,
  type PlanGranularity,
} from "../../../delegator/plan-granularity.js";
import type { TurnDeadline } from "../turn-budget.js";

export interface SubmitIntentArgs {
  intent: string;
  project_slug?: string;
  create_missing_agents?: boolean;
  granularity?: PlanGranularity;
  mode?: "preview" | "apply";
  approval_reference?: string;
  approval_fingerprint?: string;
  approval_content_hash?: string;
}

export interface SubmitIntentResult {
  projectSlug: string;
  projectId: string;
  plannerUsed: string;
  workItemsCreated: number;
  assignments: Array<{
    title: string;
    assigneeSlug: string;
    reason: string;
  }>;
  /**
   * What the plan declared that this project cannot provide, resolved before the plan was recorded. A lead
   * reading a preview must see, in the response, that the roster it previewed is not the roster that will own
   * the work — rather than noticing it by reading the leaves back (BOARD F-102).
   */
  rosterFindings: PlanRosterFinding[];
  summary: string;
  approvalReference?: string;
  planFingerprint?: string;
  planContentHash?: string;
}

export async function executeSubmitIntent(
  ctx: KampakuToolContext,
  args: SubmitIntentArgs,
  /** The turn's clock. Planning must not outlive the turn that asked for it. See turn-budget.ts. */
  turn?: TurnDeadline | undefined,
): Promise<SubmitIntentResult> {
  if ((args.mode ?? "preview") === "apply" && (!args.project_slug?.trim() || !args.approval_reference?.trim() || !args.approval_fingerprint?.trim() || !args.approval_content_hash?.trim())) {
    throw new Error("Applying a plan requires project_slug, approval_reference, approval_fingerprint, and approval_content_hash from the responsible project lead.");
  }
  const result = await submitIntent(ctx, {
    intent: args.intent,
    projectSlug: args.project_slug,
    createMissingAgents: args.create_missing_agents,
    granularity: parsePlanGranularity(args.granularity),
    mode: args.mode ?? "preview",
    // **The reference is what binds an apply to its approval, and it used to be dropped here.** The check
    // above required it, the tool schema advertised it, `SubmitIntentInput` declared it, and
    // `submitIntent` forwarded it — and this object literal did not pass it, so `planAndDelegate` received
    // `approvalReference: undefined` on every apply. With no reference there is no preview to resolve, so an
    // apply silently took the *planning* path instead: it re-derived a whole plan (one model call per node
    // per depth) and only then refused with a message that named no field.
    //
    // Measured 2026-09-28 taking suite 07 (run 16): the lead previewed and approved three times, each pair
    // with matching fingerprint and content hash, and every apply was refused — 0 work items, so the suite's
    // central oracle was unscorable. The refusals cost four model calls and two full re-plans, and one of
    // those re-plans died on an unrelated schema error and took the turn's remaining budget with it. Same
    // shape as [F-047](../../../../../docs/eval/results/BOARD.md): a field accepted, advertised, and dropped
    // on the way to the implementation.
    approvalReference: args.approval_reference,
    approvalFingerprint: args.approval_fingerprint,
    approvalContentHash: args.approval_content_hash,
    turn,
  });

  return {
    projectSlug: result.projectSlug,
    projectId: result.projectId,
    plannerUsed: result.plannerUsed,
    workItemsCreated: result.workItemsCreated,
    assignments: result.assignments.map((a) => ({
      title: a.title,
      assigneeSlug: a.assigneeSlug,
      reason: a.reason,
    })),
    rosterFindings: result.rosterFindings,
    summary: result.summary,
    approvalReference: result.approvalReference,
    planFingerprint: result.planFingerprint,
    planContentHash: result.planContentHash,
  };
}

export const SUBMIT_INTENT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_intent",
    description:
      "Entry point for an authorized project lead or domain specialist to propose project planning and delegation. " +
      "Provide the emperor's full intent in natural language; the planner will propose project structure " +
      "and assignments, while agent creation remains an explicit hierarchy action. " +
      "When project_slug points to an existing project, open tasks are passed to the planner — prefer extending them or adding subtasks over duplicating work. " +
      "Call get_project first to review open tasks and state in intent which items you extend or parent under.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "The emperor's full request in natural language.",
        },
        project_slug: {
          type: "string",
          description: "Optional existing or preferred project slug.",
        },
        create_missing_agents: {
          type: "boolean",
          description: "Whether to create missing specialized agents (default false).",
        },
        granularity: {
          type: "string",
          enum: ["standard", "fine"],
          description:
            "Planning leaf budget. fine (default for new projects): 15–25 leaves per phase. standard: 8–12. Use fine for greenfield products.",
        },
        mode: {
          type: "string",
          enum: ["preview", "apply"],
          description: "Preview produces no persistence. Apply persists only after the project lead has approved the plan.",
        },
        approval_reference: {
          type: "string",
          description: "Required for apply mode: the project lead approval reference or journal entry ID.",
        },
        approval_fingerprint: { type: "string", description: "Required for apply mode: exact fingerprint returned by preview." },
        approval_content_hash: {
          type: "string",
          description: "Required for apply mode: exact plan content hash returned by preview.",
        },
      },
      required: ["intent"],
    },
  },
};

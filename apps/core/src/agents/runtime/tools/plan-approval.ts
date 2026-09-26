import type { KampakuToolContext } from "./index.js";
import { ledProjectFor } from "./authorization.js";

export interface ApprovePlanArgs {
  agent_slug: string;
  project_slug: string;
  approval_reference: string;
  plan_fingerprint: string;
  plan_content_hash: string;
  expires_at?: string;
}

export interface RevokePlanApprovalArgs extends Omit<ApprovePlanArgs, "expires_at"> {}

/**
 * Who may approve a plan, and the widening that [ADR-0006](../../../../../docs/adr/0006-project-lead-creates-seats.md)
 * and BOARD F-046 established one layer in.
 *
 * A seat holding `system-delegation` or `workflow-specialist-delegation` governs plans. So does the
 * **container's own linked lead**, read from `projectLeadAgentId` — the same authority `submit_intent`
 * already accepts since suite 05, applied to the approval half of the same operation.
 *
 * Measured 2026-09-26 taking suite 07: a lead created through the documented `POST /api/v1/agents` route
 * holds the default skill set, which contains `system-plan-quality` (it instructs `submit_intent`) and
 * neither `system-delegation` nor `workflow-specialist-delegation`. The front office is told to delegate
 * planning to exactly that seat, so the lead could write a plan and could not approve or apply it — and a
 * plan that is never applied is not durable, which is the whole of suite 07's first oracle bullet.
 */
function assertPlanAuthority(
  ctx: KampakuToolContext,
  agentSlugOrId: string,
  projectSlug: string,
  action: "approve a plan" | "revoke a plan approval",
) {
  const agent = ctx.agentStore.getAgentBySlugOrId(agentSlugOrId);
  if (!agent) throw new Error("Agent not found.");
  const skills = ctx.skillStore.listAgentSkills(agent.id);
  if (skills.includes("system-delegation") || skills.includes("workflow-specialist-delegation")) {
    return agent;
  }
  if (ledProjectFor(ctx.store, agent.id, projectSlug)) return agent;
  throw new Error(`Only a project lead or authorized specialist can ${action}.`);
}

export function executeApprovePlan(ctx: KampakuToolContext, args: ApprovePlanArgs) {
  const agent = assertPlanAuthority(ctx, args.agent_slug, args.project_slug, "approve a plan");
  if (!args.approval_reference.trim() || !args.project_slug.trim() || !args.plan_fingerprint.trim() || !args.plan_content_hash.trim()) throw new Error("Project slug, approval reference, plan fingerprint, and plan content hash are required.");
  ctx.store.recordPlanApproval({ projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), planFingerprint: args.plan_fingerprint.trim(), planContentHash: args.plan_content_hash.trim(), agentId: agent.id, expiresAt: args.expires_at });
  return { projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), planFingerprint: args.plan_fingerprint.trim(), planContentHash: args.plan_content_hash.trim(), status: "approved" };
}

export function executeRevokePlanApproval(ctx: KampakuToolContext, args: RevokePlanApprovalArgs) {
  const agent = assertPlanAuthority(ctx, args.agent_slug, args.project_slug, "revoke a plan approval");
  ctx.store.revokePlanApproval({ projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), planFingerprint: args.plan_fingerprint.trim(), planContentHash: args.plan_content_hash.trim(), agentId: agent.id });
  return { projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), status: "revoked" };
}

export const APPROVE_PLAN_TOOL = { type: "function" as const, function: { name: "approve_plan", description: "Persist explicit, expiring approval from an authorized project lead or specialist for an exact previewed plan fingerprint and content hash. This is the step between preview and apply: without a non-expired approval for the exact fingerprint returned by preview, submit_intent in apply mode is refused and no work item is persisted. Pass expires_at in the future, or omit it.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, project_slug: { type: "string" }, approval_reference: { type: "string" }, plan_fingerprint: { type: "string" }, plan_content_hash: { type: "string" }, expires_at: { type: "string", description: "Optional ISO-8601 timestamp for when this approval stops being usable. Must be in the future; an expiry that has already passed is refused, because an approval that cannot be applied is not an approval. Omit it for the platform default (24 hours)." } }, required: ["agent_slug", "project_slug", "approval_reference", "plan_fingerprint", "plan_content_hash"] } } };
export const REVOKE_PLAN_APPROVAL_TOOL = { type: "function" as const, function: { name: "revoke_plan_approval", description: "Revoke a previously persisted plan approval before applying it.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, project_slug: { type: "string" }, approval_reference: { type: "string" }, plan_fingerprint: { type: "string" }, plan_content_hash: { type: "string" } }, required: ["agent_slug", "project_slug", "approval_reference", "plan_fingerprint", "plan_content_hash"] } } };

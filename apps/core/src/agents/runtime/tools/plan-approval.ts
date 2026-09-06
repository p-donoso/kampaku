import type { KampakuToolContext } from "./index.js";

export interface ApprovePlanArgs {
  agent_slug: string;
  project_slug: string;
  approval_reference: string;
  plan_fingerprint: string;
  plan_content_hash: string;
  expires_at?: string;
}

export interface RevokePlanApprovalArgs extends Omit<ApprovePlanArgs, "expires_at"> {}

export function executeApprovePlan(ctx: KampakuToolContext, args: ApprovePlanArgs) {
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error("Agent not found.");
  const skills = ctx.skillStore.listAgentSkills(agent.id);
  if (!skills.includes("system-delegation") && !skills.includes("workflow-specialist-delegation")) {
    throw new Error("Only a project lead or authorized specialist can approve a plan.");
  }
  if (!args.approval_reference.trim() || !args.project_slug.trim() || !args.plan_fingerprint.trim() || !args.plan_content_hash.trim()) throw new Error("Project slug, approval reference, plan fingerprint, and plan content hash are required.");
  ctx.store.recordPlanApproval({ projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), planFingerprint: args.plan_fingerprint.trim(), planContentHash: args.plan_content_hash.trim(), agentId: agent.id, expiresAt: args.expires_at });
  return { projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), planFingerprint: args.plan_fingerprint.trim(), planContentHash: args.plan_content_hash.trim(), status: "approved" };
}

export function executeRevokePlanApproval(ctx: KampakuToolContext, args: RevokePlanApprovalArgs) {
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error("Agent not found.");
  const skills = ctx.skillStore.listAgentSkills(agent.id);
  if (!skills.includes("system-delegation") && !skills.includes("workflow-specialist-delegation")) throw new Error("Only an authorized planning agent can revoke a plan approval.");
  ctx.store.revokePlanApproval({ projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), planFingerprint: args.plan_fingerprint.trim(), planContentHash: args.plan_content_hash.trim(), agentId: agent.id });
  return { projectSlug: args.project_slug.trim(), approvalReference: args.approval_reference.trim(), status: "revoked" };
}

export const APPROVE_PLAN_TOOL = { type: "function" as const, function: { name: "approve_plan", description: "Persist explicit, expiring approval from an authorized project lead or specialist for an exact previewed plan fingerprint and content hash.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, project_slug: { type: "string" }, approval_reference: { type: "string" }, plan_fingerprint: { type: "string" }, plan_content_hash: { type: "string" }, expires_at: { type: "string" } }, required: ["agent_slug", "project_slug", "approval_reference", "plan_fingerprint", "plan_content_hash"] } } };
export const REVOKE_PLAN_APPROVAL_TOOL = { type: "function" as const, function: { name: "revoke_plan_approval", description: "Revoke a previously persisted plan approval before applying it.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, project_slug: { type: "string" }, approval_reference: { type: "string" }, plan_fingerprint: { type: "string" }, plan_content_hash: { type: "string" } }, required: ["agent_slug", "project_slug", "approval_reference", "plan_fingerprint", "plan_content_hash"] } } };

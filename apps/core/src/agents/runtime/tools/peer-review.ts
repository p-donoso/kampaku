import type { KampakuToolContext } from "./index.js";

export type PeerReviewOutcome = "approved" | "changes_requested" | "rejected";

export interface RequestPeerReviewArgs {
  agent_slug: string;
  work_item_id: string;
  reviewer_agent_slug: string;
  scope: string;
  evidence?: string;
}

export interface SubmitPeerReviewArgs {
  agent_slug: string;
  review_id: string;
  outcome: PeerReviewOutcome;
  findings: string;
  required_changes?: string;
}

function requireAgent(ctx: KampakuToolContext, slug: string) {
  const agent = ctx.agentStore.getAgentBySlugOrId(slug);
  if (!agent) throw new Error(`Agent "${slug}" not found.`);
  return agent;
}

function requireJournal(ctx: KampakuToolContext) {
  if (!ctx.journalStore) throw new Error("Peer review workflow is not available.");
  return ctx.journalStore;
}

export function executeRequestPeerReview(ctx: KampakuToolContext, args: RequestPeerReviewArgs) {
  const requester = requireAgent(ctx, args.agent_slug);
  const reviewer = requireAgent(ctx, args.reviewer_agent_slug);
  const item = ctx.pmStore.getWorkItem(args.work_item_id);
  if (!item) throw new Error("Work item not found.");
  const entry = requireJournal(ctx).append({
    projectId: item.projectId,
    workItemId: item.id,
    anchorWorkItemId: item.parentId ?? item.id,
    kind: "peer_review_requested",
    fromAgentId: requester.id,
    toAgentId: reviewer.id,
    title: `Peer review requested: ${item.title}`,
    body: `Scope: ${args.scope.trim()}\nEvidence: ${args.evidence?.trim() ?? "Not provided"}`,
    refType: "work_item",
    refId: item.id,
    metadata: { status: "requested", reviewerAgentId: reviewer.id },
  });
  return { reviewId: entry.id, status: "requested", message: "Peer review requested and recorded in the work-item journal." };
}

export function executeSubmitPeerReview(ctx: KampakuToolContext, args: SubmitPeerReviewArgs) {
  const reviewer = requireAgent(ctx, args.agent_slug);
  const existing = requireJournal(ctx).getById(args.review_id);
  if (!existing || existing.kind !== "peer_review_requested") throw new Error("Peer review request not found.");
  const entry = requireJournal(ctx).append({
    projectId: existing.projectId,
    workItemId: existing.workItemId,
    anchorWorkItemId: existing.anchorWorkItemId,
    kind: "peer_review_updated",
    fromAgentId: reviewer.id,
    toAgentId: existing.fromAgentId,
    title: `Peer review ${args.outcome}: ${existing.title}`,
    body: `Findings: ${args.findings.trim()}\nRequired changes: ${args.required_changes?.trim() ?? "None"}`,
    refType: "work_item",
    refId: existing.id,
    metadata: { status: args.outcome, reviewId: existing.id },
  });
  return { reviewId: existing.id, updateId: entry.id, status: args.outcome };
}

export const REQUEST_PEER_REVIEW_TOOL = {
  type: "function" as const,
  function: { name: "request_peer_review", description: "Request an independent review of a work item and record the scope and evidence.", parameters: { type: "object", properties: {
    agent_slug: { type: "string" }, work_item_id: { type: "string" }, reviewer_agent_slug: { type: "string" }, scope: { type: "string" }, evidence: { type: "string" },
  }, required: ["agent_slug", "work_item_id", "reviewer_agent_slug", "scope"] } },
};

export const SUBMIT_PEER_REVIEW_TOOL = {
  type: "function" as const,
  function: { name: "submit_peer_review", description: "Submit an independent peer review with findings and an approval outcome.", parameters: { type: "object", properties: {
    agent_slug: { type: "string" }, review_id: { type: "string" }, outcome: { type: "string", enum: ["approved", "changes_requested", "rejected"] }, findings: { type: "string" }, required_changes: { type: "string" },
  }, required: ["agent_slug", "review_id", "outcome", "findings"] } },
};

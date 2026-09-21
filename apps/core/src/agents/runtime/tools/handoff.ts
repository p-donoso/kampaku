import type { KampakuToolContext } from "./index.js";
import {
  buildPostActionRuntime,
  recordPostActionLifecycle,
} from "../../../application/pm/post-action/index.js";

export interface RequestHandoffArgs {
  agent_slug: string;
  work_item_id: string;
  new_owner_agent_slug: string;
  summary: string;
  decisions: string;
  evidence: string;
  risks: string;
  next_action: string;
  expires_at?: string;
}

export interface AcceptHandoffArgs {
  agent_slug: string;
  handoff_id: string;
  acknowledgement: string;
}

export interface ResolveHandoffArgs {
  agent_slug: string;
  handoff_id: string;
  action: "reject" | "cancel";
  reason: string;
}

function agent(ctx: KampakuToolContext, slug: string) {
  const record = ctx.agentStore.getAgentBySlugOrId(slug);
  if (!record) throw new Error(`Agent "${slug}" not found.`);
  return record;
}

function journal(ctx: KampakuToolContext) {
  if (!ctx.journalStore) throw new Error("Handoff workflow is not available.");
  return ctx.journalStore;
}

function handoffStatus(ctx: KampakuToolContext, handoffId: string, workItemId: string) {
  const entries = journal(ctx).listForWorkItem(workItemId);
  return entries
    .filter((entry) => entry.metadata.handoffId === handoffId)
    .at(-1)?.metadata.status as string | undefined;
}

export function executeRequestHandoff(ctx: KampakuToolContext, args: RequestHandoffArgs) {
  const requester = agent(ctx, args.agent_slug);
  const owner = agent(ctx, args.new_owner_agent_slug);
  const item = ctx.pmStore.getWorkItem(args.work_item_id);
  if (!item) throw new Error("Work item not found.");
  const existing = journal(ctx).listForWorkItem(item.id).find((entry) =>
    entry.kind === "handoff_requested" && entry.toAgentId === owner.id && handoffStatus(ctx, entry.id, item.id) === undefined,
  );
  if (existing) return { handoffId: existing.id, status: "requested", idempotent: true, message: "An equivalent handoff is already pending." };
  const entry = journal(ctx).append({
    projectId: item.projectId,
    workItemId: item.id,
    anchorWorkItemId: item.parentId ?? item.id,
    kind: "handoff_requested",
    fromAgentId: requester.id,
    toAgentId: owner.id,
    title: `Handoff requested: ${item.title}`,
    body: `Summary: ${args.summary.trim()}\nDecisions: ${args.decisions.trim()}\nEvidence: ${args.evidence.trim()}\nRisks: ${args.risks.trim()}\nNext action: ${args.next_action.trim()}\nExpires at: ${args.expires_at ?? "Not scheduled"}`,
    refType: "work_item",
    refId: item.id,
    metadata: { status: "requested", newOwnerAgentId: owner.id, expiresAt: args.expires_at },
  });
  return { handoffId: entry.id, status: "requested", message: "Handoff requested and recorded in the work-item journal." };
}

export function executeAcceptHandoff(ctx: KampakuToolContext, args: AcceptHandoffArgs) {
  const receiver = agent(ctx, args.agent_slug);
  const existing = journal(ctx).getById(args.handoff_id);
  if (!existing || existing.kind !== "handoff_requested") throw new Error("Handoff request not found.");
  if (existing.toAgentId !== receiver.id) throw new Error("Only the proposed new owner can accept this handoff.");
  const status = handoffStatus(ctx, existing.id, existing.workItemId);
  if (status) {
    if (status === "accepted") return { handoffId: existing.id, status, idempotent: true };
    throw new Error(`Handoff is already ${status}.`);
  }
  const expiresAt = typeof existing.metadata.expiresAt === "string" ? Date.parse(existing.metadata.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) throw new Error("Handoff has expired.");
  const updated = ctx.pmStore.updateWorkItem(existing.workItemId, {
    assigneeAgentId: receiver.id,
    assignedByAgentId: existing.fromAgentId,
  });
  if (!updated) throw new Error("Work item not found while accepting handoff.");
  const entry = journal(ctx).append({
    projectId: existing.projectId,
    workItemId: existing.workItemId,
    anchorWorkItemId: existing.anchorWorkItemId,
    kind: "handoff_updated",
    fromAgentId: receiver.id,
    toAgentId: existing.fromAgentId,
    title: `Handoff accepted: ${existing.title}`,
    body: args.acknowledgement.trim(),
    refType: "work_item",
    refId: existing.id,
    metadata: { status: "accepted", handoffId: existing.id, newOwnerAgentId: receiver.id },
  });
  recordPostActionLifecycle(
    buildPostActionRuntime({
      pmStore: ctx.pmStore,
      agentStore: ctx.agentStore,
      reviewStore: ctx.postActionStore,
      store: ctx.store,
      journalStore: ctx.journalStore,
      memoryStore: ctx.memoryStore,
      wikiStore: ctx.wikiStore,
    }),
    {
      event: "handoff_completed",
      projectId: existing.projectId,
      agentSlug: receiver.slug,
      workItemId: existing.workItemId,
      referenceId: existing.id,
      summary: `Handoff accepted by ${receiver.slug}. Acknowledgement: ${args.acknowledgement.trim()}`,
      decisions: [`Ownership transferred to ${receiver.slug}.`],
      wikiSyncRequired: ctx.store.getProject(existing.projectId)?.wikiSyncRequired === true,
    },
  );
  return { handoffId: existing.id, updateId: entry.id, status: "accepted", ownerAgentId: updated.assigneeAgentId };
}

export function executeResolveHandoff(ctx: KampakuToolContext, args: ResolveHandoffArgs) {
  const actor = agent(ctx, args.agent_slug);
  const existing = journal(ctx).getById(args.handoff_id);
  if (!existing || existing.kind !== "handoff_requested") throw new Error("Handoff request not found.");
  if (existing.fromAgentId !== actor.id && existing.toAgentId !== actor.id) throw new Error("Only the sender or proposed owner can resolve this handoff.");
  const status = handoffStatus(ctx, existing.id, existing.workItemId);
  if (status) return { handoffId: existing.id, status, idempotent: true };
  const entry = journal(ctx).append({
    projectId: existing.projectId,
    workItemId: existing.workItemId,
    anchorWorkItemId: existing.anchorWorkItemId,
    kind: "handoff_updated",
    fromAgentId: actor.id,
    toAgentId: existing.fromAgentId,
    title: `Handoff ${args.action}: ${existing.title}`,
    body: args.reason.trim(),
    refType: "work_item",
    refId: existing.id,
    metadata: { status: args.action === "reject" ? "rejected" : "cancelled", handoffId: existing.id },
  });
  return { handoffId: existing.id, updateId: entry.id, status: entry.metadata.status };
}

export const REQUEST_HANDOFF_TOOL = { type: "function" as const, function: { name: "request_handoff", description: "Request a structured transfer of work to another agent without changing ownership until accepted.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, work_item_id: { type: "string" }, new_owner_agent_slug: { type: "string" }, summary: { type: "string" }, decisions: { type: "string" }, evidence: { type: "string" }, risks: { type: "string" }, next_action: { type: "string" }, expires_at: { type: "string" } }, required: ["agent_slug", "work_item_id", "new_owner_agent_slug", "summary", "decisions", "evidence", "risks", "next_action"] } } };
export const ACCEPT_HANDOFF_TOOL = { type: "function" as const, function: { name: "accept_handoff", description: "Accept a handoff only when the receiving agent has reviewed its context and can own the next action.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, handoff_id: { type: "string" }, acknowledgement: { type: "string" } }, required: ["agent_slug", "handoff_id", "acknowledgement"] } } };
export const RESOLVE_HANDOFF_TOOL = { type: "function" as const, function: { name: "resolve_handoff", description: "Reject or cancel a pending handoff with a concrete reason.", parameters: { type: "object", properties: { agent_slug: { type: "string" }, handoff_id: { type: "string" }, action: { type: "string", enum: ["reject", "cancel"] }, reason: { type: "string" } }, required: ["agent_slug", "handoff_id", "action", "reason"] } } };

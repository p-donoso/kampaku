import {
  disposeRisk,
  type RiskAction,
} from "../../../application/pm/risk-register.js";
import type { KampakuToolContext } from "./index.js";

export type { RiskAction };

export interface ReportRiskArgs {
  agent_slug: string;
  project_id: string;
  title: string;
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  work_item_id?: string;
  mitigation?: string;
  review_at?: string;
}

export interface UpdateRiskArgs {
  agent_slug: string;
  project_id: string;
  risk_id: string;
  action: RiskAction;
  outcome: string;
  accepted_by?: string;
}

function journal(ctx: KampakuToolContext) {
  if (!ctx.journalStore) throw new Error("Risk workflow is not available.");
  return ctx.journalStore;
}

function requireAgent(ctx: KampakuToolContext, slug: string) {
  const agent = ctx.agentStore.getAgentBySlugOrId(slug);
  if (!agent) throw new Error(`Agent "${slug}" not found.`);
  return agent;
}

export function executeReportRisk(ctx: KampakuToolContext, args: ReportRiskArgs) {
  const agent = requireAgent(ctx, args.agent_slug);
  const project = ctx.store.getProject(args.project_id) ?? ctx.store.getProjectBySlug(args.project_id);
  if (!project) throw new Error("Project not found.");
  const workItem = args.work_item_id ? ctx.pmStore.getWorkItem(args.work_item_id) : undefined;
  if (workItem && workItem.projectId !== project.id) throw new Error("Work item does not belong to the project.");
  const anchorWorkItemId = workItem?.id ?? ctx.pmStore.listWorkItemsByProject(project.id)[0]?.id;
  if (!anchorWorkItemId) throw new Error("Risk requires a project with at least one work item.");
  const record = journal(ctx).append({
    projectId: project.id,
    workItemId: anchorWorkItemId,
    anchorWorkItemId,
    kind: "risk_reported",
    fromAgentId: agent.id,
    toAgentId: project.projectLeadAgentId,
    title: `Risk: ${args.title.trim()}`,
    body: `Description: ${args.description.trim()}\nProbability: ${args.probability}\nImpact: ${args.impact}\nMitigation: ${args.mitigation?.trim() ?? "Not defined"}\nReview at: ${args.review_at ?? "Not scheduled"}`,
    refType: "work_item",
    refId: workItem?.id,
    metadata: { probability: args.probability, impact: args.impact, status: "open", reviewAt: args.review_at },
  });
  return { riskId: record.id, status: "open", message: "Risk recorded without blocking the work item." };
}

export function executeUpdateRisk(ctx: KampakuToolContext, args: UpdateRiskArgs) {
  const agent = requireAgent(ctx, args.agent_slug);
  // The same writer the operator surface uses (`disposeRisk`), so an agent and the emperor cannot dispose
  // of a risk by two different rules — see `application/pm/risk-register.ts` for why that matters.
  const result = disposeRisk(journal(ctx), ctx.pmStore, {
    riskId: args.risk_id,
    action: args.action,
    outcome: args.outcome,
    agentId: agent.id,
    acceptedBy: args.accepted_by,
  });
  return {
    riskId: result.riskId,
    updateId: result.updateId,
    status: result.status,
    message: `Risk marked ${result.status}.`,
  };
}

export const REPORT_RISK_TOOL = {
  type: "function" as const,
  function: {
    name: "report_risk",
    description: "Record a non-blocking project risk with probability, impact, mitigation, and review timing.",
    parameters: { type: "object", properties: {
      agent_slug: { type: "string" }, project_id: { type: "string" }, title: { type: "string" }, description: { type: "string" },
      probability: { type: "string", enum: ["low", "medium", "high"] }, impact: { type: "string", enum: ["low", "medium", "high", "critical"] },
      work_item_id: { type: "string" }, mitigation: { type: "string" }, review_at: { type: "string" },
    }, required: ["agent_slug", "project_id", "title", "description", "probability", "impact"] },
  },
};

export const UPDATE_RISK_TOOL = {
  type: "function" as const,
  function: {
    name: "update_risk",
    description:
      "Update a recorded risk by mitigating, accepting, or escalating it, with a concrete outcome " +
      "(accepted_by names who accepts the exposure, required in spirit for accept).",
    parameters: { type: "object", properties: {
      agent_slug: { type: "string" }, project_id: { type: "string" }, risk_id: { type: "string" },
      action: { type: "string", enum: ["mitigate", "accept", "escalate"] }, outcome: { type: "string" },
      accepted_by: { type: "string" },
    }, required: ["agent_slug", "project_id", "risk_id", "action", "outcome"] },
  },
};

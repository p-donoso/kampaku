export type ChangeImpact = "low" | "medium" | "high" | "critical";

export interface AssessChangeRequestArgs {
  request: string;
  impact: ChangeImpact;
  affects_scope: boolean;
  affects_security: boolean;
  affects_api: boolean;
  project_slug?: string;
}

export function executeAssessChangeRequest(args: AssessChangeRequestArgs) {
  const request = args.request.trim();
  if (request.length < 15) throw new Error("Change request must contain at least 15 characters.");
  const approvalRequired = args.impact === "high" || args.impact === "critical" || args.affects_scope || args.affects_security || args.affects_api;
  return {
    projectSlug: args.project_slug,
    impact: args.impact,
    approvalRequired,
    route: approvalRequired ? "Project lead and relevant specialist approval before mutation." : "Owning specialist may refine the existing work item within scope.",
    message: "Change assessed without modifying the project, roadmap, or work items.",
  };
}

export const ASSESS_CHANGE_REQUEST_TOOL = {
  type: "function" as const,
  function: { name: "assess_change_request", description: "Assess change impact and approval requirements before modifying project scope.", parameters: { type: "object", properties: {
    request: { type: "string" }, impact: { type: "string", enum: ["low", "medium", "high", "critical"] }, affects_scope: { type: "boolean" }, affects_security: { type: "boolean" }, affects_api: { type: "boolean" }, project_slug: { type: "string" },
  }, required: ["request", "impact", "affects_scope", "affects_security", "affects_api"] } },
};

import type { KampakuToolContext } from "./index.js";

export interface GetAgentCapacityArgs {
  agent_slug: string;
  include_subordinates?: boolean;
  capacity_limit?: number;
  required_skills?: string[];
}

export function executeGetAgentCapacity(ctx: KampakuToolContext, args: GetAgentCapacityArgs) {
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error(`Agent "${args.agent_slug}" not found.`);
  const limit = args.capacity_limit ?? 2;
  const scope = new Set([agent.id]);
  if (args.include_subordinates !== false) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of ctx.agentStore.listAllAgents()) {
        if (candidate.parentId && scope.has(candidate.parentId) && !scope.has(candidate.id)) {
          scope.add(candidate.id);
          changed = true;
        }
      }
    }
  }
  const items = ctx.pmStore.listAllWorkItems().filter((item) => item.assigneeAgentId && scope.has(item.assigneeAgentId));
  const activeItems = items.filter((item) => item.status === "in_progress");
  const active = activeItems.length;
  const pending = items.filter((item) => item.status === "todo" || item.status === "backlog").length;
  const activeJobs = activeItems.filter((item) => {
    if (!item.jobId) return false;
    const job = ctx.store.getJob(item.jobId);
    return job?.status === "queued" || job?.status === "leased" || job?.status === "running";
  }).length;
  const loadPoints = activeItems.reduce((sum, item) => sum + 1 + (item.complexity?.filesUsed ?? 0) / 3 + (item.complexity?.scriptsUsed ?? 0) / 2, 0);
  const capacityPoints = Math.max(1, limit * scope.size);
  const utilization = Math.min(100, Math.round((loadPoints / capacityPoints) * 100));
  const requiredSkills = args.required_skills ?? [];
  const assignedSkills = ctx.skillStore?.listAgentSkills(agent.id) ?? [];
  const missingSkills = requiredSkills.filter((skill) => !assignedSkills.includes(skill));
  return {
    agentSlug: agent.slug,
    includeSubordinates: args.include_subordinates !== false,
    activeWorkItems: active,
    activeJobs,
    pendingWorkItems: pending,
    loadPoints: Math.round(loadPoints * 100) / 100,
    capacityLimit: capacityPoints,
    utilizationPercent: utilization,
    requiredSkills,
    missingSkills,
    status: utilization >= 100 ? "saturated" : utilization >= 75 ? "near_capacity" : "available",
    recommendation: missingSkills.length > 0 ? `Do not assign until required skills are available: ${missingSkills.join(", ")}.` : utilization >= 100 ? "Do not assign new work without reprioritizing or delegating." : "Review skills, priority, and current work before assigning.",
  };
}

export const GET_AGENT_CAPACITY_TOOL = {
  type: "function" as const,
  function: { name: "get_agent_capacity", description: "Inspect assigned work, utilization, and capacity status before assigning new work.", parameters: { type: "object", properties: {
    agent_slug: { type: "string" }, include_subordinates: { type: "boolean" }, capacity_limit: { type: "integer", minimum: 1 }, required_skills: { type: "array", items: { type: "string" } },
  }, required: ["agent_slug"] } },
};

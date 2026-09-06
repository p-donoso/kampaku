import { describe, expect, it } from "vitest";
import { executeGetAgentCapacity } from "../src/agents/runtime/tools/agent-capacity.js";

describe("agent capacity", () => {
  it("reports active and pending workload for an agent hierarchy", () => {
    const result = executeGetAgentCapacity({
      agentStore: {
        getAgentBySlugOrId: (slug: string) => ({ id: slug, slug, parentId: null }),
        listAllAgents: () => [{ id: "qa", slug: "qa", parentId: null }],
      },
      pmStore: {
        listAllWorkItems: () => [
          { assigneeAgentId: "qa", status: "in_progress" },
          { assigneeAgentId: "qa", status: "todo" },
          { assigneeAgentId: "other", status: "in_progress" },
        ],
      },
    } as any, { agent_slug: "qa", include_subordinates: false, capacity_limit: 2 });

    expect(result.activeWorkItems).toBe(1);
    expect(result.pendingWorkItems).toBe(1);
    expect(result.utilizationPercent).toBe(50);
    expect(result.status).toBe("available");
  });

  it("weights active complexity and reports missing required skills", () => {
    const result = executeGetAgentCapacity({
      agentStore: { getAgentBySlugOrId: () => ({ id: "qa", slug: "qa", parentId: null }), listAllAgents: () => [] },
      pmStore: { listAllWorkItems: () => [{ assigneeAgentId: "qa", status: "in_progress", complexity: { filesUsed: 6, scriptsUsed: 2 }, jobId: "job-1" }] },
      store: { getJob: () => ({ status: "running" }) },
      skillStore: { listAgentSkills: () => ["qa-testing"] },
    } as any, { agent_slug: "qa", include_subordinates: false, capacity_limit: 2, required_skills: ["qa-testing", "security-review"] });

    expect(result.loadPoints).toBe(4);
    expect(result.activeJobs).toBe(1);
    expect(result.missingSkills).toEqual(["security-review"]);
    expect(result.status).toBe("saturated");
  });
});

import { describe, expect, it } from "vitest";
import { executeReportRisk, executeUpdateRisk } from "../../src/agents/runtime/tools/risks.js";

function context() {
  const entries = new Map<string, any>();
  const journalStore = {
    append(input: any) {
      const record = { id: "risk-1", ...input };
      entries.set(record.id, record);
      return record;
    },
    getById(id: string) { return entries.get(id); },
  };
  return {
    agentStore: { getAgentBySlugOrId: (slug: string) => ({ id: slug, slug }) },
    store: {
      getProject: (id: string) => id === "project-1" ? { id, projectLeadAgentId: "lead" } : undefined,
      getProjectBySlug: () => undefined,
    },
    pmStore: {
      getWorkItem: (id: string) => ({ id, projectId: "project-1" }),
      listWorkItemsByProject: () => [{ id: "item-1", projectId: "project-1" }],
    },
    journalStore,
  } as any;
}

describe("risk workflow", () => {
  it("records a risk without blocking the work item", () => {
    const result = executeReportRisk(context(), {
      agent_slug: "qa-agent",
      project_id: "project-1",
      work_item_id: "item-1",
      title: "External API instability",
      description: "The provider may throttle requests during the release window.",
      probability: "medium",
      impact: "high",
      mitigation: "Add retry and fallback behavior.",
    });
    expect(result.status).toBe("open");
    expect(result.message).toMatch(/without blocking/);
  });

  it("records an explicit risk outcome", () => {
    const ctx = context();
    executeReportRisk(ctx, {
      agent_slug: "qa-agent",
      project_id: "project-1",
      title: "External API instability",
      description: "The provider may throttle requests during the release window.",
      probability: "medium",
      impact: "high",
    });
    const result = executeUpdateRisk(ctx, {
      agent_slug: "lead",
      project_id: "project-1",
      risk_id: "risk-1",
      action: "mitigate",
      outcome: "Retry and fallback behavior was implemented and verified.",
    });
    expect(result.status).toBe("mitigated");
  });
});

import { describe, expect, it } from "vitest";
import { executeApprovePlan } from "../../src/agents/runtime/tools/plan-approval.js";

describe("persisted plan approval", () => {
  it("records approval only for an authorized planning agent", () => {
    const approvals: unknown[] = [];
    const ctx = {
      agentStore: { getAgentBySlugOrId: () => ({ id: "lead-1" }) },
      skillStore: { listAgentSkills: () => ["system-delegation"] },
      store: { recordPlanApproval: (approval: unknown) => approvals.push(approval) },
    } as any;
    expect(executeApprovePlan(ctx, { agent_slug: "lead", project_slug: "demo", approval_reference: "plan-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" }).status).toBe("approved");
    expect(approvals).toHaveLength(1);
  });
});

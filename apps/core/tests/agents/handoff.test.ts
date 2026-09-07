import { describe, expect, it } from "vitest";
import { executeAcceptHandoff, executeRequestHandoff, executeResolveHandoff } from "../../src/agents/runtime/tools/handoff.js";

describe("structured handoff", () => {
  it("requires acceptance by the proposed owner", () => {
    const entries = new Map<string, any>();
    const ctx = {
      agentStore: { getAgentBySlugOrId: (slug: string) => ({ id: slug, slug }) },
      pmStore: {
        getWorkItem: () => ({ id: "item-1", projectId: "project-1", parentId: null, title: "Ship feature" }),
        updateWorkItem: (_id: string, patch: any) => ({ id: "item-1", assigneeAgentId: patch.assigneeAgentId }),
      },
      journalStore: {
        append: (input: any) => {
          const entry = { id: `entry-${entries.size + 1}`, ...input };
          entries.set(entry.id, entry);
          return entry;
        },
        getById: (id: string) => entries.get(id),
        listForWorkItem: () => [...entries.values()],
      },
    } as any;

    const requested = executeRequestHandoff(ctx, {
      agent_slug: "frontend",
      work_item_id: "item-1",
      new_owner_agent_slug: "qa",
      summary: "Implementation is ready for verification.",
      decisions: "Use the existing integration boundary.",
      evidence: "Tests pass in the frontend package.",
      risks: "Browser coverage remains pending.",
      next_action: "Run the browser checks and report findings.",
    });

    expect(requested.status).toBe("requested");
    expect(() => executeAcceptHandoff(ctx, { agent_slug: "frontend", handoff_id: requested.handoffId, acknowledgement: "I accept." })).toThrow(/proposed new owner/);
    const accepted = executeAcceptHandoff(ctx, { agent_slug: "qa", handoff_id: requested.handoffId, acknowledgement: "I reviewed the context and will run browser checks." });
    expect(accepted.status).toBe("accepted");
    expect(accepted.ownerAgentId).toBe("qa");
  });

  it("is idempotent and supports explicit rejection", () => {
    const entries = new Map<string, any>();
    const ctx = {
      agentStore: { getAgentBySlugOrId: (slug: string) => ({ id: slug, slug }) },
      pmStore: { getWorkItem: () => ({ id: "item-1", projectId: "project-1", parentId: null, title: "Ship feature" }) },
      journalStore: {
        append: (input: any) => { const entry = { id: `entry-${entries.size + 1}`, ...input }; entries.set(entry.id, entry); return entry; },
        getById: (id: string) => entries.get(id),
        listForWorkItem: () => [...entries.values()],
      },
    } as any;
    const first = executeRequestHandoff(ctx, { agent_slug: "frontend", work_item_id: "item-1", new_owner_agent_slug: "qa", summary: "Ready.", decisions: "Keep boundary.", evidence: "Checks pass.", risks: "Coverage pending.", next_action: "Run QA." });
    const duplicate = executeRequestHandoff(ctx, { agent_slug: "frontend", work_item_id: "item-1", new_owner_agent_slug: "qa", summary: "Different wording.", decisions: "Keep boundary.", evidence: "Checks pass.", risks: "Coverage pending.", next_action: "Run QA." });
    expect(duplicate).toMatchObject({ handoffId: first.handoffId, idempotent: true });
    expect(executeResolveHandoff(ctx, { agent_slug: "qa", handoff_id: first.handoffId, action: "reject", reason: "QA scope is not available this cycle." }).status).toBe("rejected");
  });
});

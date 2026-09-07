import { describe, expect, it } from "vitest";
import { executeGetReportingStatus } from "../../src/agents/runtime/tools/journal-tools.js";

describe("reporting projection", () => {
  it("keeps superior journal, private memory, and wiki evidence distinct", () => {
    const result = executeGetReportingStatus({
      agentStore: { getAgentBySlugOrId: () => ({ id: "agent-1" }) },
      pmStore: { getWorkItem: () => ({ id: "item-1", projectId: "project-1", updatedAt: "2026-01-01T00:00:00.000Z" }) },
      journalStore: { listForWorkItem: () => [{ kind: "completion_report", fromAgentId: "agent-1" }] },
      memoryStore: { list: () => [{ workItemId: "item-1" }] },
      wikiStore: { listPagesByProject: () => [{ status: "published", updatedAt: "2026-01-02T00:00:00.000Z" }] },
    } as any, { agent_slug: "qa", project_id: "project-1", work_item_id: "item-1", require_wiki_sync: true });

    expect(result.readyForClosure).toBe(true);
    expect(result.superiorJournal.completionReport).toBe(true);
    expect(result.privateMemory.present).toBe(true);
    expect(result.sharedWiki.synchronized).toBe(true);
  });
});

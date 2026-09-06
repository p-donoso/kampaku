import { afterEach, describe, expect, it, vi } from "vitest";
import { approvePlan, getReportingStatus, revokePlanApproval } from "./api";

describe("approval and reporting API surface", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the shared endpoints and field names", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ok: true, readyForClosure: false, missing: ["wiki_sync"] }), { status: 200 }));
    await approvePlan({ agent_slug: "lead", project_slug: "demo", approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
    await revokePlanApproval({ agent_slug: "lead", project_slug: "demo", approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
    await getReportingStatus("item/1", { agentSlug: "lead", projectId: "project-1", requireWikiSync: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/plans/approve",
      "/api/v1/plans/revoke",
      "/api/v1/work-items/item%2F1/reporting-status?agent_slug=lead&project_id=project-1&require_wiki_sync=true",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
  });
});

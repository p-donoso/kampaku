import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { CoreClient } from "../../src/client/core-client.js";
import { registerPlansCommand } from "../../src/cli/commands/plans.js";

describe("approval and reporting surface parity", () => {
  it("maps client operations to the shared HTTP contract", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new CoreClient({
      baseUrl: "http://test",
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify({ ok: true, readyForClosure: true, missing: [] }), { status: 200 });
      },
    });
    await client.approvePlan({ agent_slug: "lead", project_slug: "demo", approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
    await client.revokePlanApproval({ agent_slug: "lead", project_slug: "demo", approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
    await client.getReportingStatus("item/1", "lead", "project-1", true);
    expect(requests.map((request) => request.url)).toEqual([
      "http://test/api/v1/plans/approve",
      "http://test/api/v1/plans/revoke",
      "http://test/api/v1/work-items/item%2F1/reporting-status?agent_slug=lead&project_id=project-1&require_wiki_sync=true",
    ]);
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({ approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ approval_reference: "ref-1", plan_fingerprint: "fp-1", plan_content_hash: "hash-1" });
  });

  it("registers approval lifecycle and reporting commands in the CLI", () => {
    const program = new Command();
    registerPlansCommand(program);
    const plans = program.commands.find((command) => command.name() === "plans");
    expect(plans?.commands.map((command) => command.name())).toEqual(["approve", "revoke", "reporting-status"]);
    expect(plans?.commands.find((command) => command.name() === "reporting-status")?.options.map((option) => option.long)).toEqual(["--agent", "--project", "--require-wiki-sync"]);
  });
});

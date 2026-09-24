import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { KAMPAKU_AGENT_ID } from "../../src/agents/definitions.js";
import {
  GET_PROJECT_TOOL,
  executeGetProject,
} from "../../src/agents/runtime/tools/get-project.js";
import { executeCreateProject } from "../../src/agents/runtime/tools/create-project.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * The container's identity, readable by the agent that has to report it.
 *
 * Baseline run 4, prompt 4 — `Show me the container from the command line and confirm its id, owner,
 * and repository path` — was answered with *"The Kampaku project is currently active, and there are no
 * open work items, documents, or milestones to report at this time."*
 *
 * That reply was **not** a fabrication. The turn called `get_project`, the only project-detail tool the
 * front office holds, and summarised what came back faithfully. The defect was here: the tool mapped a
 * full `ProjectRecord` down to `{ slug, name, description, status }`, discarding `id`,
 * `projectLeadAgentId` and `repositories` — the three fields the operator asked to confirm
 * ([BOARD F-030](../../../../docs/eval/results/BOARD.md)).
 *
 * Four runs of suite 01 were spent tuning what the model *says* about information no tool on its
 * allowlist returned. These tests are the lock that keeps that from recurring, and they check the two
 * halves separately: the data is present, and it is present in a form a person can act on.
 */
describe("get_project container identity", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  /** A container with an accountable lead and one linked repository, which is what the prompt asks about. */
  function projectWithOwnerAndRepo() {
    context = createTestContext("kampaku-get-project-identity-");
    const { ctx, agentStore, dir } = (() => {
      const c = context!;
      return { ctx: c.toolContext, agentStore: c.agentStore, dir: c.dataDir };
    })();
    const lead = agentStore.createSubAgent({
      slug: "intake-demo-lead",
      name: "Intake Demo Lead",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Lead the work order",
      systemPrompt: "Lead",
    });
    const repoPath = join(dir, "repos", "intake-demo");
    mkdirSync(repoPath, { recursive: true });
    executeCreateProject(ctx, {
      name: "intake-demo",
      project_lead_slug: lead.slug,
      repositories: [{ url: `file://${repoPath}`, role: "web" }],
    });
    return { ctx, repoPath, leadSlug: lead.slug };
  }

  it("returns the container id, which the durable-state block does not carry", () => {
    const { ctx } = projectWithOwnerAndRepo();

    const result = executeGetProject(ctx, { project_slug_or_id: "intake-demo" });

    expect(result.project.id).toBeTruthy();
    // A uuid, not a slug: the operator asked for the id, and the slug is a different field.
    expect(result.project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.project.slug).toBe("intake-demo");
  });

  /**
   * The owner as a **slug**. An agent uuid cannot be confirmed by a person reading a reply, and the
   * durable-state block renders exactly that uuid (`lead=0d46998a`), which is half of why the operator's
   * question was unanswerable from the block.
   */
  it("resolves the accountable owner to a slug, not an agent id", () => {
    const { ctx, leadSlug } = projectWithOwnerAndRepo();

    const result = executeGetProject(ctx, { project_slug_or_id: "intake-demo" });

    expect(result.project.projectLeadSlug).toBe(leadSlug);
    expect(result.project.projectLeadSlug).not.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns repository urls, not the count the block renders", () => {
    const { ctx, repoPath } = projectWithOwnerAndRepo();

    const result = executeGetProject(ctx, { project_slug_or_id: "intake-demo" });

    expect(result.project.repositories).toEqual([
      { url: `file://${repoPath}`, role: "web" },
    ]);
    // The count is what the block carries; a count cannot answer "confirm the repository path".
    expect(typeof result.project.repositories).not.toBe("number");
  });

  it("reports a container with no owner as having none, rather than omitting the field", () => {
    context = createTestContext("kampaku-get-project-identity-");
    const ctx = context.toolContext;
    // A container written directly through the store, which is the only way to get an unowned one now
    // that `create_project` refuses to make them (BOARD F-005). The field must still be present: a
    // missing key and a null owner are different answers to "who owns this".
    ctx.store.createProject({
      id: "00000000-0000-4000-8000-0000000000ff",
      slug: "orphan",
      name: "orphan",
      status: "planning",
      repositories: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = executeGetProject(ctx, { project_slug_or_id: "orphan" });

    expect(result.project.projectLeadSlug).toBeNull();
    expect(result.project.repositories).toEqual([]);
  });

  it("advertises the identity in its own description, so the model is told before it calls", () => {
    const schema = JSON.stringify(GET_PROJECT_TOOL);

    expect(GET_PROJECT_TOOL.function.description).toContain("id, slug, status");
    expect(GET_PROJECT_TOOL.function.description).toMatch(/accountable lead as a slug/);
    expect(GET_PROJECT_TOOL.function.description).toMatch(/linked repository urls/);
    // And no field was silently renamed out of the contract: the caller still passes a slug or id.
    expect(schema).toContain("project_slug_or_id");
  });
});

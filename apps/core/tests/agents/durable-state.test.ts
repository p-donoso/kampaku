import { describe, expect, it } from "vitest";
import {
  renderDurableState,
  resolveLeadSlug,
  type DurableStateSnapshot,
} from "../../src/agents/runtime/durable-state.js";

/**
 * The block exists because the agent refused to plan for four consecutive turns, citing a planning
 * blocker by id, while that blocker was **gone from every durable store** and the agent made **no tool
 * call** to check. It was quoting its own earlier reply, which the conversation replays as history.
 *
 * So the two properties that matter are: the block carries the real entities, and it states that it
 * outranks anything the model remembers saying.
 */
describe("renderDurableState", () => {
  const snapshot = (overrides: Partial<DurableStateSnapshot> = {}): DurableStateSnapshot => ({
    activeProject: null,
    projects: [],
    agents: [],
    questionsAwaitingEmperor: 0,
    questionsAwaitingAgent: 0,
    pendingBlockers: 0,
    workItemsByProject: {},
    ...overrides,
  });

  it("states the precedence rule explicitly, so a stale claim cannot outrank the stores", () => {
    const text = renderDurableState(snapshot());
    expect(text).toContain("THIS BLOCK WINS");
    expect(text).toContain("do not repeat the earlier claim");
  });

  it("tells the model to check here before claiming something is blocked or missing", () => {
    const text = renderDurableState(snapshot());
    expect(text).toContain("check it here first");
    expect(text).toContain("call a tool to read it");
  });

  it("lists the projects that exist, with their lead and repository count", () => {
    const text = renderDurableState(
      snapshot({
        projects: [{ slug: "voice-language-trainer", status: "planning", lead: null, repositories: 1 }],
        workItemsByProject: { "voice-language-trainer": 0 },
      }),
    );
    expect(text).toContain("voice-language-trainer [planning] lead=none repositories=1 workItems=0");
  });

  it("says (none) rather than printing an empty list", () => {
    expect(renderDurableState(snapshot())).toContain("Projects:\n  (none)");
  });

  it("reports the pending counts, which is what the stale blocker claim contradicted", () => {
    const text = renderDurableState(snapshot({ pendingBlockers: 0 }));
    expect(text).toContain("Pending blockers: 0.");
    expect(text).toContain("Pending questions: 0 total.");
  });

  it("splits questions awaiting the emperor from questions awaiting an agent", () => {
    const text = renderDurableState(snapshot({ questionsAwaitingEmperor: 1, questionsAwaitingAgent: 2 }));
    expect(text).toContain("Pending questions: 3 total.");
  });

  /**
   * The first baseline run failed here. Asked `what teams exist`, the block had no answer, the agent
   * called no tool, and it invented a five-role web roster while nine agents existed (BOARD F-025). A
   * question about the staff is as ordinary as one about projects, so the block carries both.
   */
  it("lists the agents that exist, with who they report to", () => {
    const text = renderDurableState(
      snapshot({
        agents: [
          { slug: "kampaku-manager", parent: "kampaku", source: "bootstrap" },
          { slug: "kampaku", parent: null, source: "builtin" },
        ],
      }),
    );

    expect(text).toContain("Agents: 2 total.");
    expect(text).toContain("kampaku-manager (reports to kampaku)");
    expect(text).toContain("kampaku (top level)");
  });

  it("says (none) for agents rather than printing an empty list", () => {
    expect(renderDurableState(snapshot())).toContain("Agents: 0 total.");
  });

  /**
   * Baseline run 2 created `intake-demo` with `lead=none` and called it "created successfully". The
   * tool now refuses to create one (see `create-project.test.ts`), and this is the second half: if an
   * unowned container exists by any other path, the block says so instead of letting it look open.
   */
  it("names a container with no accountable owner as not an open work order", () => {
    const text = renderDurableState(
      snapshot({
        projects: [
          { slug: "intake-demo", status: "planning", lead: null, repositories: 1 },
          { slug: "kampaku", status: "active", lead: "kampaku-manager", repositories: 4 },
        ],
        workItemsByProject: { "intake-demo": 0, kampaku: 0 },
      }),
    );

    expect(text).toMatch(/not an open work order: intake-demo/);
    expect(text).toMatch(/link a lead before treating the work order as open/i);
    // Only the unowned one is named, not the whole list.
    expect(text).not.toMatch(/not an open work order: intake-demo, kampaku/);
  });

  /**
   * Measured in run 7: the block rendered `lead=fdf2b892-382f-46cd-b12f-ab3e437e8f9d` and the reply
   * echoed that uuid as the project's owner, because it was the only form the block offered. An
   * operator cannot confirm an opaque id.
   */
  it("renders the lead as a slug when the agent is resolvable", () => {
    const agentStore = { getAgentBySlugOrId: () => ({ slug: "kampaku-manager" }) };
    const resolved = resolveLeadSlug(agentStore, "fdf2b892-382f-46cd-b12f-ab3e437e8f9d");

    expect(resolved).toBe("kampaku-manager");
    expect(resolved).not.toContain("-".repeat(1) + "382f");
  });

  it("falls back to the id rather than dropping the owner when it cannot be resolved", () => {
    // A stale id is still better than `lead=none`: it says a lead is recorded, and the unowned-container
    // rule must not fire for a project that has one.
    const agentStore = { getAgentBySlugOrId: () => undefined };
    expect(resolveLeadSlug(agentStore, "fdf2b892-382f-46cd-b12f-ab3e437e8f9d")).toBe(
      "fdf2b892-382f-46cd-b12f-ab3e437e8f9d",
    );
  });

  /**
   * F-041: the block listed every project and said nothing about which one "this project" meant.
   *
   * Measured in the suite-03 run: asked *"what aspects of this project did you staff for?"* against a
   * conversation scoped to `s3-infra`, the reply answered about `kampaku` — a different project. A pronoun
   * with no referent in the authoritative block gets resolved by guessing.
   */
  it("names the project the conversation is about, so a pronoun has a referent", () => {
    const text = renderDurableState(
      snapshot({
        activeProject: { slug: "s3-infra", id: "f4a663fe-0000-4000-8000-000000000000" },
        projects: [
          { slug: "s3-infra", status: "planning", lead: "infra-lead", repositories: 1 },
          { slug: "kampaku", status: "active", lead: "kampaku-manager", repositories: 4 },
        ],
        workItemsByProject: { "s3-infra": 0, kampaku: 0 },
      }),
    );

    expect(text).toContain("This conversation is about project s3-infra");
    // And it is named before the list, so the list reads as context rather than as a menu to choose from.
    expect(text.indexOf("This conversation is about project s3-infra")).toBeLessThan(
      text.indexOf("s3-infra [planning]"),
    );
  });

  it("says explicitly when no project is bound, instead of leaving a pronoun resolvable", () => {
    const text = renderDurableState(
      snapshot({ projects: [{ slug: "kampaku", status: "active", lead: null, repositories: 1 }] }),
    );

    expect(text).toContain("This conversation is not scoped to a project");
    expect(text).toMatch(/ask which one/);
    expect(text).not.toMatch(/This conversation is about project/);
  });

  it("stays silent when every container has an owner", () => {
    const text = renderDurableState(
      snapshot({
        projects: [{ slug: "kampaku", status: "active", lead: "kampaku-manager", repositories: 4 }],
        workItemsByProject: { kampaku: 0 },
      }),
    );

    expect(text).not.toMatch(/accountable owner/i);
  });

  it("requires an inventory answer to come from the block or a tool, never from recollection", () => {
    const text = renderDurableState(snapshot());
    expect(text).toMatch(/never from recollection/i);
    expect(text).toMatch(/read it with a tool or say that you have not read it/i);
  });
});

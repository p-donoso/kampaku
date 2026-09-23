import { describe, expect, it } from "vitest";
import { renderDurableState, type DurableStateSnapshot } from "../../src/agents/runtime/durable-state.js";

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
    projects: [],
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
});

import { describe, expect, it } from "vitest";
import { answerOutcomeFor, describeAnswerOutcome } from "../../src/cli/questions-output.js";

/**
 * The CLI is the operator's canonical record, so it must not claim a resumption that did not happen.
 *
 * Two defects, measured a month apart on the same surface:
 *
 * 1. The message was a constant — *"Answer recorded. Sprint resumed when no other questions remain."* — printed
 *    for every answer, including questions with no project and no work item, which is every question the root
 *    agent asks from chat. The operator answered, was told the sprint resumed, and nothing resumed.
 * 2. The message was then derived **locally**, from the stored record's `projectId`, while the answer route was
 *    deriving it from the project's execution gate *after* the answer. Measured 2026-10-21 on suite 10's run
 *    `s10r4`: the route answered *"The project is still gated: 1 pending question."* and the CLI printed *"The
 *    project will resume if no other questions remain."* for the same answer (BOARD F-007).
 *
 * So the lock is on the CLI's own rule: **the route's sentence wins**, and only its absence falls back to the
 * scoped sentence.
 */
describe("the CLI states what actually resumed", () => {
  it("prints the platform's sentence when the route supplied one", () => {
    // The measured shape: the answer cleared one gate and a second was still pending.
    const printed = answerOutcomeFor({
      outcome: "Answer recorded. The project is still gated: 1 pending question.",
      projectId: "712a1a0e-c942-4d02-91f1-c74960a86880",
    });
    expect(printed).toBe("Answer recorded. The project is still gated: 1 pending question.");
    expect(printed).not.toContain("will resume");
  });

  it("falls back to the scoped sentence when the route did not supply one", () => {
    expect(answerOutcomeFor({ projectId: "712a1a0e", outcome: "   " })).toContain("project will resume");
    expect(answerOutcomeFor({ workItemId: "9573a5ce" })).toContain("work item will resume");
  });

  it("says nothing resumed when the question has no project or work item", () => {
    for (const answer of [{}, { projectId: null, workItemId: null }]) {
      const message = answerOutcomeFor(answer);
      expect(message).toContain("Answer recorded");
      expect(message).toContain("nothing was resumed");
      // It must name the way forward, since nothing advanced on its own.
      expect(message).toContain("chat turn");
      expect(message).not.toContain("sprint resumed");
    }
    expect(describeAnswerOutcome({})).toContain("nothing was resumed");
  });
});

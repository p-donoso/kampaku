import { describe, expect, it } from "vitest";
import { describeAnswerOutcome } from "../../src/cli/questions-output.js";

/**
 * The CLI is the operator's canonical record, so it must not claim a resumption that did not happen.
 *
 * The previous message was a constant — "Answer recorded. Sprint resumed when no other questions
 * remain." — printed for every answer, including questions with no project and no work item, which is
 * every question the root agent asks from chat. Measured consequence: the operator answered a question,
 * was told the sprint resumed, and nothing resumed at all.
 */
describe("describeAnswerOutcome", () => {
  it("says nothing resumed when the question has no project or work item", () => {
    const message = describeAnswerOutcome({ projectId: null, workItemId: null });
    expect(message).toContain("Answer recorded");
    expect(message).toContain("nothing was resumed");
    // It must tell the operator what to do next, since nothing advanced on its own.
    expect(message).toContain("chat turn");
    expect(message).not.toContain("sprint resumed");
  });

  it("says the project may resume when the question belongs to one", () => {
    const message = describeAnswerOutcome({ projectId: "project-1" });
    expect(message).toContain("The project will resume");
    expect(message).toContain("if no other questions remain");
    expect(message).not.toContain("nothing was resumed");
  });

  it("says the work item may resume when the question belongs to one", () => {
    const message = describeAnswerOutcome({ workItemId: "wi-1" });
    expect(message).toContain("The work item will resume");
  });

  it("handles an empty string id as absent", () => {
    const message = describeAnswerOutcome({ projectId: "", workItemId: "" });
    expect(message).toContain("nothing was resumed");
  });
});

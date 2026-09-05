import { describe, expect, it } from "vitest";
import { formatAsyncQuestionContextRequest, formatContextRequest, formatQuestionAnswer, isQuestionAnswered, parseAssistantMessage } from "./chat-question";

describe("chat question protocol", () => {
  it("extracts a choice question from an assistant message", () => {
    const parsed = parseAssistantMessage(`I need a decision.\n<kampaku-question>{"id":"hosting","type":"single_choice","prompt":"Where do we deploy?","options":["Cloud","Local"]}</kampaku-question>`);
    expect(parsed.text).toBe("I need a decision.");
    expect(parsed.question).toMatchObject({ id: "hosting", type: "single_choice", options: ["Cloud", "Local"] });
  });

  it("leaves malformed question markup visible instead of breaking the chat", () => {
    const content = "<kampaku-question>{bad json}</kampaku-question>";
    expect(parseAssistantMessage(content)).toEqual({ text: content, question: null });
  });

  it("keeps the question identity in answers and context requests", () => {
    const question = { id: "scope", type: "boolean" as const, prompt: "Do we include migration?" };
    expect(formatQuestionAnswer(question, "Yes")).toContain("Do we include migration?");
    expect(formatQuestionAnswer(question, "Yes")).toContain("question_id: scope");
    expect(formatContextRequest(question)).toContain("scope");
    expect(formatContextRequest(question)).toContain("trace its origin");
  });

  it("keeps asynchronous context requests tied to their project and work item", () => {
    const request = formatAsyncQuestionContextRequest({
      id: "question-7",
      prompt: "Do we ship today?",
      askedByAgentSlug: "release-manager",
      projectId: "project-2",
      workItemId: "task-9",
    });
    expect(request).toContain("question_id: question-7");
    expect(request).toContain("Project: project-2");
    expect(request).toContain("Work item: task-9");
    expect(request.toLowerCase()).toContain("do not answer the question for me");
  });

  it("parses text, multiple choice, and boolean questions", () => {
    const text = parseAssistantMessage('<kampaku-question>{"id":"notes","type":"text","prompt":"Any notes?"}</kampaku-question>');
    expect(text.question?.type).toBe("text");

    const multi = parseAssistantMessage('<kampaku-question>{"id":"stack","type":"multiple_choice","prompt":"Pick stacks?","options":["A","B"]}</kampaku-question>');
    expect(multi.question?.type).toBe("multiple_choice");

    const bool = parseAssistantMessage('<kampaku-question>{"id":"go","type":"boolean","prompt":"Ship now?"}</kampaku-question>');
    expect(bool.question?.type).toBe("boolean");
  });

  it("detects when a question has already been answered", () => {
    const messages = [
      { role: "assistant", content: '<kampaku-question>{"id":"hosting","type":"boolean","prompt":"Cloud?"}</kampaku-question>' },
      { role: "user", content: "Answer to question [question_id: hosting] «Cloud?»: Yes" },
    ];
    expect(isQuestionAnswered(messages, "hosting")).toBe(true);
    expect(isQuestionAnswered(messages, "other")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  parseAssistantMessage,
  formatQuestionAnswer,
  formatContextRequest,
  formatAsyncQuestionContextRequest,
  isQuestionAnswered,
  type ChatQuestion,
} from "@/lib/chat-question";

describe("parseAssistantMessage", () => {
  it("returns text without question when none present", () => {
    const content = "Regular chat message without questions";
    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
    expect(result.text).toBe(content);
  });

  it("parses text question", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"text","prompt":"What is your name?","placeholder":"Enter name"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toEqual({
      id: "q1",
      type: "text",
      prompt: "What is your name?",
      placeholder: "Enter name",
      required: true,
    });
  });

  it("parses text question without placeholder", () => {
    const content = `<kampaku-question>
{"id":"q2","type":"text","prompt":"Describe the issue"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question?.type).toBe("text");
    expect(result.question).toHaveProperty("placeholder", undefined);
  });

  it("parses single_choice question", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"single_choice","prompt":"Choose one","options":["A","B","C"]}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toEqual({
      id: "q1",
      type: "single_choice",
      prompt: "Choose one",
      options: ["A", "B", "C"],
      required: true,
    });
  });

  it("parses multiple_choice question", () => {
    const content = `<kampaku-question>
{"id":"q2","type":"multiple_choice","prompt":"Select all","options":["X","Y","Z"]}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toEqual({
      id: "q2",
      type: "multiple_choice",
      prompt: "Select all",
      options: ["X", "Y", "Z"],
      required: true,
    });
  });

  it("parses boolean question with labels", () => {
    const content = `<kampaku-question>
{"id":"q3","type":"boolean","prompt":"Proceed?","trueLabel":"Yes","falseLabel":"No"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toEqual({
      id: "q3",
      type: "boolean",
      prompt: "Proceed?",
      trueLabel: "Yes",
      falseLabel: "No",
      required: true,
    });
  });

  it("parses boolean question without labels", () => {
    const content = `<kampaku-question>
{"id":"q4","type":"boolean","prompt":"Continue?"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question?.type).toBe("boolean");
    expect(result.question).toHaveProperty("trueLabel", undefined);
    expect(result.question).toHaveProperty("falseLabel", undefined);
  });

  it("respects required: false", () => {
    const content = `<kampaku-question>
{"id":"q5","type":"text","prompt":"Optional","required":false}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question?.required).toBe(false);
  });

  it("defaults required to true when not specified", () => {
    const content = `<kampaku-question>
{"id":"q6","type":"text","prompt":"Test"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question?.required).toBe(true);
  });

  it("strips question tag from text", () => {
    const content = `Before text
<kampaku-question>
{"id":"q1","type":"text","prompt":"Test"}
</kampaku-question>
After text`;

    const result = parseAssistantMessage(content);

    expect(result.text).toBe("Before text\n\nAfter text");
  });

  it("handles escaped JSON from models", () => {
    const content = `<kampaku-question>
{\\"id\\":\\"q1\\",\\"type\\":\\"text\\",\\"prompt\\":\\"Test\\"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question?.id).toBe("q1");
  });

  it("returns null for malformed JSON", () => {
    const content = "<kampaku-question>Not valid JSON</kampaku-question>";
    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });

  it("returns null for missing id", () => {
    const content = `<kampaku-question>
{"type":"text","prompt":"Test"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });

  it("returns null for missing prompt", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"text"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });

  it("returns null for invalid choice options (less than 2)", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"single_choice","prompt":"Test","options":["A"]}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });

  it("returns null for invalid choice options (non-string)", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"single_choice","prompt":"Test","options":["A",123]}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });

  it("returns null for choice options with empty strings", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"single_choice","prompt":"Test","options":["A","  "]}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });

  it("returns null for unknown question type", () => {
    const content = `<kampaku-question>
{"id":"q1","type":"unknown","prompt":"Test"}
</kampaku-question>`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });
});

describe("formatQuestionAnswer", () => {
  it("formats text answer", () => {
    const question: ChatQuestion = { id: "q1", type: "text", prompt: "Name?", required: true };
    const result = formatQuestionAnswer(question, "John");

    expect(result).toBe('Answer to question [question_id: q1] «Name?»: John');
  });

  it("formats single choice answer", () => {
    const question: ChatQuestion = { id: "q2", type: "single_choice", prompt: "Choose", options: ["A", "B"], required: true };
    const result = formatQuestionAnswer(question, "A");

    expect(result).toBe('Answer to question [question_id: q2] «Choose»: A');
  });

  it("formats multiple choice answer", () => {
    const question: ChatQuestion = { id: "q3", type: "multiple_choice", prompt: "Select", options: ["X", "Y"], required: true };
    const result = formatQuestionAnswer(question, ["X", "Y"]);

    expect(result).toBe('Answer to question [question_id: q3] «Select»: X, Y');
  });

  it("formats boolean answer", () => {
    const question: ChatQuestion = { id: "q4", type: "boolean", prompt: "Ok?", required: true };
    const result = formatQuestionAnswer(question, "true");

    expect(result).toBe('Answer to question [question_id: q4] «Ok?»: true');
  });
});

describe("formatContextRequest", () => {
  it("formats context request for question", () => {
    const question: ChatQuestion = { id: "q1", type: "text", prompt: "What should we do?", required: true };
    const result = formatContextRequest(question);

    expect(result).toContain("I do not have enough context");
    expect(result).toContain("What should we do?");
    expect(result).toContain("question_id: q1");
    expect(result).toContain("trace its origin");
    expect(result).toContain("using the same <kampaku-question> object");
  });
});

describe("formatAsyncQuestionContextRequest", () => {
  it("formats full async request with all fields", () => {
    const result = formatAsyncQuestionContextRequest({
      id: "q1",
      prompt: "Should we proceed?",
      context: "Initial discussion in planning",
      askedByAgentSlug: "planner-agent",
      projectId: "proj-123",
      workItemId: "task-456",
    });

    expect(result).toContain("[question_id: q1]");
    expect(result).toContain("Should we proceed?");
    expect(result).toContain("Asked by planner-agent");
    expect(result).toContain("Project: proj-123");
    expect(result).toContain("Work item: task-456");
    expect(result).toContain("Initial context: Initial discussion in planning");
    expect(result).toContain("Trace its origin");
  });

  it("formats async request without optional fields", () => {
    const result = formatAsyncQuestionContextRequest({
      id: "q2",
      prompt: "Clarify requirement?",
      askedByAgentSlug: "dev-agent",
    });

    expect(result).toContain("[question_id: q2]");
    expect(result).toContain("Asked by dev-agent");
    expect(result).not.toContain("Project:");
    expect(result).not.toContain("Work item:");
    expect(result).not.toContain("Initial context:");
  });

  it("formats async request with only projectId", () => {
    const result = formatAsyncQuestionContextRequest({
      id: "q3",
      prompt: "Test?",
      askedByAgentSlug: "agent",
      projectId: "proj-1",
    });

    expect(result).toContain("Project: proj-1");
    expect(result).not.toContain("Work item:");
  });

  it("formats async request with only workItemId", () => {
    const result = formatAsyncQuestionContextRequest({
      id: "q4",
      prompt: "Test?",
      askedByAgentSlug: "agent",
      workItemId: "task-1",
    });

    expect(result).toContain("Work item: task-1");
    expect(result).not.toContain("Project:");
  });
});

describe("isQuestionAnswered", () => {
  it("returns true when answer is present", () => {
    const messages = [
      { role: "assistant", content: "Question?" },
      { role: "user", content: "Answer to question [question_id: q1] «Test?»: Yes" },
    ];

    expect(isQuestionAnswered(messages, "q1")).toBe(true);
  });

  it("returns false when answer is not present", () => {
    const messages = [
      { role: "assistant", content: "Question?" },
      { role: "user", content: "Some other message" },
    ];

    expect(isQuestionAnswered(messages, "q1")).toBe(false);
  });

  it("returns false for empty message list", () => {
    expect(isQuestionAnswered([], "q1")).toBe(false);
  });

  it("ignores assistant messages", () => {
    const messages = [
      { role: "assistant", content: "Answer to question [question_id: q1]: response" },
    ];

    expect(isQuestionAnswered(messages, "q1")).toBe(false);
  });

  it("finds answer among multiple messages", () => {
    const messages = [
      { role: "user", content: "First message" },
      { role: "assistant", content: "Question?" },
      { role: "user", content: "Answer to question [question_id: q5] «Test»: reply" },
      { role: "user", content: "Follow-up" },
    ];

    expect(isQuestionAnswered(messages, "q5")).toBe(true);
  });
});

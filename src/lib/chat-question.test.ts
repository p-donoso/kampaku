import { describe, expect, it } from "vitest";
import { formatAsyncQuestionContextRequest, formatContextRequest, formatQuestionAnswer, parseAssistantMessage } from "./chat-question";

describe("chat question protocol", () => {
  it("extracts a choice question from an assistant message", () => {
    const parsed = parseAssistantMessage(`Necesito una decisión.\n<kampaku-question>{"id":"hosting","type":"single_choice","prompt":"¿Dónde desplegamos?","options":["Cloud","Local"]}</kampaku-question>`);
    expect(parsed.text).toBe("Necesito una decisión.");
    expect(parsed.question).toMatchObject({ id: "hosting", type: "single_choice", options: ["Cloud", "Local"] });
  });

  it("leaves malformed question markup visible instead of breaking the chat", () => {
    const content = "<kampaku-question>{bad json}</kampaku-question>";
    expect(parseAssistantMessage(content)).toEqual({ text: content, question: null });
  });

  it("keeps the question identity in answers and context requests", () => {
    const question = { id: "scope", type: "boolean" as const, prompt: "¿Incluimos migración?" };
    expect(formatQuestionAnswer(question, "Sí")).toContain("¿Incluimos migración?");
    expect(formatQuestionAnswer(question, "Sí")).toContain("question_id: scope");
    expect(formatContextRequest(question)).toContain("scope");
    expect(formatContextRequest(question)).toContain("rastrea su origen");
  });

  it("keeps asynchronous context requests tied to their project and work item", () => {
    const request = formatAsyncQuestionContextRequest({
      id: "question-7",
      prompt: "¿Publicamos hoy?",
      askedByAgentSlug: "release-manager",
      projectId: "project-2",
      workItemId: "task-9",
    });
    expect(request).toContain("question_id: question-7");
    expect(request).toContain("Proyecto: project-2");
    expect(request).toContain("Tarea: task-9");
    expect(request.toLowerCase()).toContain("ni la marques como resuelta");
  });
});

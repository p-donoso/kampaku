import { describe, expect, it } from "vitest";
import { parsePendingQuestion } from "../../src/agents/runtime/pending-question.js";

/**
 * Contract parity with `apps/web/src/lib/chat-question.ts`: whatever the web client is
 * willing to render, core must be willing to persist, and nothing else. If these rules
 * drift, a question would be visible in chat but absent from the pending list (or the
 * reverse) — the exact failure LangProbe G-01 describes.
 */
describe("parsePendingQuestion", () => {
  it("parses the question the root agent asked during the LangProbe run", () => {
    const reply = [
      "Necesito tu voto en D1, D5 y D6.",
      '<kampaku-question>{"id":"lingua-d1-d5-d6","type":"multiple_choice",' +
        '"prompt":"Elige combinación base para Phase 1 (podemos iterar después):",' +
        '"options":["Web Speech API","Whisper.cpp WASM"],"required":true}</kampaku-question>',
    ].join("\n");

    const parsed = parsePendingQuestion(reply);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("lingua-d1-d5-d6");
    expect(parsed?.required).toBe(true);
    expect(parsed?.raw).toContain("<kampaku-question>");
  });

  it("returns null for a prose-only reply", () => {
    expect(parsePendingQuestion("Equipo permanente: 9 agentes. Nada creado.")).toBeNull();
  });

  it("returns null for a malformed question object", () => {
    expect(parsePendingQuestion("<kampaku-question>{bad json}</kampaku-question>")).toBeNull();
  });

  it("returns null when a choice question lacks usable options", () => {
    const reply =
      '<kampaku-question>{"id":"x","type":"single_choice","prompt":"Pick?","options":["only one"]}</kampaku-question>';
    expect(parsePendingQuestion(reply)).toBeNull();
  });

  it("returns null for an unknown question type", () => {
    const reply = '<kampaku-question>{"id":"x","type":"ranking","prompt":"Rank?"}</kampaku-question>';
    expect(parsePendingQuestion(reply)).toBeNull();
  });

  it("accepts text and boolean questions and defaults required to true", () => {
    const text = parsePendingQuestion(
      '<kampaku-question>{"id":"notes","type":"text","prompt":"Any notes?"}</kampaku-question>',
    );
    expect(text?.required).toBe(true);

    const bool = parsePendingQuestion(
      '<kampaku-question>{"id":"go","type":"boolean","prompt":"Ship now?"}</kampaku-question>',
    );
    expect(bool?.required).toBe(true);
  });

  it("honours an explicit required: false", () => {
    const parsed = parsePendingQuestion(
      '<kampaku-question>{"id":"opt","type":"text","prompt":"Anything?","required":false}</kampaku-question>',
    );
    expect(parsed?.required).toBe(false);
  });

  it("recovers the JSON-escaped example copied from the system prompt", () => {
    const reply =
      '<kampaku-question>{\\"id\\":\\"escaped\\",\\"type\\":\\"text\\",\\"prompt\\":\\"Which?\\"}</kampaku-question>';
    expect(parsePendingQuestion(reply)?.id).toBe("escaped");
  });
});

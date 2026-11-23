import { describe, expect, it } from "vitest";
import { noteUnreadableQuestion, parsePendingQuestion } from "../../src/agents/runtime/pending-question.js";

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

/**
 * **A question tag that does not parse is not a gate, and it must not be left looking like one.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r17`. The scope-discipline turn answered *"Name the project and I
 * will park both rows"* and closed with
 *
 * ```
 * <kampaku-question>{"id":"expansion-target-project","type":"single_choice","prompt":"Which repository …?",
 * options:["legacy-ledger","kampaku"],"required":true}</kampaku-question>
 * ```
 *
 * — `options` unquoted, so `JSON.parse` threw, `parsePendingQuestion` answered `null`, and no question was
 * stored. `GET /api/v1/questions` held nothing and `GET /api/v1/scope-requests` held nothing, while the reply
 * the emperor read carried the markup. The store-declines branch (BOARD F-111) replaces the tag; this one was
 * never offered to the store at all, so the operator was left reading broken JSON and concluding the console
 * had glitched.
 */
describe("a question tag that could not be read (suite 19 / s19r17)", () => {
  const unquoted =
    '<kampaku-question>{"id":"expansion-target-project","type":"single_choice",' +
    '"prompt":"Which repository should be restructured and have its build modernized?",' +
    'options:["legacy-ledger","kampaku"],"required":true}</kampaku-question>';

  it("says no gate was opened instead of rendering the block", () => {
    const reply = noteUnreadableQuestion(`## Two things before this can be parked\n\nName the project.\n\n${unquoted}`);
    // The notice may *name* the tag; what must not survive is a tag a surface could try to render.
    expect(reply).not.toMatch(/<kampaku-question>[\s\S]*?<\/kampaku-question>/);
    expect(reply, "the operator must be told the decision is nowhere").toMatch(/no gate was opened/i);
    expect(reply).toMatch(/Nothing was parked, approved or refused/);
    expect(reply, "the reasoning is kept").toContain("Name the project.");
  });

  it("leaves a well-formed tag alone", () => {
    const good =
      '<kampaku-question>{"id":"expansion-target-project","type":"single_choice",' +
      '"prompt":"Which repository?","options":["a","b"],"required":true}</kampaku-question>';
    expect(noteUnreadableQuestion(`Text\n${good}`)).toContain("<kampaku-question>");
  });

  it("leaves a reply with no tag alone", () => {
    expect(noteUnreadableQuestion("Just prose, no decision asked.")).toBe("Just prose, no decision asked.");
  });
});

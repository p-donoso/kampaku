import { describe, it, expect } from "vitest";
import { parseAssistantMessage } from "@/lib/chat-question";

describe("chat question parsing", () => {
  it("returns text without question when none present", () => {
    const content = "Regular chat message without questions";

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
    expect(result.text).toBe(content);
  });

  it("parses structured question with JSON", () => {
    const content = `Some text

<kampaku-question>
{"id":"q1","type":"single_choice","prompt":"What should I do?","options":["Option A","Option B"]}
</kampaku-question>

More text`;

    const result = parseAssistantMessage(content);

    expect(result.question).toBeTruthy();
    expect(result.question?.prompt).toBe("What should I do?");
  });

  it("handles malformed question tags", () => {
    const content = "<kampaku-question>Not valid JSON</kampaku-question>";

    const result = parseAssistantMessage(content);

    expect(result.question).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { executeSubmitIntent } from "../../src/agents/runtime/tools/submit-intent.js";

describe("planning approval boundary", () => {
  it("rejects persistence without an explicit lead approval reference", async () => {
    await expect(executeSubmitIntent({} as any, { intent: "Create a project", mode: "apply" })).rejects.toThrow(/approval_reference/);
  });
});

import { describe, expect, it } from "vitest";
import {
  executeSubmitIntent,
  SUBMIT_INTENT_TOOL,
} from "../../src/agents/runtime/tools/submit-intent.js";

describe("planning approval boundary", () => {
  it("advertises every value required to apply an approved preview", () => {
    const parameters = SUBMIT_INTENT_TOOL.function.parameters;

    expect(parameters.properties).toHaveProperty("approval_reference");
    expect(parameters.properties).toHaveProperty("approval_fingerprint");
    expect(parameters.properties).toHaveProperty("approval_content_hash");
  });

  it("rejects persistence without an explicit lead approval reference", async () => {
    await expect(executeSubmitIntent({} as any, { intent: "Create a project", mode: "apply" })).rejects.toThrow(/approval_reference/);
  });
});

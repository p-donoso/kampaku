import { describe, expect, it } from "vitest";
import { negotiateModelCapabilities, providerNeutralProfile } from "../../src/model-broker/model-capabilities.js";

describe("model capabilities", () => {
  it("negotiates required protocol capabilities", () => {
    expect(negotiateModelCapabilities({ toolCalls: true, streaming: true }, { structuredOutput: true, toolCalls: true, streaming: false }).missing).toEqual(["streaming"]);
  });

  it("uses a provider-neutral profile", () => {
    expect(providerNeutralProfile("model-a", { structuredOutput: true, toolCalls: false, streaming: false }).protocol).toBe("openai-v1");
  });
});

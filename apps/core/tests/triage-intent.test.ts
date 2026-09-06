import { describe, expect, it } from "vitest";
import { executeTriageIntent } from "../src/agents/runtime/tools/triage-intent.js";

describe("intent triage", () => {
  it("routes a question without allowing planning", () => {
    const result = executeTriageIntent({
      intent: "Which authentication provider should we use?",
      category: "question",
    });

    expect(result.routing).toMatch(/decision/);
    expect(result.planningAllowed).toBe(false);
    expect(result.message).toMatch(/read-only/);
  });

  it("routes a maintenance request to domain ownership", () => {
    const result = executeTriageIntent({
      intent: "Upgrade the existing dependency and run the regression suite.",
      category: "maintenance",
      project_slug: "kampaku",
      urgency: "normal",
    });

    expect(result.projectSlug).toBe("kampaku");
    expect(result.planningAllowed).toBe(true);
    expect(result.routing).toMatch(/specialist/);
  });

  it("rejects empty intake", () => {
    expect(() => executeTriageIntent({ intent: "short", category: "research" })).toThrow(/10 characters/);
  });
});

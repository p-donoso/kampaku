import { describe, expect, it } from "vitest";
import { compareVisualReferences, validateVisualObservation } from "../../src/application/pm/visual-validation.js";

describe("visual validation", () => {
  it("requires evidence, accessibility, requirements, and metadata", () => {
    expect(validateVisualObservation({ artifact: "screen.png", viewport: { width: 390, height: 844 }, accessibilityChecked: true, requirementRefs: ["req-ui"], metadata: { url: "https://localhost" } }).ok).toBe(true);
  });

  it("reports visual reference differences", () => {
    expect(compareVisualReferences("hash-a", "hash-b").equal).toBe(false);
  });
});

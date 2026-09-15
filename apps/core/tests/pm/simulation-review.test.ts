import { describe, expect, it } from "vitest";
import { dynamicEvidenceSatisfied, needsSimulationReview, scanSimulation } from "../../src/application/pm/simulation-detection.js";

describe("simulation review", () => {
  it("requires review for ambiguous suspected simulation", () => {
    const scan = scanSimulation({ content: "XP: 100" });
    expect(needsSimulationReview(scan)).toBe(true);
    expect(needsSimulationReview(scan, true)).toBe(false);
  });

  it("detects a state change for dynamic evidence", () => {
    expect(dynamicEvidenceSatisfied("locked", "unlocked")).toBe(true);
    expect(dynamicEvidenceSatisfied("same", "same")).toBe(false);
  });
});

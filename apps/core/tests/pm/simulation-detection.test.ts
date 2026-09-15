import { describe, expect, it } from "vitest";
import { scanSimulation } from "../../src/application/pm/simulation-detection.js";

describe("simulation detection", () => {
  it("rejects generic placeholders and static metrics", () => {
    const result = scanSimulation({ content: "Welcome to the demo. XP: 2850" });
    expect(result.suspicious).toBe(true);
    expect(result.reasons.length).toBe(2);
  });

  it("allows explicitly declared fixtures", () => {
    expect(scanSimulation({ content: "Test Button; XP: 100", declaredFixture: true }).suspicious).toBe(false);
  });
});

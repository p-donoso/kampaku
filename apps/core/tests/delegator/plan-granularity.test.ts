import { describe, it, expect } from "vitest";
import {
  parsePlanGranularity,
  resolvePlanGranularity,
  countIntentFeatures,
  complexityBudget,
  granularityPromptBlock,
  GRANULARITY_BUDGETS,
} from "../../src/delegator/plan-granularity.js";

describe("plan-granularity", () => {
  describe("parsePlanGranularity", () => {
    it("returns standard for valid input", () => {
      expect(parsePlanGranularity("standard")).toBe("standard");
    });

    it("returns fine for valid input", () => {
      expect(parsePlanGranularity("fine")).toBe("fine");
    });

    it("returns undefined for invalid input", () => {
      expect(parsePlanGranularity("invalid")).toBeUndefined();
      expect(parsePlanGranularity("")).toBeUndefined();
      expect(parsePlanGranularity(123)).toBeUndefined();
    });
  });

  describe("resolvePlanGranularity", () => {
    it("returns parsed granularity when valid", () => {
      expect(resolvePlanGranularity({ granularity: "fine" })).toBe("fine");
      expect(resolvePlanGranularity({ granularity: "standard" })).toBe("standard");
    });

    it("defaults to fine for new projects", () => {
      expect(resolvePlanGranularity({})).toBe("fine");
      expect(resolvePlanGranularity({ existingProject: false })).toBe("fine");
    });

    it("defaults to standard for existing projects", () => {
      expect(resolvePlanGranularity({ existingProject: true })).toBe("standard");
    });

    it("prefers explicit granularity over project status", () => {
      expect(resolvePlanGranularity({ granularity: "fine", existingProject: true })).toBe("fine");
    });
  });

  describe("countIntentFeatures", () => {
    it("counts feature hints", () => {
      const result = countIntentFeatures("Add login and api endpoints");
      expect(result).toBeGreaterThan(0);
    });

    it("counts and-separated parts", () => {
      const result = countIntentFeatures("feature one and feature two and feature three");
      expect(result).toBeGreaterThan(1);
    });

    it("counts comma-separated parts", () => {
      const result = countIntentFeatures("upload, auth, api");
      expect(result).toBeGreaterThan(1);
    });

    it("returns at least 1", () => {
      expect(countIntentFeatures("")).toBe(1);
      expect(countIntentFeatures("a")).toBe(1);
    });

    it("caps at 12", () => {
      const manyFeatures = Array(20).fill("feature").join(", ");
      expect(countIntentFeatures(manyFeatures)).toBeLessThanOrEqual(12);
    });
  });

  describe("complexityBudget", () => {
    it("calculates budget for standard granularity", () => {
      const result = complexityBudget("Add auth", "standard");
      expect(result.featureCount).toBeGreaterThan(0);
      expect(result.minLeavesPerPhase).toBe(GRANULARITY_BUDGETS.standard.minLeavesPerPhase);
      expect(result.maxLeavesPerPhase).toBe(GRANULARITY_BUDGETS.standard.maxLeavesPerPhase);
      expect(result.targetLeavesPerPhase).toBe(GRANULARITY_BUDGETS.standard.targetLeavesPerPhase);
      expect(result.estimatedPhases).toBeGreaterThanOrEqual(3);
      expect(result.minTotalLeaves).toBeGreaterThan(0);
    });

    it("calculates budget for fine granularity", () => {
      const result = complexityBudget("Add auth", "fine");
      expect(result.minLeavesPerPhase).toBe(GRANULARITY_BUDGETS.fine.minLeavesPerPhase);
      expect(result.maxLeavesPerPhase).toBe(GRANULARITY_BUDGETS.fine.maxLeavesPerPhase);
    });

    it("uses provided phase count", () => {
      const result = complexityBudget("Add auth", "standard", 5);
      expect(result.estimatedPhases).toBe(5);
    });

    it("estimates phases based on intent", () => {
      const simple = complexityBudget("Simple feature", "standard");
      const complex = complexityBudget("auth, api, upload, canvas, test, docs", "standard");
      expect(simple.estimatedPhases).toBeGreaterThanOrEqual(3);
      expect(complex.estimatedPhases).toBeGreaterThanOrEqual(3);
      expect(complex.featureCount).toBeGreaterThan(simple.featureCount);
    });

    it("ensures minTotalLeaves is at least 2x feature count", () => {
      const result = complexityBudget("feature one and feature two", "standard");
      expect(result.minTotalLeaves).toBeGreaterThanOrEqual(result.featureCount * 2);
    });
  });

  describe("granularityPromptBlock", () => {
    it("generates prompt for standard granularity", () => {
      const result = granularityPromptBlock("standard");
      expect(result).toContain("standard");
      expect(result).toContain(GRANULARITY_BUDGETS.standard.targetLeavesPerPhase.toString());
      expect(result).toContain(GRANULARITY_BUDGETS.standard.minLeavesPerPhase.toString());
      expect(result).toContain(GRANULARITY_BUDGETS.standard.maxLeavesPerPhase.toString());
    });

    it("generates prompt for fine granularity", () => {
      const result = granularityPromptBlock("fine");
      expect(result).toContain("fine");
      expect(result).toContain(GRANULARITY_BUDGETS.fine.targetLeavesPerPhase.toString());
    });

    it("includes decomposition guidance", () => {
      const result = granularityPromptBlock("standard");
      expect(result).toContain("decompose");
      expect(result).toContain("leaf");
    });
  });
});

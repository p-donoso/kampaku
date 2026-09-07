import { describe, it, expect } from "vitest";
import { inferRequiresDeliverables } from "../../../src/application/pm/deliverable-requirements.js";

describe("deliverable-requirements", () => {
  describe("inferRequiresDeliverables", () => {
    it("returns true for normal objectives", () => {
      expect(inferRequiresDeliverables("Implement feature X")).toBe(true);
      expect(inferRequiresDeliverables("Fix bug in module Y")).toBe(true);
      expect(inferRequiresDeliverables("Add tests for component")).toBe(true);
    });

    it("returns false for review-only objectives", () => {
      expect(inferRequiresDeliverables("Review only: check the code")).toBe(false);
      expect(inferRequiresDeliverables("This is review only work")).toBe(false);
    });

    it("returns false for read-only objectives", () => {
      expect(inferRequiresDeliverables("Read-only analysis of codebase")).toBe(false);
      expect(inferRequiresDeliverables("Read only: understand the architecture")).toBe(false);
    });

    it("returns false for investigate-only objectives", () => {
      expect(inferRequiresDeliverables("Investigate only: find the bug")).toBe(false);
    });

    it("returns false for analysis-only objectives", () => {
      expect(inferRequiresDeliverables("Analysis only: review performance")).toBe(false);
    });

    it("returns false for no file changes objectives", () => {
      expect(inferRequiresDeliverables("No file changes: just review")).toBe(false);
    });

    it("returns false for no code changes objectives", () => {
      expect(inferRequiresDeliverables("No code changes needed")).toBe(false);
    });

    it("is case insensitive", () => {
      expect(inferRequiresDeliverables("REVIEW ONLY")).toBe(false);
      expect(inferRequiresDeliverables("Read Only")).toBe(false);
    });

    it("handles hyphenated variants", () => {
      expect(inferRequiresDeliverables("read-only task")).toBe(false);
    });

    it("returns true when read-only appears but not as marker", () => {
      expect(inferRequiresDeliverables("Implement readonly property")).toBe(true);
    });
  });
});

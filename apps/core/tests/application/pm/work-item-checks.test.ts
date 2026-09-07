import { describe, it, expect } from "vitest";
import {
  extractAcceptanceCriteriaSection,
  inferRequiredCheckScripts,
  inferRequiredChecksFromWorkItem,
  inferRequiredChecksFromObjective,
  evaluateJobCheckResults,
} from "../../../src/application/pm/work-item-checks.js";

describe("work-item-checks", () => {
  describe("extractAcceptanceCriteriaSection", () => {
    it("extracts section after marker", () => {
      const text = "Do work\n\nAcceptance criteria:\n- Test passes\n- Build succeeds";
      const result = extractAcceptanceCriteriaSection(text);
      expect(result).toContain("Test passes");
      expect(result).toContain("Build succeeds");
    });

    it("returns empty string when marker not found", () => {
      const text = "Do work without criteria";
      expect(extractAcceptanceCriteriaSection(text)).toBe("");
    });

    it("handles marker at start", () => {
      const text = "Acceptance criteria:\n- Check 1";
      const result = extractAcceptanceCriteriaSection(text);
      expect(result).toContain("Check 1");
    });
  });

  describe("inferRequiredCheckScripts", () => {
    it("detects npm run test:e2e", () => {
      expect(inferRequiredCheckScripts("Run npm run test:e2e")).toContain("test:e2e");
    });

    it("detects npm run build", () => {
      expect(inferRequiredCheckScripts("Must pass npm run build")).toContain("build");
    });

    it("detects npm run typecheck", () => {
      expect(inferRequiredCheckScripts("npm run typecheck must pass")).toContain("typecheck");
    });

    it("detects npm run test", () => {
      expect(inferRequiredCheckScripts("npm run test should pass")).toContain("test");
    });

    it("detects npm test shorthand", () => {
      expect(inferRequiredCheckScripts("npm test")).toContain("test");
    });

    it("detects npm run docs:build", () => {
      expect(inferRequiredCheckScripts("npm run docs:build")).toContain("docs:build");
    });

    it("detects multiple scripts", () => {
      const text = "npm run test and npm run build must pass";
      const scripts = inferRequiredCheckScripts(text);
      expect(scripts).toContain("test");
      expect(scripts).toContain("build");
    });

    it("is case insensitive", () => {
      expect(inferRequiredCheckScripts("NPM RUN BUILD")).toContain("build");
    });

    it("returns empty array for no matches", () => {
      expect(inferRequiredCheckScripts("Just do the work")).toEqual([]);
    });

    it("deduplicates scripts", () => {
      const text = "npm run test and npm run test again";
      const scripts = inferRequiredCheckScripts(text);
      expect(scripts.filter(s => s === "test")).toHaveLength(1);
    });
  });

  describe("inferRequiredChecksFromWorkItem", () => {
    it("infers from acceptanceCriteria when present", () => {
      const workItem = {
        title: "Feature",
        acceptanceCriteria: ["npm run test passes", "npm run build succeeds"],
      };
      const checks = inferRequiredChecksFromWorkItem(workItem);
      expect(checks).toContain("test");
      expect(checks).toContain("build");
    });

    it("infers from title and description when no criteria", () => {
      const workItem = {
        title: "Feature",
        description: "Acceptance criteria:\n- npm run typecheck must pass\n- npm run build succeeds",
      };
      const checks = inferRequiredChecksFromWorkItem(workItem);
      expect(checks).toContain("typecheck");
      expect(checks).toContain("build");
    });

    it("looks for criteria marker in objective", () => {
      const workItem = {
        title: "Feature",
        description: "Do work\n\nAcceptance criteria:\n- npm run test must pass",
      };
      const checks = inferRequiredChecksFromWorkItem(workItem);
      expect(checks).toContain("test");
    });

    it("returns empty array when nothing matched", () => {
      const workItem = { title: "Simple feature" };
      expect(inferRequiredChecksFromWorkItem(workItem)).toEqual([]);
    });
  });

  describe("inferRequiredChecksFromObjective", () => {
    it("extracts checks from after criteria marker", () => {
      const objective = "Task\n\nAcceptance criteria:\n- npm run test\n- npm run build";
      const checks = inferRequiredChecksFromObjective(objective);
      expect(checks).toContain("test");
      expect(checks).toContain("build");
    });

    it("returns empty for objective without criteria", () => {
      expect(inferRequiredChecksFromObjective("Simple task")).toEqual([]);
    });
  });

  describe("evaluateJobCheckResults", () => {
    it("returns ok when no checks required", () => {
      const result = evaluateJobCheckResults([], {});
      expect(result.ok).toBe(true);
    });

    it("returns ok when all required checks pass", () => {
      const result = evaluateJobCheckResults(["test", "build"], {
        test: true,
        build: true,
      });
      expect(result.ok).toBe(true);
    });

    it("returns failure when required check fails", () => {
      const result = evaluateJobCheckResults(["test", "build"], {
        test: true,
        build: false,
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("failed");
      expect(result.message).toContain("build");
    });

    it("returns failure when required check missing", () => {
      const result = evaluateJobCheckResults(["test", "build"], {
        test: true,
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("not run");
      expect(result.message).toContain("build");
    });

    it("reports failed over missing", () => {
      const result = evaluateJobCheckResults(["test", "build", "typecheck"], {
        test: false,
        typecheck: true,
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("failed");
      expect(result.message).toContain("test");
    });

    it("handles undefined checkResults", () => {
      const result = evaluateJobCheckResults(["test"], undefined);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("not run");
    });
  });
});

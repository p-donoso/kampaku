import { describe, expect, it } from "vitest";
import {
  evaluateJobCheckResults,
  inferRequiredChecksFromWorkItem,
} from "../../src/application/pm/work-item-checks.js";

describe("work-item-checks", () => {
  it("infers npm scripts from acceptance criteria", () => {
    expect(
      inferRequiredChecksFromWorkItem({
        title: "Green CI",
        acceptanceCriteria: ["npm test passes", "npm run build succeeds"],
      }),
    ).toEqual(expect.arrayContaining(["test", "build"]));
  });

  it("blocks done when required checks missing", () => {
    const result = evaluateJobCheckResults(["test", "build"], { test: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("build");
    }
  });

  it("passes when all required checks ok", () => {
    expect(evaluateJobCheckResults(["test"], { test: true })).toEqual({ ok: true });
  });

  it("ignores npm commands in title/description when AC omits them", () => {
    expect(
      inferRequiredChecksFromWorkItem({
        title: "Canvas tool",
        description: "Run npm run test:e2e before phase 5",
        acceptanceCriteria: ["File exists at src/tools/Rect.tsx", "npm run build exits 0"],
      }),
    ).toEqual(["build"]);
  });
});

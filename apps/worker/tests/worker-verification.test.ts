import { describe, expect, it } from "vitest";
import {
  evaluateRequiredChecks,
  inferRequiredCheckScripts,
  recordCheckResult,
  resolveRequiredCheckScripts,
} from "../src/tools/worker-verification.js";

describe("worker-verification", () => {
  it("infers required scripts from acceptance criteria text", () => {
    const text =
      "AC: npm install && npm test && npm run build && npm run test:e2e all exit 0";
    expect(inferRequiredCheckScripts(text)).toEqual(["test:e2e", "build", "test"]);
  });

  it("requires all inferred scripts to pass", () => {
    const required = ["test", "build"];
    const results = new Map<string, boolean>([["test", true]]);
    expect(evaluateRequiredChecks(required, results)?.message).toContain("build");
  });

  it("fails when a required script was run but failed", () => {
    const required = ["build"];
    const results = new Map<string, boolean>([["build", false]]);
    expect(evaluateRequiredChecks(required, results)?.message).toContain("failed");
  });

  it("records JSON run_check results", () => {
    const results = new Map<string, boolean>();
    recordCheckResult(results, JSON.stringify({ ok: true, script: "test" }));
    expect(results.get("test")).toBe(true);
  });

  it("does not infer test:e2e from planner boilerplate outside acceptance criteria", () => {
    const prompt = [
      "Implement rectangle tool",
      "",
      "Acceptance criteria:",
      "- File exists at src/tools/RectangleTool.tsx",
      "- npm run build exits 0",
      "",
      "When acceptance criteria mention npm scripts by name, run each listed script via run_check.",
    ].join("\n");
    expect(resolveRequiredCheckScripts(prompt)).toEqual(["build"]);
  });

  it("prefers explicit requiredChecks from job input", () => {
    const prompt = "Acceptance criteria:\n- npm run test:e2e passes";
    expect(resolveRequiredCheckScripts(prompt, ["docs:build"])).toEqual(["docs:build"]);
  });
});

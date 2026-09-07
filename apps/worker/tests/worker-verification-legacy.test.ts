import { describe, it, expect } from "vitest";
import { recordCheckResult, inferRequiredCheckScripts, resolveRequiredCheckScripts, evaluateRequiredChecks } from "../src/tools/worker-verification.js";

describe("recordCheckResult with legacy output", () => {
  it("records success when JSON parsing fails but scriptHint is provided", () => {
    const results = new Map<string, boolean>();
    recordCheckResult(results, "plain text output", "test");
    expect(results.get("test")).toBe(true);
  });

  it("does not record anything when JSON parsing fails and no scriptHint", () => {
    const results = new Map<string, boolean>();
    recordCheckResult(results, "plain text output");
    expect(results.size).toBe(0);
  });

  it("records from JSON when script field is present", () => {
    const results = new Map<string, boolean>();
    recordCheckResult(results, JSON.stringify({ ok: true, script: "build" }));
    expect(results.get("build")).toBe(true);
  });

  it("ignores scriptHint when JSON parsing succeeds", () => {
    const results = new Map<string, boolean>();
    recordCheckResult(results, JSON.stringify({ ok: false, script: "test" }), "build");
    expect(results.get("test")).toBe(false);
    expect(results.has("build")).toBe(false);
  });

  it("does not record when JSON has no script field and no hint", () => {
    const results = new Map<string, boolean>();
    recordCheckResult(results, JSON.stringify({ ok: true }));
    expect(results.size).toBe(0);
  });
});

describe("inferRequiredCheckScripts", () => {
  it("infers test from 'npm run test'", () => {
    const scripts = inferRequiredCheckScripts("Run npm run test before merging");
    expect(scripts).toContain("test");
  });

  it("infers test from 'npm test'", () => {
    const scripts = inferRequiredCheckScripts("Run npm test before merging");
    expect(scripts).toContain("test");
  });

  it("infers build from 'npm run build'", () => {
    const scripts = inferRequiredCheckScripts("Run npm run build to verify");
    expect(scripts).toContain("build");
  });

  it("infers test:e2e from 'npm run test:e2e'", () => {
    const scripts = inferRequiredCheckScripts("Run npm run test:e2e for integration");
    expect(scripts).toContain("test:e2e");
  });

  it("infers typecheck from 'npm run typecheck'", () => {
    const scripts = inferRequiredCheckScripts("Run npm run typecheck to validate types");
    expect(scripts).toContain("typecheck");
  });

  it("infers docs:build from 'npm run docs:build'", () => {
    const scripts = inferRequiredCheckScripts("Run npm run docs:build to generate docs");
    expect(scripts).toContain("docs:build");
  });

  it("infers multiple scripts from text", () => {
    const scripts = inferRequiredCheckScripts("Run npm run test and npm run build before deploying");
    expect(scripts).toContain("test");
    expect(scripts).toContain("build");
  });

  it("returns empty array when no patterns match", () => {
    const scripts = inferRequiredCheckScripts("Just do the thing without checks");
    expect(scripts).toEqual([]);
  });

  it("avoids duplicates when pattern matches multiple times", () => {
    const scripts = inferRequiredCheckScripts("npm run test and also npm run test again");
    expect(scripts.filter(s => s === "test")).toHaveLength(1);
  });
});

describe("resolveRequiredCheckScripts", () => {
  it("returns explicit scripts when provided", () => {
    const scripts = resolveRequiredCheckScripts("npm run test", ["build", "lint"]);
    expect(scripts).toEqual(["build", "lint"]);
  });

  it("infers from acceptance criteria section when no explicit scripts", () => {
    const prompt = "Fix the bug\n\nAcceptance criteria:\n\n- npm run test must pass\n- npm run build must pass";
    const scripts = resolveRequiredCheckScripts(prompt);
    expect(scripts).toContain("test");
    expect(scripts).toContain("build");
  });

  it("returns empty array when no explicit scripts and no acceptance criteria", () => {
    const scripts = resolveRequiredCheckScripts("Fix the bug");
    expect(scripts).toEqual([]);
  });

  it("ignores main prompt when acceptance criteria section exists", () => {
    const prompt = "npm run lint\n\nAcceptance criteria:\n\n- npm run test";
    const scripts = resolveRequiredCheckScripts(prompt);
    expect(scripts).toEqual(["test"]);
  });
});

describe("evaluateRequiredChecks", () => {
  it("returns undefined when no required checks", () => {
    const result = evaluateRequiredChecks([], new Map());
    expect(result).toBeUndefined();
  });

  it("returns undefined when all required checks passed", () => {
    const results = new Map([["test", true], ["build", true]]);
    const result = evaluateRequiredChecks(["test", "build"], results);
    expect(result).toBeUndefined();
  });

  it("returns error when required checks not run", () => {
    const results = new Map<string, boolean>();
    const result = evaluateRequiredChecks(["test", "build"], results);
    expect(result?.code).toBe("WORKER_CHECKS_INCOMPLETE");
    expect(result?.message).toContain("Required checks not run");
    expect(result?.message).toContain("test");
    expect(result?.message).toContain("build");
  });

  it("returns error when required checks failed", () => {
    const results = new Map([["test", false], ["build", true]]);
    const result = evaluateRequiredChecks(["test", "build"], results);
    expect(result?.code).toBe("WORKER_CHECKS_INCOMPLETE");
    expect(result?.message).toContain("Required checks failed");
    expect(result?.message).toContain("test");
  });

  it("prefers failed message over not-run message", () => {
    const results = new Map([["test", false]]);
    const result = evaluateRequiredChecks(["test", "build"], results);
    expect(result?.message).toContain("Required checks failed");
  });

  it("allows extra checks in results beyond required", () => {
    const results = new Map([["test", true], ["lint", true]]);
    const result = evaluateRequiredChecks(["test"], results);
    expect(result).toBeUndefined();
  });
});

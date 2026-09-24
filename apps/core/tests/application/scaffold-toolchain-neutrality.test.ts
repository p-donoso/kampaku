import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seedExternalRepository } from "../../src/application/pm/repo-bootstrap.js";
import { expandPhaseLeavesStub } from "../../src/delegator/expand-phase-leaves.js";

/**
 * Invariant §1 in its sharpest form: **a scaffold is the place a language assumption leaks.**
 *
 * A seed writes files into a stranger's checkout. If it also writes a pipeline, an agent contract, or
 * an acceptance criterion that names `npm`, the stranger's Python or Rust project inherits a toolchain
 * it does not use and a check it cannot run — which is the same defect as documenting a command the
 * checkout cannot execute (BOARD F-003).
 *
 * These tests do not check that the seed is *useful* for every stack. They check that it asserts no
 * stack at all.
 */

const ECOSYSTEM = /\bnpm\b|\bpnpm\b|\byarn\b|\bnode\b|\btsconfig\b|\bvite\b|\bwebpack\b|package\.json|\bpip\b|\bpoetry\b|\bcargo\b|\bgo\.mod\b|\bmaven\b|\bgradle\b|\bfastapi\b|\bdjango\b|\bflask\b|\brails\b|\blaravel\b/i;

describe("seeded repository declares no ecosystem", () => {
  it("writes no CI step, agent rule, or env example that names a toolchain", () => {
    const root = mkdtempSync(join(tmpdir(), "kampaku-seed-"));
    try {
      const result = seedExternalRepository(root, "Stranger project");
      expect(result.seeded).toContain("README.md");

      for (const relative of [".github/workflows/ci.yml", "AGENTS.md", ".env.example", "README.md"]) {
        const path = join(root, relative);
        expect(existsSync(path), `${relative} should have been seeded`).toBe(true);
        const source = readFileSync(path, "utf8");
        const match = source.match(ECOSYSTEM);
        expect(
          match,
          `${relative} names "${match?.[0]}" in a checkout whose toolchain it cannot know`,
        ).toBeNull();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still initialises a repository, so the recorded branch is real", () => {
    const root = mkdtempSync(join(tmpdir(), "kampaku-seed-git-"));
    try {
      const result = seedExternalRepository(root, "Stranger project");
      // Either git initialised it, or git was unavailable and the caller is told — never silence.
      expect(result.initializedRepository === true || result.gitUnavailable === true).toBe(true);
      if (result.initializedRepository) {
        expect(existsSync(join(root, ".git"))).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("fallback plan leaves assert no ecosystem", () => {
  it("produces acceptance criteria a non-Node repository could satisfy", () => {
    const phase = { title: "Data pipeline", description: "Container", priority: 0 };
    const leaves = expandPhaseLeavesStub(phase, "Build the ingest pipeline with tests", "fine", [phase]);

    expect(leaves.length).toBeGreaterThanOrEqual(15);
    for (const leaf of leaves) {
      for (const criterion of leaf.acceptance_criteria ?? []) {
        const match = criterion.match(ECOSYSTEM);
        expect(
          match,
          `leaf "${leaf.title}" requires "${match?.[0]}" from a repository whose toolchain the planner cannot know`,
        ).toBeNull();
        // The criterion still has to be verifiable; a stack-neutral phrase is not an excuse for
        // "looks good".
        expect(criterion).toMatch(/check|exists|command|exit status/i);
      }
    }
  });
});

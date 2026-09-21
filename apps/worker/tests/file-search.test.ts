import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";
import {
  hasRipgrep,
  listRepositoryFiles,
  resetRipgrepProbe,
  searchRepositoryFiles,
} from "../src/tools/file-search.js";

/**
 * Exercises the repository search tools in both execution modes.
 *
 * The Node fallback is the path a clean CI runner takes when ripgrep is not
 * installed, so it is tested explicitly rather than only through ripgrep.
 */
describe("repository file search", () => {
  let root: string | undefined;
  const originalForce = process.env.KAMPAKU_WORKER_FORCE_NODE_SEARCH;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-search-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "node_modules", "ignored"), { recursive: true });
    writeFileSync(join(root, "README.md"), "# Project\n\nStart with npm install.\n");
    writeFileSync(join(root, "src", "index.ts"), "export const value = 42;\n// TODO: rename\n");
    writeFileSync(join(root, "docs", "guide.md"), "Guide mentions npm install twice: npm install.\n");
    writeFileSync(join(root, "node_modules", "ignored", "vendor.js"), "npm install should not appear\n");
    resetRipgrepProbe();
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
    if (originalForce === undefined) delete process.env.KAMPAKU_WORKER_FORCE_NODE_SEARCH;
    else process.env.KAMPAKU_WORKER_FORCE_NODE_SEARCH = originalForce;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    resetRipgrepProbe();
  });

  describe("node fallback", () => {
    beforeEach(() => {
      process.env.KAMPAKU_WORKER_FORCE_NODE_SEARCH = "1";
      resetRipgrepProbe();
    });

    it("reports ripgrep as unavailable when forced", async () => {
      expect(await hasRipgrep()).toBe(false);
    });

    it("lists repository files and skips dependency directories", async () => {
      const listed = await listRepositoryFiles(root!, root!, 40_000);
      expect(listed).toContain("README.md");
      expect(listed).toContain(join("src", "index.ts"));
      expect(listed).not.toContain("vendor.js");
    });

    it("reports an empty checkout as having no files", async () => {
      const empty = mkdtempSync(join(tmpdir(), "kampaku-empty-search-"));
      try {
        expect(await listRepositoryFiles(empty, empty, 40_000)).toBe("No files\n");
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    });

    it("searches contents with path, line number, and text", async () => {
      const matches = await searchRepositoryFiles(root!, {
        path: ".",
        pattern: "npm install",
        maxOutputChars: 40_000,
      });
      expect(matches).toContain("README.md:3:");
      expect(matches).toContain("guide.md:1:");
      expect(matches).not.toContain("vendor.js");
    });

    it("reports no matches instead of failing", async () => {
      const matches = await searchRepositoryFiles(root!, {
        path: ".",
        pattern: "no-such-token-anywhere",
        maxOutputChars: 40_000,
      });
      expect(matches).toBe("No matches\n");
    });

    it("searches a single file target", async () => {
      const matches = await searchRepositoryFiles(root!, {
        path: join("src", "index.ts"),
        pattern: "TODO",
        maxOutputChars: 40_000,
      });
      expect(matches).toContain("TODO");
      expect(matches.split("\n").filter(Boolean)).toHaveLength(1);
    });

    it("stops at the output budget", async () => {
      for (let index = 0; index < 40; index += 1) {
        writeFileSync(join(root!, "src", `file-${index}.ts`), "const repeated = 'budget token';\n");
      }
      const matches = await searchRepositoryFiles(root!, {
        path: ".",
        pattern: "budget token",
        maxOutputChars: 200,
      });
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.length).toBeLessThan(400);
    });

    it("rejects an invalid pattern with a clear message", async () => {
      await expect(
        searchRepositoryFiles(root!, { path: ".", pattern: "([", maxOutputChars: 1_000 }),
      ).rejects.toThrow(/Invalid search pattern/);
    });

    it("keeps the coding tools working without ripgrep", async () => {
      expect(await executeCodingTool("list_files", {}, root!)).toContain("README.md");
      const found = await executeCodingTool("search_files", { pattern: "value = 42" }, root!);
      expect(found).toContain("index.ts");
    });
  });

  describe("with ripgrep available", () => {
    it("matches the same shape as the fallback", async () => {
      const nodeResult = await searchRepositoryFiles(root!, {
        path: ".",
        pattern: "npm install",
        maxOutputChars: 40_000,
      });

      delete process.env.KAMPAKU_WORKER_FORCE_NODE_SEARCH;
      resetRipgrepProbe();
      if (!(await hasRipgrep())) return;

      const ripgrepResult = await searchRepositoryFiles(root!, {
        path: ".",
        pattern: "npm install",
        maxOutputChars: 40_000,
      });
      expect(ripgrepResult).toContain("README.md:3:");
      expect(ripgrepResult).toContain("guide.md:1:");
      expect(nodeResult.split("\n").filter(Boolean).sort()).toEqual(
        ripgrepResult.split("\n").filter(Boolean).sort(),
      );
    });
  });
});

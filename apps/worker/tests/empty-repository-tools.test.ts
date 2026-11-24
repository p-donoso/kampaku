import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";

describe("tools for a new repository", () => {
  it("can inspect an empty checkout and install its first package", async () => {
    const root = mkdtempSync(join(tmpdir(), "kampaku-empty-repo-"));
    try {
      expect(await executeCodingTool("list_files", {}, root)).toBe("No files\n");
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "new-project", version: "0.1.0", private: true }));
      const installed = JSON.parse(await executeCodingTool("install_dependencies", {}, root)) as { ok: boolean };
      expect(installed.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    // This test **shells out**: `install_dependencies` runs a real package install, whose wall time is the host's, not
    // the test's. Vitest's 5 000 ms default is a claim about this machine's load, and on a loaded host it failed while
    // the same tree passed in isolation — a red suite that teaches the operator to ignore red (BOARD F-020).
  }, 60_000);

  it("verifies a written document without executing a package script", async () => {
    const root = mkdtempSync(join(tmpdir(), "kampaku-verify-file-"));
    try {
      await executeCodingTool("write_file", { path: "docs/research.md", content: "Evidence: https://example.test" }, root);
      expect(JSON.parse(await executeCodingTool("verify_file", { path: "docs/research.md", contains: "Evidence:" }, root))).toMatchObject({ ok: true, path: "docs/research.md" });
      expect(JSON.parse(await executeCodingTool("verify_file", { path: "docs/research.md", contains: "missing" }, root))).toMatchObject({ ok: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

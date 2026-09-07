import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCodingTool } from "../src/tools/file-tools.js";

describe("file-tools edge cases", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "worker-file-edge-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  describe("search_files", () => {
    it("returns 'No matches' when pattern not found", async () => {
      await writeFile(join(workspaceRoot, "test.txt"), "hello world");

      const result = await executeCodingTool(
        "search_files",
        { pattern: "nonexistent", path: "." },
        workspaceRoot,
      );

      expect(result).toBe("No matches\n");
    });
  });

  describe("unknown tool", () => {
    it("throws error for unknown tool name", async () => {
      await expect(
        executeCodingTool("unknown_tool", {}, workspaceRoot)
      ).rejects.toThrow("Unknown tool: unknown_tool");
    });
  });

  describe("read_file with various encodings", () => {
    it("reads UTF-8 content correctly", async () => {
      await writeFile(join(workspaceRoot, "utf8.txt"), "Hello 世界 🌍");

      const result = await executeCodingTool(
        "read_file",
        { path: "utf8.txt" },
        workspaceRoot,
      );

      expect(result).toBe("Hello 世界 🌍");
    });

    it("reads empty file", async () => {
      await writeFile(join(workspaceRoot, "empty.txt"), "");

      const result = await executeCodingTool(
        "read_file",
        { path: "empty.txt" },
        workspaceRoot,
      );

      expect(result).toBe("");
    });
  });

  describe("write_file edge cases", () => {
    it("creates parent directories automatically", async () => {
      const result = await executeCodingTool(
        "write_file",
        { path: "deep/nested/new.txt", content: "created" },
        workspaceRoot,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(true);
      expect(parsed.path).toBe("deep/nested/new.txt");
    });

    it("overwrites existing file", async () => {
      await writeFile(join(workspaceRoot, "existing.txt"), "old content");

      const result = await executeCodingTool(
        "write_file",
        { path: "existing.txt", content: "new content" },
        workspaceRoot,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(true);

      const read = await executeCodingTool(
        "read_file",
        { path: "existing.txt" },
        workspaceRoot,
      );
      expect(read).toBe("new content");
    });

    it("writes single space content", async () => {
      const result = await executeCodingTool(
        "write_file",
        { path: "space.txt", content: " " },
        workspaceRoot,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(true);
    });
  });

  describe("replace_in_file edge cases", () => {
    it("replaces text in middle of file", async () => {
      await writeFile(join(workspaceRoot, "replace.txt"), "line1\ntarget\nline3");

      const result = await executeCodingTool(
        "replace_in_file",
        { path: "replace.txt", old_text: "target", new_text: "replaced" },
        workspaceRoot,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(true);

      const read = await executeCodingTool(
        "read_file",
        { path: "replace.txt" },
        workspaceRoot,
      );
      expect(read).toBe("line1\nreplaced\nline3");
    });

    it("fails when old_text not found", async () => {
      await writeFile(join(workspaceRoot, "file.txt"), "content");

      await expect(
        executeCodingTool(
          "replace_in_file",
          { path: "file.txt", old_text: "missing", new_text: "new" },
          workspaceRoot,
        ),
      ).rejects.toThrow();
    });

    it("fails when old_text appears multiple times", async () => {
      await writeFile(join(workspaceRoot, "dup.txt"), "match\nmatch");

      await expect(
        executeCodingTool(
          "replace_in_file",
          { path: "dup.txt", old_text: "match", new_text: "new" },
          workspaceRoot,
        ),
      ).rejects.toThrow();
    });
  });

  describe("run_check edge cases", () => {
    it("runs check script successfully", async () => {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "echo pass" },
        }),
      );

      const result = await executeCodingTool(
        "run_check",
        { script: "test" },
        workspaceRoot,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(true);
      expect(parsed.script).toBe("test");
      expect(parsed.output).toContain("pass");
    });

    it("returns failure when script exits non-zero", async () => {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { fail: "exit 1" },
        }),
      );

      const result = await executeCodingTool(
        "run_check",
        { script: "fail" },
        workspaceRoot,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
    });

    it("throws when script name is invalid", async () => {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "echo pass" },
        }),
      );

      await expect(
        executeCodingTool(
          "run_check",
          { script: "invalid$name" },
          workspaceRoot,
        ),
      ).rejects.toThrow("Invalid script name");
    });

    it("throws when script does not exist in package.json", async () => {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "echo pass" },
        }),
      );

      await expect(
        executeCodingTool(
          "run_check",
          { script: "nonexistent" },
          workspaceRoot,
        ),
      ).rejects.toThrow("Package script does not exist: nonexistent");
    });
  });
});

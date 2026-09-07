import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, symlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  safePathForWrite,
  safePath,
  executeCodingTool,
} from "../src/tools/file-tools.js";
import type { WorkerConfig } from "../src/config.js";

describe("file-tools path safety", () => {
  let workspaceRoot: string;

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  describe("safePathForWrite", () => {
    it("rejects absolute paths", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      await expect(safePathForWrite(workspaceRoot, "/tmp/test")).rejects.toThrow();
    });

    it("rejects paths that escape root", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      await expect(safePathForWrite(workspaceRoot, "../../../etc/passwd")).rejects.toThrow("escapes the repository root");
    });

    it("allows nested paths within root", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      const result = await safePathForWrite(workspaceRoot, "nested/path/file.txt");
      expect(result).toContain("nested/path/file.txt");
    });

    it("rejects sensitive paths", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      await expect(safePathForWrite(workspaceRoot, ".env")).rejects.toThrow();
    });

    it("handles symlinks that stay within root", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      const targetDir = join(workspaceRoot, "target");
      await mkdir(targetDir);
      await symlink(targetDir, join(workspaceRoot, "link"));
      
      const result = await safePathForWrite(workspaceRoot, "link/file.txt");
      expect(result).toBeTruthy();
    });

    it("handles deeply nested non-existent paths", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      const result = await safePathForWrite(workspaceRoot, "a/b/c/d/e/file.txt");
      expect(result).toContain("a/b/c/d/e/file.txt");
    });
  });

  describe("safePath", () => {
    it("requires existing path when mustExist is true", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      await expect(safePath(workspaceRoot, "nonexistent.txt", true)).rejects.toThrow();
    });

    it("allows non-existent path when mustExist is false", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      const result = await safePath(workspaceRoot, "nonexistent.txt", false);
      expect(result).toContain("nonexistent.txt");
    });

    it("rejects symlinks that escape root", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      const outsideDir = await mkdtemp(join(tmpdir(), "outside-"));
      await symlink(outsideDir, join(workspaceRoot, "escape-link"));
      
      await expect(safePath(workspaceRoot, "escape-link", true)).rejects.toThrow("escapes the repository root");
      
      await rm(outsideDir, { recursive: true, force: true });
    });

    it("resolves valid symlinks within root", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      const targetFile = join(workspaceRoot, "target.txt");
      await writeFile(targetFile, "test");
      await symlink(targetFile, join(workspaceRoot, "link.txt"));
      
      const result = await safePath(workspaceRoot, "link.txt", true);
      expect(result).toBeTruthy();
    });

    it("rejects parent paths that escape root", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-safe-"));
      
      await expect(safePath(workspaceRoot, "../../../../etc/passwd", false)).rejects.toThrow("escapes the repository root");
    });
  });

  describe("executeCodingTool with path safety", () => {
    it("write_file throws on unsafe paths", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-tool-"));
      
      await expect(executeCodingTool("write_file", {
        path: "../../../etc/passwd",
        content: "malicious",
      }, workspaceRoot)).rejects.toThrow();
    });

    it("read_file throws on unsafe paths", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-tool-"));
      
      await expect(executeCodingTool("read_file", {
        path: "/etc/passwd",
      }, workspaceRoot)).rejects.toThrow();
    });

    it("replace_in_file throws on unsafe paths", async () => {
      workspaceRoot = await mkdtemp(join(tmpdir(), "worker-tool-"));
      
      await expect(executeCodingTool("replace_in_file", {
        path: "../escape.txt",
        old_string: "old",
        new_string: "new",
      }, workspaceRoot)).rejects.toThrow();
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safePathForWrite, safePath } from "../src/tools/file-tools.js";

describe("safePathForWrite path validation", () => {
  let workspaceRoot: string;
  let outsideDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "worker-path-safe-"));
    outsideDir = await mkdtemp(join(tmpdir(), "worker-outside-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it("allows writing to new file in root", async () => {
    const path = await safePathForWrite(workspaceRoot, "newfile.txt");
    expect(path).toBe(join(workspaceRoot, "newfile.txt"));
  });

  it("allows writing to new file in nested directory", async () => {
    await mkdir(join(workspaceRoot, "subdir"), { recursive: true });
    const path = await safePathForWrite(workspaceRoot, "subdir/newfile.txt");
    expect(path).toBe(join(workspaceRoot, "subdir/newfile.txt"));
  });

  it("allows writing to deeply nested new file with parent creation", async () => {
    const path = await safePathForWrite(workspaceRoot, "a/b/c/file.txt");
    expect(path).toBe(join(workspaceRoot, "a/b/c/file.txt"));
  });

  it("throws when path escapes via parent reference", async () => {
    await expect(
      safePathForWrite(workspaceRoot, "../outside.txt")
    ).rejects.toThrow("Path escapes the repository root");
  });

  it("throws when path is absolute", async () => {
    await expect(
      safePathForWrite(workspaceRoot, "/tmp/absolute.txt")
    ).rejects.toThrow("Absolute paths are not allowed");
  });

  it("handles ENOENT errors during parent resolution", async () => {
    const path = await safePathForWrite(workspaceRoot, "nonexistent/nested/file.txt");
    expect(path).toBe(join(workspaceRoot, "nonexistent/nested/file.txt"));
  });

  it("throws when symlink would escape the root", async () => {
    await symlink(outsideDir, join(workspaceRoot, "link"), "dir");
    await expect(
      safePathForWrite(workspaceRoot, "link/file.txt")
    ).rejects.toThrow("Path escapes the repository root");
  });

  it("throws when intermediate symlink escapes", async () => {
    await mkdir(join(workspaceRoot, "safe"), { recursive: true });
    await symlink(outsideDir, join(workspaceRoot, "safe/badlink"), "dir");
    await expect(
      safePathForWrite(workspaceRoot, "safe/badlink/file.txt")
    ).rejects.toThrow("Path escapes the repository root");
  });

  it("handles non-ENOENT errors by rethrowing", async () => {
    await writeFile(join(workspaceRoot, "file"), "content");
    await expect(
      safePathForWrite(workspaceRoot, "file/nested/path.txt")
    ).rejects.toThrow();
  });
});

describe("safePath read validation", () => {
  let workspaceRoot: string;
  let outsideDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "worker-read-safe-"));
    outsideDir = await mkdtemp(join(tmpdir(), "worker-outside-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it("allows reading existing file", async () => {
    await writeFile(join(workspaceRoot, "file.txt"), "content");
    const path = await safePath(workspaceRoot, "file.txt", true);
    expect(path).toBe(join(workspaceRoot, "file.txt"));
  });

  it("allows reading with mustExist=false for non-existent file", async () => {
    const path = await safePath(workspaceRoot, "nonexistent.txt", false);
    expect(path).toBe(join(workspaceRoot, "nonexistent.txt"));
  });

  it("throws when mustExist=true and file does not exist", async () => {
    await expect(
      safePath(workspaceRoot, "nonexistent.txt", true)
    ).rejects.toThrow();
  });

  it("throws when path escapes via parent reference", async () => {
    await expect(
      safePath(workspaceRoot, "../outside.txt", false)
    ).rejects.toThrow("Path escapes the repository root");
  });

  it("throws when absolute path provided", async () => {
    await expect(
      safePath(workspaceRoot, "/tmp/absolute.txt", false)
    ).rejects.toThrow("Absolute paths are not allowed");
  });

  it("throws when symlink escapes root with mustExist=true", async () => {
    await symlink(outsideDir, join(workspaceRoot, "badlink"), "dir");
    await expect(
      safePath(workspaceRoot, "badlink", true)
    ).rejects.toThrow("Symlink escapes the repository root");
  });

  it("throws when parent would escape with mustExist=false", async () => {
    await expect(
      safePath(workspaceRoot, "../../escape.txt", false)
    ).rejects.toThrow("repository root");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCodingTool } from "../src/tools/file-tools.js";

describe("file-tools stringArg validation", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "worker-stringarg-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("throws when read_file path argument is missing", async () => {
    await expect(
      executeCodingTool("read_file", {}, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when read_file path argument is empty string", async () => {
    await expect(
      executeCodingTool("read_file", { path: "" }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when read_file path argument is not a string", async () => {
    await expect(
      executeCodingTool("read_file", { path: 123 }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when write_file path is missing", async () => {
    await expect(
      executeCodingTool("write_file", { content: "test" }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when write_file content is missing", async () => {
    await expect(
      executeCodingTool("write_file", { path: "test.txt" }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when replace_in_file path is missing", async () => {
    await expect(
      executeCodingTool("replace_in_file", { old_text: "old", new_text: "new" }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when replace_in_file old_text is missing", async () => {
    await writeFile(join(workspaceRoot, "file.txt"), "content");
    await expect(
      executeCodingTool("replace_in_file", { path: "file.txt", new_text: "new" }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when replace_in_file new_text is missing", async () => {
    await writeFile(join(workspaceRoot, "file.txt"), "content");
    await expect(
      executeCodingTool("replace_in_file", { path: "file.txt", old_text: "old" }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when run_check script is missing", async () => {
    await writeFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "test", scripts: { test: "echo ok" } })
    );
    await expect(
      executeCodingTool("run_check", {}, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("throws when search_files pattern is missing", async () => {
    await expect(
      executeCodingTool("search_files", { path: "." }, workspaceRoot)
    ).rejects.toThrow("Required string argument is missing");
  });

  it("uses fallback for list_files path when not provided", async () => {
    await writeFile(join(workspaceRoot, "test.txt"), "content");
    const result = await executeCodingTool("list_files", {}, workspaceRoot);
    expect(result).toContain("test.txt");
  });

  it("uses fallback for search_files path when not provided", async () => {
    await writeFile(join(workspaceRoot, "test.txt"), "hello world");
    const result = await executeCodingTool("search_files", { pattern: "hello" }, workspaceRoot);
    expect(result).toContain("hello");
  });
});

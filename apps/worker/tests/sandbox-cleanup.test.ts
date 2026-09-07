import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../src/sandbox/workspace.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("createSandbox cleanup handling", () => {
  it("creates sandbox with custom repositoryPath option", () => {
    const tempRepo = mkdtempSync(join(tmpdir(), "test-repo-"));
    writeFileSync(join(tempRepo, "README.md"), "test");

    const sandbox = createSandbox(
      "job-123",
      "/workspace",
      "core",
      { repositoryPath: tempRepo }
    );

    expect(existsSync(sandbox.path)).toBe(true);
    expect(existsSync(join(sandbox.path, "README.md"))).toBe(true);

    sandbox.cleanup();
    expect(existsSync(sandbox.path)).toBe(false);

    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("creates sandbox with custom workspaceDir option", () => {
    const tempRepo = mkdtempSync(join(tmpdir(), "test-repo-"));
    writeFileSync(join(tempRepo, "test.txt"), "test");

    const sandbox = createSandbox(
      "job-456",
      "/workspace",
      "web",
      {
        repositoryPath: tempRepo,
        workspaceDir: "custom-workspace",
      }
    );

    expect(existsSync(sandbox.path)).toBe(true);
    expect(sandbox.path.endsWith("custom-workspace")).toBe(true);

    sandbox.cleanup();

    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("handles cleanup errors gracefully when directory already removed", () => {
    const tempRepo = mkdtempSync(join(tmpdir(), "test-repo-"));

    const sandbox = createSandbox("job-789", "/workspace", "worker", {
      repositoryPath: tempRepo,
    });

    const sandboxRoot = sandbox.path.split("/").slice(0, -1).join("/");
    rmSync(sandboxRoot, { recursive: true, force: true });

    expect(() => sandbox.cleanup()).not.toThrow();

    if (existsSync(tempRepo)) {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("uses default REPOSITORY_DIRS when no options provided", () => {
    const tempWorkspace = mkdtempSync(join(tmpdir(), "test-workspace-"));
    const tempCore = join(tempWorkspace, "apps", "core");
    rmSync(tempCore, { recursive: true, force: true });

    const sandbox = createSandbox("job-default", tempWorkspace, "core");

    expect(sandbox.path.endsWith("apps/core")).toBe(true);

    sandbox.cleanup();
    rmSync(tempWorkspace, { recursive: true, force: true });
  });
});

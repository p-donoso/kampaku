import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox } from "../src/sandbox/workspace.js";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("createSandbox", () => {
  it("creates nested monorepo repository links", () => {
    const workspace = mkdtempSync(join(tmpdir(), "kampaku-workspace-"));
    const repository = join(workspace, "apps/core");
    mkdirSync(repository, { recursive: true });
    cleanupPaths.push(workspace);

    const sandbox = createSandbox("12345678-1234-1234-1234-123456789abc", workspace, "core", {
      workspaceDir: "apps/core",
      repositoryPath: repository,
    });

    expect(existsSync(sandbox.path)).toBe(true);
    expect(readlinkSync(sandbox.path)).toBe(repository);
    sandbox.cleanup();
  });
});

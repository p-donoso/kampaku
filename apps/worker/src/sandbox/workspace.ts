import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepositoryRole } from "../config.js";
import { REPOSITORY_DIRS } from "../config.js";

export function createSandbox(
  jobId: string,
  workspaceRoot: string,
  repositoryRole: RepositoryRole,
  options?: { repositoryPath?: string; workspaceDir?: string },
): { path: string; cleanup: () => void } {
  const sandboxPath = mkdtempSync(join(tmpdir(), `kampaku-${jobId.slice(0, 8)}-`));
  const workspaceDir = options?.workspaceDir ?? REPOSITORY_DIRS[repositoryRole];
  const repoPath = options?.repositoryPath ?? join(workspaceRoot, REPOSITORY_DIRS[repositoryRole]);
  const linkPath = join(sandboxPath, workspaceDir);

  symlinkSync(repoPath, linkPath, "dir");

  return {
    path: linkPath,
    cleanup: () => {
      try {
        rmSync(sandboxPath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for MVP.
      }
    },
  };
}

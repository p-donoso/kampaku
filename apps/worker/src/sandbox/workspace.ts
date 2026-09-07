/**
 * @module sandbox/workspace
 * Ephemeral sandbox workspace creation and lifecycle cleanup for isolated worker tasks.
 */

import { mkdirSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepositoryRole } from "../config.js";
import { REPOSITORY_DIRS } from "../config.js";

/**
 * Result of creating an isolated sandbox environment.
 */
export interface SandboxInstance {
  /** Absolute path to the isolated symlinked project workspace directory */
  path: string;
  /** Teardown function to clean up the temporary directory */
  cleanup: () => void;
}

/**
 * Optional parameters for customizing repository paths and directory links inside sandbox.
 */
export interface CreateSandboxOptions {
  /** Explicit path to target repository checkout */
  repositoryPath?: string;
  /** Relative directory name inside sandbox workspace */
  workspaceDir?: string;
}

/**
 * Creates an isolated ephemeral temporary sandbox directory with symlinked workspace access.
 *
 * @param jobId - Leased job identifier.
 * @param workspaceRoot - Root folder containing workspace checkouts.
 * @param repositoryRole - Role of repository (e.g. `core`, `web`, `worker`).
 * @param options - Optional overrides for repository path and directory layout.
 * @returns Object containing the sandbox directory path and a cleanup callback.
 */
export function createSandbox(
  jobId: string,
  workspaceRoot: string,
  repositoryRole: RepositoryRole,
  options?: CreateSandboxOptions,
): SandboxInstance {
  const sandboxPath = mkdtempSync(join(tmpdir(), `kampaku-${jobId.slice(0, 8)}-`));
  const workspaceDir = options?.workspaceDir ?? REPOSITORY_DIRS[repositoryRole];
  const repoPath = options?.repositoryPath ?? join(workspaceRoot, REPOSITORY_DIRS[repositoryRole]);
  const linkPath = join(sandboxPath, workspaceDir);

  mkdirSync(join(linkPath, ".."), { recursive: true });
  symlinkSync(repoPath, linkPath, "dir");

  return {
    path: linkPath,
    cleanup: () => {
      try {
        rmSync(sandboxPath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for temporary sandbox directories.
      }
    },
  };
}

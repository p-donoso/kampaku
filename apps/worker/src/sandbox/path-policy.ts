/**
 * @module sandbox/path-policy
 * Path security, traversal protection, and read/write boundary enforcement for worker sandboxes.
 */

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Definition of a folder allowed for access in a job's filesystem policy.
 */
export interface AllowedFolder {
  /** Unique UUID of the allowed folder boundary */
  id: string;
  /** Absolute or canonical directory path */
  path: string;
  /** Optional human-readable description */
  label?: string;
  /** Whether modifications to this folder are prohibited */
  readOnly?: boolean;
}

/**
 * Filesystem policy structure defining allowed boundaries for job execution.
 */
export interface FilesystemPolicy {
  folders: AllowedFolder[];
}

/**
 * Normalizes an existing filesystem path resolving symlinks, or returns the absolute path if missing.
 */
function normalizeExistingPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

/**
 * Verifies whether a target path resides within the specified directory without escaping.
 *
 * @param targetPath - Path to test.
 * @param folderPath - Container folder path.
 * @returns True if targetPath is equal to or located inside folderPath.
 */
export function isPathWithinFolder(targetPath: string, folderPath: string): boolean {
  const root = normalizeExistingPath(folderPath);
  const target = normalizeExistingPath(targetPath);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Finds the matching allowed folder configuration for a given path.
 *
 * @param targetPath - Path to look up.
 * @param folders - Array of allowed folder configurations.
 * @returns Matching `AllowedFolder` or undefined.
 */
export function findAllowedFolderForPath(
  targetPath: string,
  folders: AllowedFolder[],
): AllowedFolder | undefined {
  return folders.find((folder) => isPathWithinFolder(targetPath, folder.path));
}

/**
 * Asserts that a target path is allowed for writing under the given policy.
 *
 * @param targetPath - Path to test for write permission.
 * @param policy - Active filesystem security policy.
 * @throws Error if no folders are configured, target path is outside allowed folders, or folder is read-only.
 */
export function assertPathWritable(targetPath: string, policy: FilesystemPolicy): void {
  if (!policy.folders.length) {
    throw new Error("No allowed folders configured for this job");
  }

  const match = findAllowedFolderForPath(targetPath, policy.folders);
  if (!match) {
    throw new Error(`Path is outside allowed folders: ${targetPath}`);
  }
  if (match.readOnly) {
    throw new Error(`Folder is read-only: ${match.path}`);
  }
}

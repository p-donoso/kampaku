import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export interface AllowedFolder {
  id: string;
  path: string;
  label?: string;
  readOnly?: boolean;
}

export interface FilesystemPolicy {
  folders: AllowedFolder[];
}

function normalizeExistingPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

export function isPathWithinFolder(targetPath: string, folderPath: string): boolean {
  const root = normalizeExistingPath(folderPath);
  const target = normalizeExistingPath(targetPath);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function findAllowedFolderForPath(
  targetPath: string,
  folders: AllowedFolder[],
): AllowedFolder | undefined {
  return folders.find((folder) => isPathWithinFolder(targetPath, folder.path));
}

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

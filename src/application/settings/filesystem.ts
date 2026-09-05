import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { Store } from "../../persistence/store.js";

export interface AllowedFolder {
  id: string;
  path: string;
  label?: string;
  readOnly?: boolean;
}

export interface FilesystemSettings {
  folders: AllowedFolder[];
}

export interface FilesystemPolicy {
  folders: AllowedFolder[];
}

const SETTINGS_KEY = "filesystem_settings";

export function normalizeFolderPath(rawPath: string): string {
  const expanded = rawPath.startsWith("~")
    ? resolve(process.env.HOME ?? "", rawPath.slice(1))
    : rawPath;
  const absolute = resolve(expanded);
  if (!existsSync(absolute)) {
    throw new Error(`Path does not exist: ${rawPath}`);
  }
  if (!lstatSync(absolute).isDirectory()) {
    throw new Error(`Path is not a directory: ${rawPath}`);
  }
  return realpathSync(absolute);
}

export function isPathWithinFolder(targetPath: string, folderPath: string): boolean {
  const root = normalizeExistingPath(folderPath);
  const target = normalizeExistingPath(targetPath);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeExistingPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

export function findAllowedFolderForPath(
  targetPath: string,
  folders: AllowedFolder[],
): AllowedFolder | undefined {
  return folders.find((folder) => isPathWithinFolder(targetPath, folder.path));
}

export function assertPathWritable(targetPath: string, policy: FilesystemPolicy): void {
  const match = findAllowedFolderForPath(targetPath, policy.folders);
  if (!match) {
    throw new Error(`Path is outside allowed folders: ${targetPath}`);
  }
  if (match.readOnly) {
    throw new Error(`Folder is read-only: ${match.path}`);
  }
}

export function getFilesystemSettings(store: Store): FilesystemSettings {
  return store.getBootstrapState<FilesystemSettings>(SETTINGS_KEY) ?? { folders: [] };
}

export function saveFilesystemSettings(store: Store, settings: FilesystemSettings): FilesystemSettings {
  store.setBootstrapState(SETTINGS_KEY, settings);
  return settings;
}

export function toFilesystemPolicy(settings: FilesystemSettings): FilesystemPolicy {
  return { folders: settings.folders.map((folder) => ({ ...folder })) };
}

export function bootstrapFilesystemSettings(
  store: Store,
  workspaceRoot: string,
): { settings: FilesystemSettings; created: boolean } {
  const existing = store.getBootstrapState<FilesystemSettings>(SETTINGS_KEY);
  if (existing?.folders?.length) {
    return { settings: existing, created: false };
  }

  const folders: AllowedFolder[] = [];

  const homeDir = process.env.HOME;
  if (homeDir && existsSync(homeDir)) {
    folders.push({
      id: uuidv4(),
      path: normalizeFolderPath(homeDir),
      label: "home",
      readOnly: false,
    });
  }

  if (!existsSync(workspaceRoot)) {
    mkdirSync(workspaceRoot, { recursive: true });
  }

  const workspacePath = normalizeFolderPath(workspaceRoot);
  if (!folders.some((folder) => folder.path === workspacePath)) {
    folders.push({
      id: uuidv4(),
      path: workspacePath,
      label: "workspace",
      readOnly: false,
    });
  }

  const settings: FilesystemSettings = { folders };
  saveFilesystemSettings(store, settings);
  return { settings, created: true };
}

export function addAllowedFolder(
  store: Store,
  input: { path: string; label?: string; readOnly?: boolean },
): FilesystemSettings {
  const normalized = normalizeFolderPath(input.path);
  const settings = getFilesystemSettings(store);

  if (settings.folders.some((folder) => folder.path === normalized)) {
    throw new Error(`Folder already allowed: ${normalized}`);
  }

  settings.folders.push({
    id: uuidv4(),
    path: normalized,
    label: input.label,
    readOnly: input.readOnly ?? false,
  });

  return saveFilesystemSettings(store, settings);
}

export function removeAllowedFolder(store: Store, folderIdOrPath: string): FilesystemSettings {
  const settings = getFilesystemSettings(store);
  const index = settings.folders.findIndex(
    (folder) => folder.id === folderIdOrPath || folder.path === folderIdOrPath,
  );
  if (index === -1) {
    throw new Error(`Allowed folder not found: ${folderIdOrPath}`);
  }

  settings.folders.splice(index, 1);
  return saveFilesystemSettings(store, settings);
}

export function updateAllowedFolder(
  store: Store,
  folderId: string,
  input: { label?: string; readOnly?: boolean },
): FilesystemSettings {
  const settings = getFilesystemSettings(store);
  const folder = settings.folders.find((item) => item.id === folderId);
  if (!folder) {
    throw new Error(`Allowed folder not found: ${folderId}`);
  }

  if (input.label !== undefined) folder.label = input.label;
  if (input.readOnly !== undefined) folder.readOnly = input.readOnly;

  return saveFilesystemSettings(store, settings);
}

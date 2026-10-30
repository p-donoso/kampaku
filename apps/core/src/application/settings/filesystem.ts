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
  /**
   * The rules that refuse, on the same record as the grants.
   *
   * Optional because a stored setting written before this field existed has no refusal list in it, and inventing
   * one at read time would be the same defect as inventing a grant. `describeFilesystemBoundaries` renders the
   * canonical list for every surface; this field only echoes what an operator's own read carries.
   */
  refused?: string[];
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

/**
 * Paths no grant may include: the system's own directories and credentials locations.
 *
 * These are **refusals**, not defaults, and they exist because a grant is a policy and a policy that can be
 * widened by one call is not a boundary. Measured on suite 14's first run (`s14r1`, 2026-10-30): `bootstrap`
 * granted `/home/pdonoso` read-write, so `list_allowed_folders` answered that every role could write the
 * operator's whole home — SSH keys, browser profiles, and the platform checkout included (BOARD F-015).
 */
export const SYSTEM_PATH_PREFIXES = ["/etc", "/usr", "/bin", "/sbin", "/boot", "/var", "/opt", "/root", "/proc", "/sys", "/dev"];

/**
 * What a grant is allowed to name, in the words the refusal uses.
 *
 * Kept as data rather than as a sentence inside the check so the REST route, the CLI, the runtime tool and the
 * suite's lock all read one list: a boundary described three ways is three boundaries.
 */
export interface FilesystemBoundaryDescription {
  /**
   * Folders granted to jobs and agents, with the reach each one carries.
   *
   * `id` travels because every surface addresses a grant by it — the CLI's `folders remove`, the web page's row
   * key and its read-only toggle, `PATCH /api/v1/settings/filesystem/folders/:id`. Measured on `s14r2`: a
   * boundary description without it printed `id: undefined` in the CLI, the shape of a field one caller kept and
   * the next dropped.
   */
  granted: Array<{ id: string; path: string; label?: string; readOnly: boolean }>;
  /** The rules that refuse, stated so an operator can see what is *not* reachable. */
  refused: string[];
}

/** The home directory, when the process has one. */
export function homeDirectory(): string | undefined {
  const home = process.env.HOME?.trim();
  return home ? home : undefined;
}

/**
 * True for the home directory itself, a system directory, or a folder above either.
 *
 * Ancestors count on purpose: granting `/home` or `/` reaches the same files as granting `$HOME`, and a rule that
 * refuses the leaf while accepting its parent is a lock that a relative path walks around.
 */
export function isForbiddenGrant(candidate: string): boolean {
  const normalized = normalizeExistingPath(candidate);
  if (normalized === "/") return true;
  const home = homeDirectory();
  if (home) {
    const normalizedHome = normalizeExistingPath(home);
    if (normalized === normalizedHome) return true;
    // An ancestor of home, e.g. `/home`.
    if (normalizedHome.startsWith(`${normalized}/`)) return true;
  }
  return SYSTEM_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * The boundary as an operator can read it.
 *
 * This is the answer to suite 14's fourth prompt (*"Which folders can each role actually reach, and which are
 * refused?"*), which the seat the emperor talks to could not answer on `s14r1` because it held no filesystem
 * tool at all and said so — honest, and unmeasurable.
 */
export function describeFilesystemBoundaries(store: Store): FilesystemBoundaryDescription {
  const settings = getFilesystemSettings(store);
  const home = homeDirectory();
  return {
    granted: settings.folders.map((folder) => ({
      id: folder.id,
      path: folder.path,
      label: folder.label,
      readOnly: folder.readOnly ?? false,
    })),
    refused: [
      home
        ? `The home directory (${home}) is not granted, and neither is any folder above it: SSH keys, cloud credentials and operator notes live there. A job's filesystem reach is the folders above, and a project's is its own checkout.`
        : "The home directory is not granted, and neither is any folder above it.",
      `System directories are never granted: ${SYSTEM_PATH_PREFIXES.join(", ")}.`,
      "Credential files are refused inside a granted folder too: .ssh, .gnupg, .aws, .env, id_rsa, id_ed25519, and private-key blocks.",
      "A write outside a granted folder is refused through the resolved path, so `..`, an absolute path and a symlink are the same refusal.",
    ],
  };
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
  /**
   * The folder the factory works in (`AppConfig.projectsDir`), allowed when it exists.
   *
   * Optional because it is derived from config and does not have to be set, and **skipped when absent**
   * rather than created here: `normalizeFolderPath` refuses a path that does not exist, and inventing one at
   * this depth is what would put a directory into the operator's home folder on every test suite that
   * bootstraps. `kampaku bootstrap` and `serve` create it before calling this, so the operator's own path
   * always finds it present. An instance bootstrapped before the setting existed keeps its folder list as it
   * is; `settings folders add` is the documented way to grant one afterwards.
   */
  projectsDir?: string,
): { settings: FilesystemSettings; created: boolean } {
  const existing = store.getBootstrapState<FilesystemSettings>(SETTINGS_KEY);
  if (existing?.folders?.length) {
    return { settings: existing, created: false };
  }

  // **No home folder.** It was granted here from the first bootstrap and it was the defect: `$HOME`
  // read-write puts the operator's SSH keys, cloud credentials and the platform checkout inside every job's
  // reach, so isolation rested on the model's restraint (BOARD F-015, re-measured on suite 14's `s14r1`,
  // 2026-10-30). A project's own checkout is granted by `projectsDir`, the platform's own tree by
  // `workspaceRoot`, and anything else is the operator's explicit `settings folders add`.
  const folders: AllowedFolder[] = [];

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

  if (projectsDir && existsSync(projectsDir)) {
    const projectsPath = normalizeFolderPath(projectsDir);
    if (!folders.some((folder) => folder.path === projectsPath)) {
      folders.push({
        id: uuidv4(),
        path: projectsPath,
        label: "projects",
        readOnly: false,
      });
    }
  }

  const settings: FilesystemSettings = { folders };
  saveFilesystemSettings(store, settings);
  return { settings, created: true };
}

export function addAllowedFolder(
  store: Store,
  input: {
    path: string;
    label?: string;
    readOnly?: boolean;
    /**
     * The operator's explicit acceptance of the home directory or a system path.
     *
     * Off by default because the refusal is the product's default posture, and `true` only when the caller says
     * so in its own words — never inferred from a `~` that expanded to `$HOME`.
     */
    allowOutsideProjectScope?: boolean;
  },
): FilesystemSettings {
  const normalized = normalizeFolderPath(input.path);
  const settings = getFilesystemSettings(store);

  if (!input.allowOutsideProjectScope && isForbiddenGrant(normalized)) {
    throw new Error(
      `Refusing to grant ${normalized}: the home directory and system paths are outside a project's scope. ` +
        "A job's reach is the folders already granted plus the project's own checkout, and credentials under " +
        "the home directory are never work material. If this grant is genuinely intended, repeat the call " +
        "stating that it crosses the boundary.",
    );
  }

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

import type { KampakuToolContext } from "./index.js";
import { getFilesystemSettings } from "../../../application/settings/filesystem.js";

export interface ListAllowedFoldersArgs {
  /** When set, highlight the stranger project linked path if present in settings. */
  project_slug_or_id?: string;
}

/**
 * List allowed filesystem folders. Does not invent $HOME access.
 * Scenario copy stays in callers — this tool only reports configured policy.
 */
export function executeListAllowedFolders(
  ctx: KampakuToolContext,
  args: ListAllowedFoldersArgs = {},
): {
  folders: Array<{ id: string; path: string; label?: string; readOnly: boolean }>;
  projectSlug?: string;
  notes: string[];
} {
  const settings = getFilesystemSettings(ctx.store);
  const folders = settings.folders
    .filter((folder) => folder.label !== "home")
    .map((folder) => ({
      id: folder.id,
      path: folder.path,
      label: folder.label,
      readOnly: folder.readOnly ?? false,
    }));

  const notes: string[] = [
    "Sensitive paths (.ssh, /etc/passwd, secret env files) are refused even inside allowed folders.",
    "Platform workspace folders are typically read-only; stranger project paths are writable when linked.",
  ];

  let projectSlug: string | undefined;
  if (args.project_slug_or_id?.trim()) {
    const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
    if (project) {
      projectSlug = project.slug;
      const linked = project.repositories
        .filter((repo) => repo.url.startsWith("file://"))
        .map((repo) => repo.url.replace(/^file:\/\//, ""));
      if (linked.length === 0) {
        notes.push(`Project ${project.slug} has no linked file:// repository yet.`);
      } else {
        notes.push(`Project ${project.slug} linked paths: ${linked.join(", ")}`);
      }
    }
  }

  return { folders, projectSlug, notes };
}

export const LIST_ALLOWED_FOLDERS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_allowed_folders",
    description:
      "List configured allowed filesystem folders (not $HOME by default). Optional project_slug_or_id annotates linked stranger paths. Sensitive paths remain refused. Kampaku may use this before answering path-bound questions.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: { type: "string" },
      },
    },
  },
};

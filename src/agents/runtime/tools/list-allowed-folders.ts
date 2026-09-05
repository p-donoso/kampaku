import type { KampakuToolContext } from "./index.js";
import { getFilesystemSettings } from "../../../application/settings/filesystem.js";

export function executeListAllowedFolders(ctx: KampakuToolContext): {
  folders: Array<{ id: string; path: string; label?: string; readOnly: boolean }>;
} {
  const settings = getFilesystemSettings(ctx.store);
  return {
    folders: settings.folders.map((folder) => ({
      id: folder.id,
      path: folder.path,
      label: folder.label,
      readOnly: folder.readOnly ?? false,
    })),
  };
}

export const LIST_ALLOWED_FOLDERS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_allowed_folders",
    description:
      "List globally allowed filesystem folders Kampaku and workers may read or write. Use when planning work that touches files outside the default workspace.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

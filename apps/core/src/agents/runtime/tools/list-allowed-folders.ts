import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";
import {
  describeFilesystemBoundaries,
  homeDirectory,
  type FilesystemBoundaryDescription,
} from "../../../application/settings/filesystem.js";

export interface AllowedFoldersResult extends FilesystemBoundaryDescription {
  /**
   * Whose reach this answer describes, and what that means for the caller.
   *
   * The tool used to return one global list and nothing else, so *"which folders can each role actually
   * reach?"* had no answer on any surface: the platform's own settings hold the grants, and a seat's reach is
   * the grants **intersected with its own root**. Measured on suite 14's `s14r1` (2026-10-30): the seat the
   * emperor asked answered *"I hold no tool that measures per-role filesystem permissions"* — honest, and a
   * measurement the suite could not take.
   */
  role: {
    slug: string;
    /** Granted folders this seat may read, as resolved paths. */
    read: string[];
    /** Granted folders this seat may write. A worker is additionally confined to its project's own checkout. */
    write: string[];
    /** The root a job's writes are further confined to, when the caller names one. */
    jobRoot?: string;
    /** How the seat's reach differs from the platform's grants, in one sentence. */
    note: string;
  };
}

/**
 * Lists the filesystem boundary an operator and a seat can both read.
 *
 * Three facts, and each one is a refusal the suite asks for: what is granted, what is refused and why, and what
 * *this* role can actually reach. The last one is not derivable from the first two by the reader, which is why
 * it is rendered here instead of left to a reply.
 */
export function executeListAllowedFolders(
  ctx: KampakuToolContext,
  args: { agent_slug?: string } = {},
  scope?: ToolRuntimeScope,
): AllowedFoldersResult {
  const boundaries = describeFilesystemBoundaries(ctx.store);
  const slug = args.agent_slug?.trim();
  const agent = slug ? ctx.agentStore.getAgentBySlugOrId(slug) : undefined;

  // `read_repository` is the only filesystem read a seat holds, and it is confined to one project's checkout.
  // `execute_work_item` runs a job, whose writes are confined to the checkout its job names. Both are narrower
  // than the platform's grants, and saying so is the difference between a policy and a claim.
  const read = boundaries.granted.map((folder) => folder.path);
  const write = boundaries.granted.filter((folder) => !folder.readOnly).map((folder) => folder.path);
  const home = homeDirectory();
  const note = agent
    ? `\"${agent.slug}\" reaches the folders above as policy, and its own tools narrow that further: a project ` +
      "read stays inside that project's checkout, and a job's writes stay inside the checkout it was leased for."
    : "These are the platform's grants. Any single seat reaches less: a project read stays inside that " +
      "project's checkout, and a job's writes stay inside the checkout it was leased for.";

  return {
    ...boundaries,
    role: {
      slug: agent?.slug ?? slug ?? "this seat",
      read,
      write,
      note: home ? note : `${note} No home directory is granted.`,
    },
  };
}

export const LIST_ALLOWED_FOLDERS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_allowed_folders",
    description:
      "List the filesystem boundary: the folders granted to jobs and agents, the paths and rules that are " +
      "refused, and what the named role can actually read and write. Use it to answer which folders a role " +
      "reaches and which are refused, rather than describing the policy from memory.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: {
          type: "string",
          description: "Agent whose reach is described. Omit for the platform's grants as a whole.",
        },
      },
    },
  },
};

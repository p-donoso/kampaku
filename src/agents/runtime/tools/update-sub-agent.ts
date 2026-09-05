import type { AgentStore } from "../../../persistence/agent-store.js";

export interface UpdateSubAgentArgs {
  slug: string;
  name?: string;
  responsibilities?: string;
  system_prompt?: string;
  parent_slug?: string;
}

export interface UpdateSubAgentResult {
  id: string;
  slug: string;
  name: string;
  parentSlug: string | null;
}

export function executeUpdateSubAgent(
  store: AgentStore,
  args: UpdateSubAgentArgs,
): UpdateSubAgentResult {
  const existing = store.getAgentBySlugOrId(args.slug);
  if (!existing || existing.source === "builtin") {
    throw new Error(`Agent "${args.slug}" not found.`);
  }

  let parentId: string | undefined;
  if (args.parent_slug !== undefined) {
    const parent = store.getAgentBySlugOrId(args.parent_slug.trim().toLowerCase());
    if (!parent) {
      throw new Error(`Parent agent "${args.parent_slug}" not found.`);
    }
    parentId = parent.id;
  }

  const updated = store.updateAgent(args.slug, {
    name: args.name,
    responsibilities: args.responsibilities,
    systemPrompt: args.system_prompt,
    parentId,
  });

  const parentSlug =
    updated.parentId === store.getKampakuAgent().id
      ? "kampaku"
      : store.getAgentBySlugOrId(updated.parentId ?? "")?.slug ?? null;

  return { id: updated.id, slug: updated.slug, name: updated.name, parentSlug };
}

export const UPDATE_SUB_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_sub_agent",
    description: "Update a generated sub-agent's name, responsibilities, system prompt, or parent.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Slug of the agent to update.",
        },
        name: {
          type: "string",
          description: "New display name.",
        },
        responsibilities: {
          type: "string",
          description: "New responsibilities.",
        },
        system_prompt: {
          type: "string",
          description: "New system prompt.",
        },
        parent_slug: {
          type: "string",
          description: "Move the agent under a different parent.",
        },
      },
      required: ["slug"],
    },
  },
};

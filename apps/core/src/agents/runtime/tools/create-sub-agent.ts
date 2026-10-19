import type { AgentStore } from "../../../persistence/agent-store.js";
import { provisionSubAgent } from "../../../application/agents.js";
import type { SkillStore } from "../../../persistence/skill-store.js";
import { AgentStoreError } from "../../../persistence/agent-store.js";
import {
  assessStaffingRoster,
  type StaffingAssessment,
  type StaffingSeat,
} from "../../../delegator/roster-reconciliation.js";
import type { AgentRecord } from "../../types.js";

export interface CreateSubAgentArgs {
  slug: string;
  name: string;
  responsibilities: string;
  system_prompt: string;
  parent_slug?: string;
  skill_slugs?: string[];
}

/**
 * What a create call tells its caller: the seat, and **the roster read off the tree beside it**.
 *
 * The receipt this used to be (`{id, slug, name}`) is the defect BOARD F-006 measured. A turn proposing
 * five stations called five times, got five receipts, and described a team from its own proposal: the
 * seats were real on `s03r3`, the skills were not, and only one sentence of prose said so. The turn could
 * not have done better — nothing in either result compared the proposal against the store.
 *
 * So the result now carries three things a reply can be written from:
 *
 * 1. `created` and, on a refusal, `error` — the store's own sentence, so "which station was not created"
 *    is answerable without the reply guessing at the reason.
 * 2. `seat` — this station as the tree holds it, with the skills assigned to it. Absent when it was not
 *    created, which is the honest shape of a refusal.
 * 3. `roster` — the seats that exist under that lead with their skills, and one finding per difference
 *    from what this call proposed (a seat missing, a skill not granted). `roster.summary` is the block to
 *    print; it is absent when the proposal and the tree agree, so a clean staffing stays a short result.
 */
export interface CreateSubAgentResult {
  id?: string;
  slug: string;
  name?: string;
  /** `false` means the station does not exist; `error` says why in the store's own words. */
  created: boolean;
  error?: string;
  seat?: StaffingSeat;
  roster: StaffingAssessment;
}

export function executeCreateSubAgent(
  store: AgentStore,
  skillStore: SkillStore,
  args: CreateSubAgentArgs,
): CreateSubAgentResult {
  const parentSlug = args.parent_slug?.trim().toLowerCase() || "kampaku";
  const parent = store.getAgentBySlugOrId(parentSlug);
  if (!parent) {
    throw new Error(`Parent agent "${parentSlug}" not found.`);
  }

  const slug = args.slug.trim().toLowerCase();
  const proposal = [{ slug, skillSlugs: args.skill_slugs }];

  const assess = (refused?: Record<string, string>): StaffingAssessment =>
    assessStaffingRoster(store, skillStore, {
      leadSlug: parent.slug,
      proposal,
      ...(refused ? { refused } : {}),
    });

  // **A refusal is a result, not a throw.** A station the store refuses (a reserved slug, a duplicate, a
  // malformed slug) is exactly the outcome this tool must be able to *report*: thrown, it reached the
  // turn as `{"ok": false, error}`, which says a call failed and nothing about the team the turn was
  // building. Measured shape on `s03r2`: a second staffing turn created three more stations under the
  // same lead and no surface said the roster had changed under it — a refusal that returns the roster
  // cannot be read as "the team is what you proposed".
  let agent: AgentRecord;
  try {
    // The whole provisioning sequence lives in the application layer so every entry point inherits it.
    // This tool used to hold it, and the REST route did not — which is how a seat created through the API
    // ended up with zero skills (BOARD F-039).
    agent = provisionSubAgent(store, skillStore, {
      slug,
      name: args.name,
      responsibilities: args.responsibilities,
      systemPrompt: args.system_prompt.trim(),
      parentId: parent.id,
      skillSlugs: args.skill_slugs,
    });
  } catch (error) {
    if (!(error instanceof AgentStoreError)) throw error;
    const roster = assess({ [slug]: error.message });
    return { slug, created: false, error: error.message, roster };
  }

  const roster = assess();
  const seat = roster.seats.find((entry) => entry.slug === agent.slug);
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    created: true,
    ...(seat ? { seat } : {}),
    roster,
  };
}

export const CREATE_SUB_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_sub_agent",
    description:
      "Create a specialized sub-agent after the emperor explicitly approved the proposal in chat. Do not call without prior approval. Default workflow skills are assigned automatically. Declare skill_slugs for the durable capabilities this agent must own. The result returns the seats that exist under the parent with their skills, plus one finding per difference from what you proposed — report the team from that, not from the arguments you sent. Use parent_slug to nest under another agent (default: kampaku).",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Unique identifier using lowercase letters, numbers, and hyphens.",
        },
        name: {
          type: "string",
          description: "Display name for the sub-agent.",
        },
        responsibilities: {
          type: "string",
          description: "What this sub-agent is responsible for.",
        },
        system_prompt: {
          type: "string",
          description: "Full system prompt that defines the sub-agent behavior.",
        },
        parent_slug: {
          type: "string",
          description: "Parent agent slug. Defaults to kampaku for top-level sub-agents.",
        },
        skill_slugs: {
          type: "array",
          items: { type: "string" },
          description: "Existing skill slugs required for this agent's durable responsibility.",
        },
      },
      required: ["slug", "name", "responsibilities", "system_prompt"],
    },
  },
};

export type { AgentRecord };

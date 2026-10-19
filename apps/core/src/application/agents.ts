import type { SkillStore } from "../persistence/skill-store.js";
import type { AgentRecord, AgentTreeNode, CreateSubAgentInput } from "../agents/types.js";
import { AgentStore, AgentStoreError } from "../persistence/agent-store.js";
import type { Db } from "../persistence/db.js";

export { AgentStoreError };

export function createAgentStore(db: Db): AgentStore {
  return new AgentStore(db);
}

/**
 * A seat as the roster reads it: the capability list, and **which of them this project authored**.
 *
 * `skills` answered `13` for suite 03's `s3-infra-network` and all thirteen were defaults — a count that
 * reads as staffed and is not. The split is what lets a reader tell a station with a capability for its
 * aspect from one that merely has the floor (BOARD F-022).
 */
export function enrichAgent(agent: AgentRecord, skillStore: SkillStore): AgentRecord {
  const skills = skillStore.listAgentSkills(agent.id);
  if (skills.length === 0) {
    return { ...agent, skills, capability: skillStore.capabilityReport(agent.id) };
  }
  const catalog = new Map(skillStore.listSkills().map((skill) => [skill.slug, skill]));
  return {
    ...agent,
    skills,
    projectSkills: skills.filter((slug) => catalog.get(slug)?.projectId),
    capability: skillStore.capabilityReport(agent.id),
  };
}

export function enrichTree(tree: AgentTreeNode[], skillStore: SkillStore): AgentTreeNode[] {
  return tree.map((node) => ({
    agent: enrichAgent(node.agent, skillStore),
    children: enrichTree(node.children, skillStore),
  }));
}

export function listAgents(store: AgentStore, skillStore?: SkillStore): AgentRecord[] {
  const agents = store.listAllAgents();
  if (!skillStore) return agents;
  return agents.map((agent) => enrichAgent(agent, skillStore));
}

export function getAgentTree(store: AgentStore, skillStore?: SkillStore): AgentTreeNode[] {
  const tree = store.buildTree();
  if (!skillStore) return tree;
  return enrichTree(tree, skillStore);
}

export function getAgent(
  store: AgentStore,
  slugOrId: string,
  skillStore?: SkillStore,
): AgentRecord | undefined {
  const agent = store.getAgentBySlugOrId(slugOrId);
  if (!agent) return undefined;
  return skillStore ? enrichAgent(agent, skillStore) : agent;
}

export function createSubAgent(
  store: AgentStore,
  input: Omit<CreateSubAgentInput, "parentId"> & { parentId?: string },
): AgentRecord {
  return store.createSubAgent({
    ...input,
    parentId: input.parentId ?? store.getKampakuAgent().id,
  });
}

/**
 * Provisions a seat: creates the agent **and everything that makes it able to work**.
 *
 * Why this is one function and not three calls at each entry point. `create_sub_agent` used to do this
 * sequence itself, and the REST route added for BOARD F-036 created the agent and stopped — so a seat made
 * through the API had **zero skills** and no skill appendix in its system prompt, while the same seat made
 * through chat had fifteen skills and the appendix. Measured in the suite-03 run: `infra-lead`, created
 * through REST, reported `skills=0`, beside four specialists created through the tool at 15/15/15/17.
 *
 * Two surfaces producing different capabilities from the same operation is the defect this repository keeps
 * meeting — F-033's four doors onto one validation rule, F-035's unmapped duplicate, F-038's reply naming a
 * tool it cannot use. The lesson is already recorded in LEARNINGS ("a validator in one call site protects
 * one call site"); this is that lesson applied to agent creation, so the next entry point inherits the
 * sequence instead of having to remember it.
 *
 * What it does **not** do is describe the seat it made. A caller that wants to report a team reads it back
 * from the tree — `assessStaffingRoster` in `delegator/roster-reconciliation.ts` — because a return value
 * composed here is the proposal's own account, and a proposal is what BOARD F-006 measured going wrong.
 */
export function provisionSubAgent(
  agentStore: AgentStore,
  skillStore: SkillStore,
  input: {
    slug: string;
    name: string;
    responsibilities: string;
    systemPrompt: string;
    parentId?: string;
    skillSlugs?: string[];
  },
): AgentRecord {
  const agent = createSubAgent(agentStore, {
    slug: input.slug,
    name: input.name,
    responsibilities: input.responsibilities,
    systemPrompt: input.systemPrompt,
    parentId: input.parentId,
  });

  // The defaults first, so a seat is never created with nothing.
  skillStore.syncDefaultSkillsForAgent(agent.id);
  // **A skill this catalog does not hold is skipped, not fatal** — and the seat still carries the ones
  // that do exist. `assignSkill` throws `Skill "x" not found.`, and it used to do so *here*, after the
  // agent row was already written: a proposal naming one unknown slug therefore created a seat with the
  // defaults, no skill appendix, and an error for the caller — so the seat existed, the caller was told
  // the call failed, and a retry hit `already exists` (BOARD F-006, measured on `s03r3` where a turn
  // mapped six made-up slugs onto real ones by hand to avoid exactly this).
  //
  // Skipping is the deliberate half. BOARD F-022 is the row that would author the missing skill; this
  // row is about *saying* what happened, so the capability difference is reported where the roster is
  // read (`assessStaffingRoster`) rather than made into a refusal to staff.
  for (const skillSlug of input.skillSlugs ?? []) {
    if (!skillStore.getSkill(skillSlug)) continue;
    skillStore.assignSkill(agent.id, skillSlug);
  }

  // And the appendix, because a skill the agent holds but whose instructions are not in its prompt is a
  // capability on paper only.
  const appendix = skillStore.buildSkillPromptAppendix(agent.id);
  if (appendix) {
    agentStore.updateAgent(agent.slug, { systemPrompt: `${agent.systemPrompt}${appendix}` });
  }

  return agentStore.getAgentBySlugOrId(agent.slug) ?? agent;
}

export function deleteAgent(store: AgentStore, slugOrId: string): void {
  store.deleteAgent(slugOrId);
}

export function updateAgent(
  store: AgentStore,
  slugOrId: string,
  input: {
    name?: string;
    responsibilities?: string;
    systemPrompt?: string;
    parentSlug?: string;
  },
): AgentRecord {
  const parentId =
    input.parentSlug !== undefined
      ? store.getAgentBySlugOrId(input.parentSlug)?.id
      : undefined;

  if (input.parentSlug !== undefined && !parentId) {
    throw new AgentStoreError(`Parent agent "${input.parentSlug}" not found.`, "NOT_FOUND");
  }

  return store.updateAgent(slugOrId, {
    name: input.name,
    responsibilities: input.responsibilities,
    systemPrompt: input.systemPrompt,
    parentId,
  });
}

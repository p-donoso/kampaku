import type { SkillStore } from "../persistence/skill-store.js";
import type { AgentRecord, AgentTreeNode, CreateSubAgentInput } from "../agents/types.js";
import { AgentStore, AgentStoreError } from "../persistence/agent-store.js";
import type { Db } from "../persistence/db.js";

export { AgentStoreError };

export function createAgentStore(db: Db): AgentStore {
  return new AgentStore(db);
}

export function enrichAgent(agent: AgentRecord, skillStore: SkillStore): AgentRecord {
  return {
    ...agent,
    skills: skillStore.listAgentSkills(agent.id),
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

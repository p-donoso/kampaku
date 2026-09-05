import { eq, inArray, sql } from "drizzle-orm";
import type { AppConfig } from "../config.js";
import { bootstrapProject } from "./projects.js";
import type { Db } from "../persistence/db.js";
import { AgentStore } from "../persistence/agent-store.js";
import { agentMemories, agents, agentSkills } from "../persistence/schema.js";
import type { Store } from "../persistence/store.js";

export interface SystemResetResult {
  mode: "bootstrap" | "all";
  deletedAgents: string[];
  createdAgents: string[];
  inheritedLearnings: number;
}

export function resetBootstrapAgents(
  store: Store,
  config: AppConfig,
  db: Db,
  keepLearnings: boolean,
): SystemResetResult {
  const agentStore = new AgentStore(db);
  const bootstrapAgents = agentStore.listGeneratedAgents().filter((agent) => agent.source === "bootstrap");
  const oldIds = bootstrapAgents.map((agent) => agent.id);
  const slugByOldId = new Map(bootstrapAgents.map((agent) => [agent.id, agent.slug]));
  const retainedParentSlugs = agentStore.listGeneratedAgents()
    .filter((agent) => agent.source !== "bootstrap" && agent.parentId && oldIds.includes(agent.parentId))
    .map((agent) => ({ agentId: agent.id, parentSlug: slugByOldId.get(agent.parentId!)! }));
  const learnings = keepLearnings && oldIds.length > 0
    ? db.select().from(agentMemories).where(inArray(agentMemories.agentId, oldIds)).all()
        .filter((memory) => memory.kind === "learning")
    : [];

  for (const retained of retainedParentSlugs) agentStore.updateAgent(retained.agentId, { parentId: "kampaku" });

  const deletedAgents: string[] = [];
  const pending = new Set(bootstrapAgents.map((agent) => agent.id));
  while (pending.size > 0) {
    const all = agentStore.listGeneratedAgents();
    const parentIds = new Set(all.map((agent) => agent.parentId));
    const leaves = all.filter((agent) => pending.has(agent.id) && !parentIds.has(agent.id));
    if (leaves.length === 0) throw new Error("Bootstrap agents cannot be reset while they own non-bootstrap sub-agents.");
    for (const agent of leaves) {
      agentStore.deleteAgent(agent.id);
      pending.delete(agent.id);
      deletedAgents.push(agent.slug);
    }
  }

  if (oldIds.length > 0) {
    db.delete(agentSkills).where(inArray(agentSkills.agentId, oldIds)).run();
    db.delete(agentMemories).where(inArray(agentMemories.agentId, oldIds)).run();
  }

  const result = bootstrapProject(store, config, db);
  let inheritedLearnings = 0;
  for (const memory of learnings) {
    const slug = slugByOldId.get(memory.agentId);
    const replacement = slug ? agentStore.getAgentBySlugOrId(slug) : undefined;
    if (!replacement) continue;
    db.insert(agentMemories).values({ ...memory, agentId: replacement.id }).run();
    inheritedLearnings += 1;
  }
  for (const retained of retainedParentSlugs) {
    const replacement = agentStore.getAgentBySlugOrId(retained.parentSlug);
    if (replacement) agentStore.updateAgent(retained.agentId, { parentId: replacement.id });
  }

  return {
    mode: "bootstrap",
    deletedAgents,
    createdAgents: result.platformTeam.created,
    inheritedLearnings,
  };
}

export function resetAllData(store: Store, config: AppConfig, db: Db): SystemResetResult {
  const tableNames = [
    "agent_memories", "work_item_journal_entries", "agent_blockages", "agent_questions",
    "agent_skills", "chat_messages", "conversations", "delegation_events", "work_items",
    "roadmap_milestones", "wiki_page_comments", "project_documents", "job_results", "jobs",
    "tasks", "goals", "workers", "events", "agents", "skills", "projects", "bootstrap_state",
  ];
  for (const name of tableNames) db.run(sql.raw(`DELETE FROM "${name}"`));
  bootstrapProject(store, config, db);

  const createdAgents = db.select({ slug: agents.slug }).from(agents).where(eq(agents.source, "bootstrap")).all();
  return {
    mode: "all",
    deletedAgents: [],
    createdAgents: createdAgents.map((agent) => agent.slug),
    inheritedLearnings: 0,
  };
}

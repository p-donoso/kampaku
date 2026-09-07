import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getKampakuBuiltinAgent, isKampakuBuiltinId, KAMPAKU_AGENT_ID } from "../agents/definitions.js";
import type {
  AgentRecord,
  AgentSource,
  AgentStatus,
  AgentTreeNode,
  CreateSubAgentInput,
} from "../agents/types.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { agents, conversations, events } from "./schema.js";

const RESERVED_SLUGS = new Set(["kampaku"]);

export class AgentStoreError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "VALIDATION",
  ) {
    super(message);
    this.name = "AgentStoreError";
  }
}

export class AgentStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  getKampakuAgent(): AgentRecord {
    return getKampakuBuiltinAgent();
  }

  listGeneratedAgents(): AgentRecord[] {
    return this.db
      .select()
      .from(agents)
      .all()
      .map((row) => this.mapRow(row));
  }

  listAllAgents(): AgentRecord[] {
    return [this.getKampakuAgent(), ...this.listGeneratedAgents()];
  }

  getAgentBySlugOrId(slugOrId: string): AgentRecord | undefined {
    if (slugOrId === "kampaku" || isKampakuBuiltinId(slugOrId)) {
      return this.getKampakuAgent();
    }

    const bySlug = this.db.select().from(agents).where(eq(agents.slug, slugOrId)).get();
    if (bySlug) return this.mapRow(bySlug);

    const byId = this.db.select().from(agents).where(eq(agents.id, slugOrId)).get();
    if (byId) return this.mapRow(byId);

    return undefined;
  }

  createSubAgent(input: CreateSubAgentInput): AgentRecord {
    const slug = input.slug.trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new AgentStoreError(
        "Slug must contain only lowercase letters, numbers, and hyphens.",
        "VALIDATION",
      );
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new AgentStoreError(`Slug "${slug}" is reserved.`, "FORBIDDEN");
    }
    if (this.getAgentBySlugOrId(slug)) {
      throw new AgentStoreError(`Agent with slug "${slug}" already exists.`, "CONFLICT");
    }

    const parent = this.getAgentBySlugOrId(input.parentId);
    if (!parent) {
      throw new AgentStoreError("Parent agent not found.", "NOT_FOUND");
    }

    const record: AgentRecord = {
      id: uuidv4(),
      slug,
      name: input.name.trim(),
      parentId: parent.id,
      source: input.source ?? "generated",
      responsibilities: input.responsibilities.trim(),
      systemPrompt: input.systemPrompt.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
    };

    this.db.insert(agents).values({
      id: record.id,
      slug: record.slug,
      name: record.name,
      parentId: record.parentId,
      source: record.source,
      responsibilities: record.responsibilities,
      systemPrompt: record.systemPrompt,
      status: record.status,
      createdAt: record.createdAt,
    }).run();

    this.recordEvent("agent.created", record.id, {
      agentId: record.id,
      slug: record.slug,
      parentId: record.parentId,
    });

    return record;
  }

  updateAgent(
    slugOrId: string,
    input: {
      name?: string;
      responsibilities?: string;
      systemPrompt?: string;
      parentId?: string;
    },
  ): AgentRecord {
    const agent = this.getAgentBySlugOrId(slugOrId);
    if (!agent) {
      throw new AgentStoreError("Agent not found.", "NOT_FOUND");
    }
    if (agent.source === "builtin") {
      throw new AgentStoreError("Built-in agents cannot be updated.", "FORBIDDEN");
    }

    let parentId = agent.parentId;
    if (input.parentId !== undefined) {
      const parent = this.getAgentBySlugOrId(input.parentId);
      if (!parent) {
        throw new AgentStoreError("Parent agent not found.", "NOT_FOUND");
      }
      if (this.wouldCreateCycle(agent.id, parent.id)) {
        throw new AgentStoreError("Cannot move an agent under its own descendant.", "VALIDATION");
      }
      parentId = parent.id;
    }

    const updated: AgentRecord = {
      ...agent,
      name: input.name?.trim() || agent.name,
      responsibilities: input.responsibilities?.trim() || agent.responsibilities,
      systemPrompt: input.systemPrompt?.trim() || agent.systemPrompt,
      parentId,
    };

    this.db
      .update(agents)
      .set({
        name: updated.name,
        responsibilities: updated.responsibilities,
        systemPrompt: updated.systemPrompt,
        parentId: updated.parentId,
      })
      .where(eq(agents.id, agent.id))
      .run();

    this.recordEvent("agent.updated", updated.id, {
      agentId: updated.id,
      slug: updated.slug,
      parentId: updated.parentId,
    });

    return updated;
  }

  renameAgentSlug(slugOrId: string, newSlug: string): AgentRecord {
    const agent = this.getAgentBySlugOrId(slugOrId);
    if (!agent) {
      throw new AgentStoreError("Agent not found.", "NOT_FOUND");
    }
    if (agent.source === "builtin") {
      throw new AgentStoreError("Built-in agents cannot be renamed.", "FORBIDDEN");
    }

    const slug = newSlug.trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new AgentStoreError(
        "Slug must contain only lowercase letters, numbers, and hyphens.",
        "VALIDATION",
      );
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new AgentStoreError(`Slug "${slug}" is reserved.`, "FORBIDDEN");
    }
    if (slug === agent.slug) return agent;

    const conflict = this.getAgentBySlugOrId(slug);
    if (conflict && conflict.id !== agent.id) {
      throw new AgentStoreError(`Agent with slug "${slug}" already exists.`, "CONFLICT");
    }

    this.db.update(agents).set({ slug }).where(eq(agents.id, agent.id)).run();
    this.db
      .update(conversations)
      .set({ agentSlug: slug })
      .where(eq(conversations.agentSlug, agent.slug))
      .run();

    const updated = { ...agent, slug };
    this.recordEvent("agent.updated", updated.id, {
      agentId: updated.id,
      slug: updated.slug,
      previousSlug: agent.slug,
    });

    return updated;
  }

  deleteAgent(slugOrId: string): void {
    const agent = this.getAgentBySlugOrId(slugOrId);
    if (!agent) {
      throw new AgentStoreError("Agent not found.", "NOT_FOUND");
    }
    if (agent.source === "builtin") {
      throw new AgentStoreError("Built-in agents cannot be deleted.", "FORBIDDEN");
    }

    const children = this.listGeneratedAgents().filter((item) => item.parentId === agent.id);
    if (children.length > 0) {
      throw new AgentStoreError(
        "Cannot delete an agent that has sub-agents. Delete children first.",
        "FORBIDDEN",
      );
    }

    this.db.delete(agents).where(eq(agents.id, agent.id)).run();
    this.recordEvent("agent.deleted", agent.id, { agentId: agent.id, slug: agent.slug });
  }

  markAgentAsBootstrap(slugOrId: string): void {
    const agent = this.getAgentBySlugOrId(slugOrId);
    if (!agent || agent.source === "builtin") return;
    this.db.update(agents).set({ source: "bootstrap" }).where(eq(agents.id, agent.id)).run();
  }

  deleteAllGeneratedAgents(): string[] {
    const deleted: string[] = [];

    while (true) {
      const all = this.listGeneratedAgents();
      if (all.length === 0) break;

      const parentIds = new Set(all.map((agent) => agent.parentId));
      const leaves = all.filter((agent) => !parentIds.has(agent.id));
      if (leaves.length === 0) {
        throw new AgentStoreError("Agent tree cycle detected while clearing agents.", "VALIDATION");
      }

      for (const leaf of leaves) {
        this.deleteAgent(leaf.slug);
        deleted.push(leaf.slug);
      }
    }

    return deleted;
  }

  buildTree(): AgentTreeNode[] {
    const all = this.listAllAgents();
    const byParent = new Map<string | null, AgentRecord[]>();

    for (const agent of all) {
      const key = agent.parentId;
      const bucket = byParent.get(key) ?? [];
      bucket.push(agent);
      byParent.set(key, bucket);
    }

    const build = (parentId: string | null): AgentTreeNode[] => {
      const nodes = byParent.get(parentId) ?? [];
      return nodes
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map((agent) => ({
          agent,
          children: build(agent.id),
        }));
    };

    return build(null);
  }

  getDescendantIds(agentId: string): string[] {
    const all = this.listAllAgents();
    const descendants: string[] = [];

    const collect = (parentId: string) => {
      for (const agent of all) {
        if (agent.parentId === parentId) {
          descendants.push(agent.id);
          collect(agent.id);
        }
      }
    };

    collect(agentId);
    return descendants;
  }

  getAgentIdsWithSubordinates(agentId: string): string[] {
    return [agentId, ...this.getDescendantIds(agentId)];
  }

  isLeafAgent(agentId: string): boolean {
    return !this.listAllAgents().some((agent) => agent.parentId === agentId);
  }

  private wouldCreateCycle(agentId: string, newParentId: string): boolean {
    let current: string | null = newParentId;
    while (current) {
      if (current === agentId) return true;
      const node = this.listAllAgents().find((item) => item.id === current);
      current = node?.parentId ?? null;
    }
    return false;
  }

  private mapRow(row: typeof agents.$inferSelect): AgentRecord {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      parentId: row.parentId ?? null,
      source: row.source as AgentSource,
      responsibilities: row.responsibilities,
      systemPrompt: row.systemPrompt,
      status: row.status as AgentStatus,
      createdAt: row.createdAt,
    };
  }

  private recordEvent(
    eventType: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): void {
    this.db.insert(events).values({
      id: uuidv4(),
      eventType,
      correlationId,
      payloadJson: JSON.stringify(payload),
      occurredAt: new Date().toISOString(),
    }).run();
  }
}

export { KAMPAKU_AGENT_ID };

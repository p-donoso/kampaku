import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { agentMemories } from "./schema.js";

export type MemoryKind = "log" | "learning";

export interface AgentMemory {
  id: string;
  agentId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  summary: string | null;
  relevance: number;
  projectId: string | null;
  conversationId: string | null;
  workItemId: string | null;
  metadata: Record<string, unknown>;
  accessCount: number;
  firstAccessedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class MemoryStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  create(input: {
    agentId: string;
    kind: MemoryKind;
    title: string;
    body: string;
    summary?: string;
    relevance?: number;
    projectId?: string;
    conversationId?: string;
    workItemId?: string;
    metadata?: Record<string, unknown>;
  }): AgentMemory {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new Error("Memory title and body are required.");
    const now = new Date().toISOString();
    const relevance = Math.max(1, Math.min(5, Math.round(input.relevance ?? 3)));
    const row = {
      id: uuidv4(), agentId: input.agentId, kind: input.kind, title, body,
      summary: input.summary?.trim() || null, relevance,
      projectId: input.projectId ?? null, conversationId: input.conversationId ?? null,
      workItemId: input.workItemId ?? null, metadataJson: JSON.stringify(input.metadata ?? {}),
      accessCount: 0, firstAccessedAt: null, lastAccessedAt: null,
      createdAt: now, updatedAt: now,
    };
    this.db.insert(agentMemories).values(row).run();
    return this.map(row);
  }

  list(input: { agentId: string; kind?: MemoryKind; query?: string; projectId?: string; limit?: number; recordAccess?: boolean }): AgentMemory[] {
    const filters = [eq(agentMemories.agentId, input.agentId)];
    if (input.kind) filters.push(eq(agentMemories.kind, input.kind));
    if (input.projectId) filters.push(eq(agentMemories.projectId, input.projectId));
    const query = input.query?.trim();
    if (query) {
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      filters.push(or(like(agentMemories.title, pattern), like(agentMemories.body, pattern), like(agentMemories.summary, pattern))!);
    }
    const rows = this.db.select().from(agentMemories).where(and(...filters))
      .orderBy(desc(agentMemories.relevance), desc(agentMemories.createdAt))
      .limit(Math.max(1, Math.min(input.limit ?? 50, 100))).all();
    if (input.recordAccess && rows.length > 0) {
      const accessedAt = new Date().toISOString();
      const ids = rows.map((row) => row.id);
      this.db.update(agentMemories).set({
        accessCount: sql`${agentMemories.accessCount} + 1`,
        firstAccessedAt: sql`COALESCE(${agentMemories.firstAccessedAt}, ${accessedAt})`,
        lastAccessedAt: accessedAt,
      }).where(sql`${agentMemories.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`).run();
      return rows.map((row) => this.map({ ...row, accessCount: row.accessCount + 1,
        firstAccessedAt: row.firstAccessedAt ?? accessedAt, lastAccessedAt: accessedAt }));
    }
    return rows.map((row) => this.map(row));
  }

  count(agentId: string): { logs: number; learnings: number } {
    const rows = this.db.select({ kind: agentMemories.kind, count: sql<number>`count(*)` })
      .from(agentMemories).where(eq(agentMemories.agentId, agentId)).groupBy(agentMemories.kind).all();
    return {
      logs: Number(rows.find((row) => row.kind === "log")?.count ?? 0),
      learnings: Number(rows.find((row) => row.kind === "learning")?.count ?? 0),
    };
  }

  countAllByAgent(): Map<string, { logs: number; learnings: number }> {
    const rows = this.db
      .select({
        agentId: agentMemories.agentId,
        kind: agentMemories.kind,
        count: sql<number>`count(*)`,
      })
      .from(agentMemories)
      .groupBy(agentMemories.agentId, agentMemories.kind)
      .all();

    const result = new Map<string, { logs: number; learnings: number }>();
    for (const row of rows) {
      const existing = result.get(row.agentId) ?? { logs: 0, learnings: 0 };
      if (row.kind === "log") existing.logs = Number(row.count);
      else existing.learnings = Number(row.count);
      result.set(row.agentId, existing);
    }
    return result;
  }

  latestCreatedByAgent(): Map<string, string> {
    const rows = this.db
      .select({
        agentId: agentMemories.agentId,
        latest: sql<string>`max(${agentMemories.createdAt})`,
      })
      .from(agentMemories)
      .groupBy(agentMemories.agentId)
      .all();

    return new Map(rows.map((row) => [row.agentId, row.latest]));
  }

  private map(row: typeof agentMemories.$inferSelect): AgentMemory {
    return { ...row, kind: row.kind as MemoryKind, summary: row.summary ?? null,
      projectId: row.projectId ?? null, conversationId: row.conversationId ?? null,
      workItemId: row.workItemId ?? null, metadata: JSON.parse(row.metadataJson) as Record<string, unknown>,
      firstAccessedAt: row.firstAccessedAt ?? null, lastAccessedAt: row.lastAccessedAt ?? null };
  }
}

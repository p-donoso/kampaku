import { asc, desc, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../model-broker/types.js";
import type { Db } from "./db.js";
import { chatMessages, conversations } from "./schema.js";

export const MAX_HISTORY_MESSAGES = 100;
export const COMPACTION_THRESHOLD = 80;
export const KEEP_RECENT_MESSAGES = 40;

export interface ConversationRecord {
  id: string;
  agentSlug: string;
  projectId: string | null;
  title: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredChatMessage {
  id: string;
  conversationId: string;
  role: ChatMessage["role"];
  content: string;
  toolCallsJson: string | null;
  toolCallId: string | null;
  createdAt: string;
}

export class ConversationStoreError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION",
  ) {
    super(message);
    this.name = "ConversationStoreError";
  }
}

export class ConversationStore {
  constructor(private readonly db: Db) {}

  createConversation(input: {
    agentSlug?: string;
    projectId?: string;
    title?: string;
  } = {}): ConversationRecord {
    const now = new Date().toISOString();
    const record: ConversationRecord = {
      id: uuidv4(),
      agentSlug: input.agentSlug ?? "kampaku",
      projectId: input.projectId ?? null,
      title: input.title ?? null,
      summary: null,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(conversations).values({
      id: record.id,
      agentSlug: record.agentSlug,
      projectId: record.projectId,
      title: record.title,
      summary: record.summary,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }).run();

    return record;
  }

  getConversation(id: string): ConversationRecord | undefined {
    const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get();
    return row ? this.mapConversation(row) : undefined;
  }

  requireConversation(id: string): ConversationRecord {
    const conversation = this.getConversation(id);
    if (!conversation) {
      throw new ConversationStoreError("Conversation not found.", "NOT_FOUND");
    }
    return conversation;
  }

  listConversations(options: { agentSlug?: string; limit?: number } = {}): ConversationRecord[] {
    const limit = options.limit ?? 50;
    const rows = this.db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .all();

    const filtered = options.agentSlug
      ? rows.filter((row) => row.agentSlug === options.agentSlug)
      : rows;

    return filtered.map((row) => this.mapConversation(row));
  }

  latestByAgentSlug(): Map<string, string> {
    const rows = this.db.select().from(conversations).all();
    const result = new Map<string, string>();
    for (const row of rows) {
      const current = result.get(row.agentSlug);
      if (!current || row.updatedAt > current) {
        result.set(row.agentSlug, row.updatedAt);
      }
    }
    return result;
  }

  countMessages(conversationId: string): number {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .all().length;
  }

  getAllMessages(conversationId: string): StoredChatMessage[] {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt))
      .all()
      .map((row) => this.mapMessage(row));
  }

  getMessages(conversationId: string, limit = MAX_HISTORY_MESSAGES): StoredChatMessage[] {
    const rows = this.getAllMessages(conversationId);

    if (rows.length <= limit) {
      return rows;
    }

    return rows.slice(-limit);
  }

  getChatMessages(conversationId: string, limit = MAX_HISTORY_MESSAGES): ChatMessage[] {
    return this.getMessages(conversationId, limit).map((message) => this.toChatMessage(message));
  }

  appendMessage(
    conversationId: string,
    message: Omit<ChatMessage, "role"> & { role: ChatMessage["role"] },
  ): StoredChatMessage {
    this.requireConversation(conversationId);

    const record: StoredChatMessage = {
      id: uuidv4(),
      conversationId,
      role: message.role,
      content: message.content,
      toolCallsJson: message.tool_calls ? JSON.stringify(message.tool_calls) : null,
      toolCallId: message.tool_call_id ?? null,
      createdAt: new Date().toISOString(),
    };

    this.db.insert(chatMessages).values({
      id: record.id,
      conversationId: record.conversationId,
      role: record.role,
      content: record.content,
      toolCallsJson: record.toolCallsJson,
      toolCallId: record.toolCallId,
      createdAt: record.createdAt,
    }).run();

    this.db
      .update(conversations)
      .set({ updatedAt: record.createdAt })
      .where(eq(conversations.id, conversationId))
      .run();

    return record;
  }

  appendMessages(conversationId: string, messages: ChatMessage[]): StoredChatMessage[] {
    return messages.map((message) => this.appendMessage(conversationId, message));
  }

  compactMessages(
    conversationId: string,
    input: { summary: string; deleteMessageIds: string[] },
  ): void {
    this.requireConversation(conversationId);

    if (input.deleteMessageIds.length > 0) {
      this.db
        .delete(chatMessages)
        .where(inArray(chatMessages.id, input.deleteMessageIds))
        .run();
    }

    this.db
      .update(conversations)
      .set({
        summary: input.summary,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  setTitleIfEmpty(conversationId: string, title: string): void {
    const conversation = this.requireConversation(conversationId);
    if (conversation.title) return;

    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) return;

    this.db
      .update(conversations)
      .set({ title: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  updateTitle(conversationId: string, title: string): ConversationRecord {
    this.requireConversation(conversationId);
    const trimmed = title.trim().slice(0, 120);
    if (!trimmed) {
      throw new ConversationStoreError("Title cannot be empty.", "VALIDATION");
    }

    const updatedAt = new Date().toISOString();
    this.db
      .update(conversations)
      .set({ title: trimmed, updatedAt })
      .where(eq(conversations.id, conversationId))
      .run();

    return this.requireConversation(conversationId);
  }

  deleteConversation(conversationId: string): void {
    this.requireConversation(conversationId);
    this.db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId)).run();
    this.db.delete(conversations).where(eq(conversations.id, conversationId)).run();
  }

  private mapConversation(row: typeof conversations.$inferSelect): ConversationRecord {
    return {
      id: row.id,
      agentSlug: row.agentSlug,
      projectId: row.projectId ?? null,
      title: row.title ?? null,
      summary: row.summary ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapMessage(row: typeof chatMessages.$inferSelect): StoredChatMessage {
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as ChatMessage["role"],
      content: row.content,
      toolCallsJson: row.toolCallsJson ?? null,
      toolCallId: row.toolCallId ?? null,
      createdAt: row.createdAt,
    };
  }

  private toChatMessage(message: StoredChatMessage): ChatMessage {
    const chatMessage: ChatMessage = {
      role: message.role,
      content: message.content,
    };

    if (message.toolCallId) {
      chatMessage.tool_call_id = message.toolCallId;
    }

    if (message.toolCallsJson) {
      chatMessage.tool_calls = JSON.parse(message.toolCallsJson) as ChatMessage["tool_calls"];
    }

    return chatMessage;
  }
}

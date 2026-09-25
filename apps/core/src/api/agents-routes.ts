import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  deleteAgent,
  getAgent,
  getAgentTree,
  listAgents,
  updateAgent,
  AgentStoreError,
} from "../application/agents.js";
import { getAgentsRoster } from "../application/agents-roster.js";
import { runKampakuChat, KampakuChatError } from "../agents/runtime/session.js";
import type { KampakuToolContext } from "../agents/runtime/tools/index.js";
import type { AppConfig } from "../config.js";
import type { AgentStore } from "../persistence/agent-store.js";
import { ConversationStoreError, type ConversationStore } from "../persistence/conversation-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { SkillStore } from "../persistence/skill-store.js";
import type { Store } from "../persistence/store.js";
import type { MemoryStore, MemoryKind } from "../persistence/memory-store.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { RefusalStore } from "../persistence/refusal-store.js";

export function registerAgentRoutes(
  app: Hono,
  agentStore: AgentStore,
  config: AppConfig,
  store: Store,
  pmStore: PmStore,
  conversationStore: ConversationStore,
  skillStore: SkillStore,
  memoryStore?: MemoryStore,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
  /**
   * The durable record of refused work.
   *
   * It was missing from this context, and the omission was silent: `triage_intent` records a refusal in
   * `executeToolCall`, which skips the write when the store is absent, so a refusal made from **chat** was
   * classified and never recorded — while the CLI and REST paths both recorded. Measured in the suite-03
   * run: the reply named the boundary correctly and `GET /api/v1/refusals` returned `total: 0`. The tell is
   * in the reply itself, which lacked the "Recorded as refusal <id>" suffix that the recording branch adds.
   */
  refusalStore?: RefusalStore,
) {
  function buildChatContext(): KampakuToolContext {
    return {
      agentStore,
      store,
      pmStore,
      config,
      conversationStore,
      skillStore,
      memoryStore: memoryStore!,
      questionStore,
      blockageStore,
      journalStore,
      refusalStore,
    };
  }

  function mapChatError(error: unknown) {
    if (error instanceof KampakuChatError) {
      if (error.code === "PROVIDER_UNAVAILABLE") {
        return { status: 503 as const, body: { error: error.message, code: error.code } };
      }
      if (error.code === "CONVERSATION_NOT_FOUND") {
        return { status: 404 as const, body: { error: error.message, code: error.code } };
      }
    }
    return null;
  }

  app.get("/api/v1/conversations", (c) => {
    const agentSlug = c.req.query("agent_slug") ?? undefined;
    const limit = Number(c.req.query("limit") ?? "50");
    const conversations = conversationStore.listConversations({ agentSlug, limit });
    return c.json({ conversations });
  });

  app.get("/api/v1/conversations/:id", (c) => {
    const id = c.req.param("id");
    const conversation = conversationStore.getConversation(id);
    if (!conversation) return c.body(null, 404);
    const messages = conversationStore.getMessages(id);
    return c.json({ conversation, messages });
  });

  app.patch("/api/v1/conversations/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ title?: string }>();
    if (!body.title?.trim()) {
      return c.json({ error: "title is required" }, 400);
    }
    try {
      const conversation = conversationStore.updateTitle(id, body.title);
      return c.json({ conversation });
    } catch (error) {
      if (error instanceof ConversationStoreError) {
        const status = error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.delete("/api/v1/conversations/:id", (c) => {
    const id = c.req.param("id");
    try {
      conversationStore.deleteConversation(id);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof ConversationStoreError && error.code === "NOT_FOUND") {
        return c.json({ error: error.message, code: error.code }, 404);
      }
      throw error;
    }
  });

  app.post("/api/v1/agents/kampaku/chat", async (c) => {
    const body = await c.req.json<{
      message?: string;
      conversation_id?: string;
      project_id?: string;
    }>();
    if (!body.message?.trim()) {
      return c.json({ error: "message is required" }, 400);
    }

    try {
      const response = await runKampakuChat(
        buildChatContext(),
        config,
        {
          message: body.message.trim(),
          conversationId: body.conversation_id,
          projectId: body.project_id,
        },
      );
      return c.json({
        reply: response.reply,
        conversation_id: response.conversationId,
        toolsUsed: response.toolsUsed,
        agentUsed: response.agentUsed,
        model: response.model,
        contextTruncation: response.contextTruncation,
        unverified_claims: response.unverifiedClaims,
      });
    } catch (error) {
      const mapped = mapChatError(error);
      if (mapped) return c.json(mapped.body, mapped.status);
      throw error;
    }
  });

  app.post("/api/v1/agents/kampaku/chat/stream", async (c) => {
    const body = await c.req.json<{
      message?: string;
      conversation_id?: string;
      project_id?: string;
    }>();
    if (!body.message?.trim()) {
      return c.json({ error: "message is required" }, 400);
    }

    return streamSSE(c, async (stream) => {
      try {
        const response = await runKampakuChat(
          buildChatContext(),
          config,
          {
            message: body.message!.trim(),
            conversationId: body.conversation_id,
            projectId: body.project_id,
          },
          {
            onProgress: async (event) => {
              if (event.phase === "tool") {
                await stream.writeSSE({
                  event: "tool",
                  data: JSON.stringify({ tool: event.tool, label: event.label }),
                });
              } else if (event.phase === "pruning") {
                // Carries its numbers, not just its name: the point of reporting a context decision is
                // how much it bought.
                await stream.writeSSE({
                  event: "status",
                  data: JSON.stringify({
                    phase: event.phase,
                    cleared: event.cleared,
                    tokensSaved: event.tokensSaved,
                  }),
                });
              } else {
                await stream.writeSSE({
                  event: "status",
                  data: JSON.stringify({ phase: event.phase }),
                });
              }
            },
          },
        );
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({
            reply: response.reply,
            conversation_id: response.conversationId,
            toolsUsed: response.toolsUsed,
            agentUsed: response.agentUsed,
            model: response.model,
            contextTruncation: response.contextTruncation,
            unverified_claims: response.unverifiedClaims,
          }),
        });
      } catch (error) {
        const mapped = mapChatError(error);
        if (mapped) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify(mapped.body),
          });
        } else {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: error instanceof Error ? error.message : "Chat failed" }),
          });
        }
      }
    });
  });

  app.get("/api/v1/agents", (c) => {
    const tree = c.req.query("tree") === "true";
    if (tree) {
      return c.json({ tree: getAgentTree(agentStore, skillStore) });
    }
    return c.json({ agents: listAgents(agentStore, skillStore) });
  });

  app.get("/api/v1/agents/roster", (c) => {
    const tree = getAgentsRoster(
      store,
      pmStore,
      agentStore,
      skillStore,
      conversationStore,
      memoryStore,
    );
    return c.json({ tree });
  });

  app.get("/api/v1/agents/:slugOrId", (c) => {
    const slugOrId = c.req.param("slugOrId");
    if (slugOrId === "kampaku") {
      return c.json(skillStore.listAgentSkills(agentStore.getKampakuAgent().id).length
        ? { ...agentStore.getKampakuAgent(), skills: skillStore.listAgentSkills(agentStore.getKampakuAgent().id) }
        : agentStore.getKampakuAgent());
    }

    const agent = getAgent(agentStore, slugOrId, skillStore);
    if (!agent) return c.body(null, 404);
    return c.json(agent);
  });

  app.get("/api/v1/agents/:slugOrId/memories", (c) => {
    if (!memoryStore) return c.json({ error: "Memory store unavailable" }, 503);
    const agent = agentStore.getAgentBySlugOrId(c.req.param("slugOrId"));
    if (!agent) return c.body(null, 404);
    const kind = c.req.query("kind") as MemoryKind | undefined;
    if (kind && kind !== "log" && kind !== "learning") return c.json({ error: "Invalid memory kind" }, 400);
    const memories = memoryStore.list({ agentId: agent.id, kind, query: c.req.query("query") ?? undefined,
      projectId: c.req.query("project_id") ?? undefined, limit: Number(c.req.query("limit") ?? "50") });
    return c.json({ memories, counts: memoryStore.count(agent.id) });
  });

  app.post("/api/v1/agents/:slugOrId/memories", async (c) => {
    if (!memoryStore) return c.json({ error: "Memory store unavailable" }, 503);
    const agent = agentStore.getAgentBySlugOrId(c.req.param("slugOrId"));
    if (!agent) return c.body(null, 404);
    const body = await c.req.json<{
      kind?: MemoryKind; title?: string; body?: string; summary?: string; relevance?: number;
      project_id?: string; conversation_id?: string; work_item_id?: string; metadata?: Record<string, unknown>;
    }>();
    if ((body.kind !== "log" && body.kind !== "learning") || !body.title?.trim() || !body.body?.trim()) {
      return c.json({ error: "kind, title, and body are required" }, 400);
    }
    const memory = memoryStore.create({ agentId: agent.id, kind: body.kind, title: body.title,
      body: body.body, summary: body.summary, relevance: body.relevance, projectId: body.project_id,
      conversationId: body.conversation_id, workItemId: body.work_item_id, metadata: body.metadata });
    return c.json(memory, 201);
  });

  app.patch("/api/v1/agents/:slugOrId", async (c) => {
    const slugOrId = c.req.param("slugOrId");
    const body = await c.req.json<{
      name?: string;
      responsibilities?: string;
      system_prompt?: string;
      parent_slug?: string;
    }>();

    try {
      const agent = updateAgent(agentStore, slugOrId, {
        name: body.name,
        responsibilities: body.responsibilities,
        systemPrompt: body.system_prompt,
        parentSlug: body.parent_slug,
      });
      return c.json(getAgent(agentStore, agent.slug, skillStore) ?? agent);
    } catch (error) {
      if (error instanceof AgentStoreError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 409;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.delete("/api/v1/agents/:slugOrId", (c) => {
    const slugOrId = c.req.param("slugOrId");
    try {
      deleteAgent(agentStore, slugOrId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof AgentStoreError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 409;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });
}

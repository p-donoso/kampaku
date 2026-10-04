import type { Hono } from "hono";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { AgentStore } from "../persistence/agent-store.js";
import { advanceProjectIfAutoExecuting, type ExecuteProjectContext } from "../application/pm/execute-project.js";

function enrichBlockers(
  blockers: ReturnType<BlockageStore["list"]>,
  slugById: Map<string, string>,
) {
  return blockers.map((blocker) => ({
    ...blocker,
    reportedByAgentSlug: slugById.get(blocker.reportedByAgentId) ?? blocker.reportedByAgentId,
    recipientAgentSlug: slugById.get(blocker.recipientAgentId) ?? blocker.recipientAgentId,
    escalationPathSlugs: blocker.escalationPath.map((id) => slugById.get(id) ?? id),
  }));
}

/**
 * Register HTTP REST endpoints for blocker reporting, escalation, and resolution.
 */
export function registerBlockerRoutes(
  app: Hono,
  blockageStore: BlockageStore,
  questionStore: QuestionStore,
  agentStore: AgentStore,
  executeCtx: ExecuteProjectContext,
): void {
  app.get("/api/v1/blockers", (c) => {
    const status = c.req.query("status") as "pending" | "resolved" | undefined;
    const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
    const blockers = enrichBlockers(blockageStore.list(status), slugById);
    return c.json({ blockers });
  });

  app.post("/api/v1/blockers/:id/resolve", async (c) => {
    try {
      const body = await c.req.json<{ resolution?: string; resolved_by_agent_id?: string }>();
      // A slug is accepted as well as an id: the operator's door to this is `kampaku blockers resolve`, and
      // who holds a blocker is printed as a slug where the agent is known. The store still enforces that it
      // is the **current recipient** (`Only the current recipient can resolve this blocker.`), which is the
      // rule that keeps a blocker from being closed by whoever happens to ask.
      const resolvedBy = body.resolved_by_agent_id
        ? agentStore.getAgentBySlugOrId(body.resolved_by_agent_id)?.id ?? body.resolved_by_agent_id
        : undefined;
      const blocker = blockageStore.resolve(c.req.param("id"), body.resolution ?? "", resolvedBy);
      if (blocker.projectId) {
        await advanceProjectIfAutoExecuting(executeCtx, blocker.projectId);
      }
      const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
      return c.json(enrichBlockers([blocker], slugById)[0]);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/v1/blockers/:id/escalate", async (c) => {
    try {
      const body = await c.req.json<{ by_agent_id?: string }>();
      if (!body.by_agent_id) return c.json({ error: "by_agent_id is required" }, 400);
      const blocker = blockageStore.escalate(c.req.param("id"), body.by_agent_id);
      const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
      return c.json(enrichBlockers([blocker], slugById)[0]);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/v1/blockers/:id/convert-to-question", async (c) => {
    try {
      const body = await c.req.json<{ by_agent_id?: string }>();
      if (!body.by_agent_id) return c.json({ error: "by_agent_id is required" }, 400);
      const result = blockageStore.convertToQuestion(c.req.param("id"), body.by_agent_id, questionStore);
      const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
      return c.json({
        blocker: enrichBlockers([result.blocker], slugById)[0],
        question: {
          ...result.question,
          askedByAgentSlug: slugById.get(result.question.askedByAgentId) ?? result.question.askedByAgentId,
          recipientAgentSlug:
            slugById.get(result.question.recipientAgentId) ?? result.question.recipientAgentId,
          escalationPathSlugs: result.question.escalationPath.map((id) => slugById.get(id) ?? id),
        },
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/v1/blockers/:id/delegate", async (c) => {
    try {
      const body = await c.req.json<{
        by_agent_id?: string;
        title?: string;
        assignee_agent_id?: string;
        description?: string;
        parent_id?: string;
      }>();
      if (!body.by_agent_id) return c.json({ error: "by_agent_id is required" }, 400);
      if (!body.title?.trim()) return c.json({ error: "title is required" }, 400);
      if (!body.assignee_agent_id) return c.json({ error: "assignee_agent_id is required" }, 400);
      const result = blockageStore.delegate(c.req.param("id"), body.by_agent_id, {
        title: body.title,
        assigneeAgentId: body.assignee_agent_id,
        description: body.description,
        parentId: body.parent_id,
      });
      if (result.blocker.projectId) {
        await advanceProjectIfAutoExecuting(executeCtx, result.blocker.projectId);
      }
      const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
      return c.json({
        blocker: enrichBlockers([result.blocker], slugById)[0],
        workItem: result.workItem,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
}

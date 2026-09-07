import type { Hono } from "hono";
import type { QuestionStore } from "../persistence/question-store.js";
import type { AgentStore } from "../persistence/agent-store.js";
import { advanceProjectIfAutoExecuting, type ExecuteProjectContext } from "../application/pm/execute-project.js";

/**
 * Register HTTP REST endpoints for managing operational questions.
 */
export function registerQuestionRoutes(
  app: Hono,
  questionStore: QuestionStore,
  agentStore: AgentStore,
  executeCtx: ExecuteProjectContext,
): void {
  app.get("/api/v1/questions", (c) => {
    const status = c.req.query("status") as "pending" | "answered" | undefined;
    const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
    const questions = questionStore.list(status).map((question) => ({
      ...question,
      askedByAgentSlug: slugById.get(question.askedByAgentId) ?? question.askedByAgentId,
      recipientAgentSlug: slugById.get(question.recipientAgentId) ?? question.recipientAgentId,
      escalationPathSlugs: question.escalationPath.map((id) => slugById.get(id) ?? id),
    }));
    return c.json({ questions });
  });

  app.post("/api/v1/questions/:id/answer", async (c) => {
    try {
      const body = await c.req.json<{ answer?: string; answered_by_agent_id?: string }>();
      const question = questionStore.answer(
        c.req.param("id"),
        body.answer ?? "",
        body.answered_by_agent_id,
      );
      if (question.projectId) {
        await advanceProjectIfAutoExecuting(executeCtx, question.projectId);
      }
      return c.json(question);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/v1/questions/:id/escalate", async (c) => {
    try {
      const body = await c.req.json<{ by_agent_id?: string }>();
      if (!body.by_agent_id) return c.json({ error: "by_agent_id is required" }, 400);
      return c.json(questionStore.escalate(c.req.param("id"), body.by_agent_id));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
}

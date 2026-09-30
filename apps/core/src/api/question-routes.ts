import type { Hono } from "hono";
import type { QuestionStore } from "../persistence/question-store.js";
import type { AgentStore } from "../persistence/agent-store.js";
import { advanceProjectIfAutoExecuting, type ExecuteProjectContext } from "../application/pm/execute-project.js";
import { applyAnsweredManualEvidence } from "../application/pm/execute-work-item.js";

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
      // A criterion only a person can decide was made answerable as a question (see
      // `manual-evidence-gate`), so this is where the decision becomes evidence — and where the leaf the
      // decision was blocking is closed, against the job result already on record rather than by spending
      // another job. Measured 2026-09-30 on suite 08's fourth run: without this link the criterion was
      // routed to a human review, nothing asked for one, and the leaf could never close (BOARD F-082).
      if (question.workItemId) {
        applyAnsweredManualEvidence(
          {
            store: executeCtx.store,
            pmStore: executeCtx.pmStore,
            journalStore: executeCtx.journalStore,
            memoryStore: executeCtx.memoryStore,
          },
          {
            questionText: question.question,
            answer: question.answer ?? "",
            answeredByAgentId: question.answeredByAgentId,
            workItemId: question.workItemId,
          },
        );
      }
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

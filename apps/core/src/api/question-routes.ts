import type { Hono } from "hono";
import type { QuestionStore } from "../persistence/question-store.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { WikiStore } from "../persistence/wiki-store.js";
import type { PostActionReviewStore } from "../persistence/post-action-store.js";
import { advanceProjectIfAutoExecuting, type ExecuteProjectContext } from "../application/pm/execute-project.js";
import { applyAnsweredManualEvidence } from "../application/pm/execute-work-item.js";
import { describeAnswerOutcome, describeProjectAnswerOutcome } from "../application/questions/answer-outcome.js";
import { isProjectAutoExecuting } from "../application/pm/execute-project.js";
import { getProjectExecutionGate } from "../application/pm/project-execution-gate.js";

/**
 * The project-scoped sentence, read from the gate as it stands **after** the answer.
 *
 * `autoExecute` is the difference between "it resumes" and "nothing runs until you release it", so it is read
 * rather than assumed, and the slug is read from the store rather than reconstructed from the question.
 */
function describeProjectAnswerOutcomeFor(executeCtx: ExecuteProjectContext, projectId: string): string {
  const project = executeCtx.store.getProjectByIdOrSlug(projectId);
  const gate = getProjectExecutionGate({
    pmStore: executeCtx.pmStore,
    projectId,
    questionStore: executeCtx.questionStore,
    blockageStore: executeCtx.blockageStore,
    journalStore: executeCtx.journalStore,
    agentStore: executeCtx.agentStore,
    closureRead: {
      store: executeCtx.store,
      memoryStore: executeCtx.memoryStore,
      completionCtx: {
        agentStore: executeCtx.agentStore,
        store: executeCtx.store,
        questionStore: executeCtx.questionStore,
      },
    },
  });
  return describeProjectAnswerOutcome({
    slug: project?.slug ?? projectId,
    gate,
    autoExecuting: isProjectAutoExecuting(executeCtx.store, projectId),
  });
}

/**
 * Register HTTP REST endpoints for managing operational questions.
 */
export function registerQuestionRoutes(
  app: Hono,
  questionStore: QuestionStore,
  agentStore: AgentStore,
  executeCtx: ExecuteProjectContext,
  wikiStore?: WikiStore,
  postActionStore?: PostActionReviewStore,
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
      //
      // What the answer *did* is reported back with it. Measured 2026-10-01 on suite 08's re-run `s08r9`
      // (BOARD F-088): the operator answered both of this leaf's gates, the answers were recorded as
      // `evidence_review_resolved`, and the leaf stayed `blocked` — and no surface said that the answer had
      // worked but a *different* rule was still refusing it, so the second job the operator spent was spent
      // on a refusal the answer could never have cleared.
      let closure: Awaited<ReturnType<typeof applyAnsweredManualEvidence>> | undefined;
      if (question.workItemId) {
        closure = applyAnsweredManualEvidence(
          {
            store: executeCtx.store,
            pmStore: executeCtx.pmStore,
            journalStore: executeCtx.journalStore,
            memoryStore: executeCtx.memoryStore,
            completionCtx: {
              agentStore: executeCtx.agentStore,
              store: executeCtx.store,
              wikiStore,
              postActionStore,
              questionStore,
            },
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
      // What the answer did is returned with it, so every surface that records one says the same thing. Before
      // this, the CLI printed `describeAnswerOutcome` and the web UI deleted the card and said nothing, which
      // reads as "work resumed" — measured 2026-10-21 on suite 10's run `s10r1`, where the question named no
      // project and nothing resumed at all (BOARD F-007).
      return c.json({
        ...question,
        closureOutcome: closure ?? null,
        // A project's answer is described from the gate as it stands after the answer: *cleared, and
        // nothing dispatches until you release it* is the truth a constant "the project will resume" got
        // wrong (BOARD F-007).
        outcome: question.projectId
          ? describeProjectAnswerOutcomeFor(executeCtx, question.projectId)
          : describeAnswerOutcome(question),
      });
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

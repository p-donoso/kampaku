import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import { createGoal, getGoalAudit, listGoals } from "../application/goals.js";
import { getHealth } from "../application/health.js";
import { getRuntimeStatus } from "../application/pm/execution-status.js";
import { createProject, getDefaultProject } from "../application/projects.js";
import type { Store } from "../persistence/store.js";
import { toContractJob as formatJob } from "../persistence/store.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { ConversationStore } from "../persistence/conversation-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { SkillStore } from "../persistence/skill-store.js";
import { registerAgentRoutes } from "./agents-routes.js";
import { runKampakuChat } from "../agents/runtime/session.js";
import { registerSkillsRoutes } from "./skills-routes.js";
import { advanceProjectIfAutoExecuting } from "../application/pm/execute-project.js";
import type { ExecuteProjectContext } from "../application/pm/execute-project.js";
import { registerPmRoutes, syncWorkItemFromJobResult } from "./pm-routes.js";
import { registerSettingsRoutes } from "./settings-routes.js";
import { registerJournalRoutes } from "./journal-routes.js";
import { registerWikiRoutes } from "./wiki-routes.js";
import { escalateFailedJobToBlocker } from "../application/pm/job-failure-escalation.js";
import { applyExpiredJobHygiene } from "../application/pm/queue-hygiene.js";
import { cancelJob, pauseJob, resumeJob, JobControlError } from "../application/jobs/job-control.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { WikiStore } from "../persistence/wiki-store.js";
import { ensureDefaultWikiPages } from "../application/wiki/default-pages.js";
import type { Db } from "../persistence/db.js";
import { resolveModelProviderSettings } from "../application/settings/model-provider.js";
import { healthCheck } from "../health/check.js";

export function createApp(
  store: Store,
  config: AppConfig,
  agentStore: AgentStore,
  pmStore: PmStore,
  conversationStore: ConversationStore,
  skillStore: SkillStore,
  questionStore?: QuestionStore,
  memoryStore?: MemoryStore,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
  wikiStore?: WikiStore,
  db?: Db,
) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  app.get("/api/v1/health", (c) => c.json(getHealth()));
  app.get("/health", healthCheck);

  app.get("/api/v1/runtime/status", (c) => c.json(getRuntimeStatus(store)));

  app.post("/api/v1/projects", async (c) => {
    const body = await c.req.json();
    const project = createProject(store, {
      id: body.id,
      name: body.name,
      description: body.description,
      repositories: body.repositories,
      createdAt: body.createdAt,
    });
    if (wikiStore) ensureDefaultWikiPages(wikiStore, project.id, project.name);
    return c.json(project, 201);
  });

  app.get("/api/v1/projects/default", (c) => {
    const project = getDefaultProject(store);
    if (!project) return c.body(null, 404);
    return c.json(project);
  });

  app.get("/api/v1/goals", (c) => {
    const limit = Number(c.req.query("limit") ?? "50");
    const goals = listGoals(store, { limit });
    return c.json({ goals });
  });

  app.post("/api/v1/goals", async (c) => {
    const body = await c.req.json();
    const result = await createGoal(store, config, {
      projectId: body.projectId,
      objective: body.objective,
      priority: body.priority,
      repositoryRole: body.repositoryRole,
    });
    return c.json(result.goal, 202);
  });

  app.get("/api/v1/goals/:goalId", (c) => {
    const goalId = c.req.param("goalId");
    const audit = getGoalAudit(store, goalId);
    if (!audit) return c.body(null, 404);
    const workItem = pmStore.getWorkItemByGoalId(goalId);
    return c.json({
      ...audit,
      workItemId: workItem?.id ?? null,
    });
  });

  app.post("/api/v1/workers", async (c) => {
    const body = await c.req.json();
    const worker = store.upsertWorker({
      id: body.id,
      name: body.name,
      version: body.version,
      capabilities: body.capabilities ?? ["code.agent"],
      contractVersion: body.contractVersion ?? "0.1.0",
      registeredAt: body.registeredAt ?? new Date().toISOString(),
    });
    return c.json(worker, 201);
  });

  app.post("/api/v1/workers/:workerId/jobs:lease", (c) => {
    const workerId = c.req.param("workerId");
    const worker = store.getWorker(workerId);
    if (!worker) return c.body(null, 404);

    applyExpiredJobHygiene(store, pmStore, journalStore, memoryStore, {
      agentStore,
      store,
      wikiStore,
    });
    const leased = store.leaseNextJob(workerId, worker.capabilities, config.leaseDurationMs);
    if (!leased) return c.body(null, 204);

    store.markJobRunning(leased.id);
    const job = formatJob(leased);
    return c.json({
      ...job,
      input: {
        ...job.input,
        modelProvider: resolveModelProviderSettings(store, config),
      },
    });
  });

  app.get("/api/v1/jobs", (c) => {
    const projectSlug = c.req.query("project");
    const listed = store.listAllJobs();
    const filtered = listed.filter((job) => {
      if (!projectSlug) return true;
      const task = store.getTask(job.taskId);
      const goal = task ? store.getGoal(task.goalId) : undefined;
      const project = goal ? store.getProject(goal.projectId) : undefined;
      return project?.slug === projectSlug;
    });
    return c.json({
      jobs: filtered.map((job) => {
        const result = store.getJobResult(job.id);
        return {
          id: job.id,
          taskId: job.taskId,
          status: job.status,
          leaseId: job.leaseId ?? null,
          error: result?.error ?? null,
          output: result?.output ?? null,
        };
      }),
    });
  });

  app.get("/api/v1/jobs/:jobId", (c) => {
    const jobId = c.req.param("jobId");
    const job = store.getJob(jobId);
    if (!job) return c.body(null, 404);
    const result = store.getJobResult(jobId);
    const logs = store.listJobLogs(jobId);
    return c.json({
      id: job.id,
      taskId: job.taskId,
      status: job.status,
      leaseId: job.leaseId ?? null,
      error: result?.error ?? null,
      output: result?.output ?? null,
      logs,
    });
  });

  app.get("/api/v1/jobs/:jobId/logs", (c) => {
    const jobId = c.req.param("jobId");
    const job = store.getJob(jobId);
    if (!job) return c.body(null, 404);
    return c.json({ jobId, logs: store.listJobLogs(jobId) });
  });

  app.post("/api/v1/jobs/:jobId/pause", (c) => {
    try {
      const job = pauseJob(store, c.req.param("jobId"));
      return c.json(job);
    } catch (error) {
      if (error instanceof JobControlError) {
        return c.json({ error: error.message, code: error.code }, error.code === "NOT_FOUND" ? 404 : 409);
      }
      throw error;
    }
  });

  app.post("/api/v1/jobs/:jobId/resume", (c) => {
    try {
      const job = resumeJob(store, c.req.param("jobId"));
      return c.json(job);
    } catch (error) {
      if (error instanceof JobControlError) {
        return c.json({ error: error.message, code: error.code }, error.code === "NOT_FOUND" ? 404 : 409);
      }
      throw error;
    }
  });

  app.post("/api/v1/jobs/:jobId/cancel", (c) => {
    try {
      const result = cancelJob(store, c.req.param("jobId"));
      const jobId = c.req.param("jobId");
      const workItem = pmStore.getWorkItemByJobId(jobId);
      if (workItem) {
        syncWorkItemFromJobResult(pmStore, jobId, result.status, journalStore, result, memoryStore, {
          agentStore,
          store,
          wikiStore,
        });
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof JobControlError) {
        return c.json({ error: error.message, code: error.code }, error.code === "NOT_FOUND" ? 404 : 409);
      }
      throw error;
    }
  });

  app.post("/api/v1/jobs/:jobId/progress", async (c) => {
    const jobId = c.req.param("jobId");
    const body = await c.req.json<{ leaseId?: string; line?: string; lines?: string[] }>();
    const job = store.getJob(jobId);
    if (!job) return c.body(null, 404);
    if (!body.leaseId || job.leaseId !== body.leaseId) {
      return c.json({ error: "Invalid or missing lease.", code: "FORBIDDEN" }, 403);
    }
    if (job.status !== "leased" && job.status !== "running") {
      return c.json({ error: "Job is not active.", code: "CONFLICT" }, 409);
    }

    const lines = body.lines ?? (body.line ? [body.line] : []);
    for (const line of lines) {
      store.appendJobLog(jobId, line);
    }
    return c.json({ ok: true, appended: lines.length });
  });

  app.put("/api/v1/jobs/:jobId/result", async (c) => {
    const jobId = c.req.param("jobId");
    const body = await c.req.json();
    const result = store.submitJobResult({
      jobId,
      leaseId: body.leaseId,
      status: body.status,
      output: body.output,
      error: body.error,
      finishedAt: body.finishedAt ?? new Date().toISOString(),
    });

    const workItem = pmStore.getWorkItemByJobId(jobId);
    if (workItem) {
      escalateFailedJobToBlocker(
        { store, pmStore, agentStore, blockageStore, memoryStore },
        workItem,
        result,
      );
    }

    syncWorkItemFromJobResult(pmStore, jobId, result.status, journalStore, result, memoryStore, {
      agentStore,
      store,
      wikiStore,
    });

    if (workItem) {
      const executeCtx: ExecuteProjectContext = {
        store,
        pmStore,
        agentStore,
        skillStore,
        config,
        questionStore,
        blockageStore,
        journalStore,
        conversationStore,
        memoryStore,
      };
      if (result.status === "succeeded" || result.status === "failed") {
        await advanceProjectIfAutoExecuting(executeCtx, workItem.projectId);
      }
    }

    return c.json(result, 202);
  });

  registerAgentRoutes(
    app,
    agentStore,
    config,
    store,
    pmStore,
    conversationStore,
    skillStore,
    memoryStore,
    questionStore,
    blockageStore,
    journalStore,
    wikiStore,
  );
  registerSkillsRoutes(app, skillStore, agentStore, config);
  registerPmRoutes(
    app,
    store,
    pmStore,
    agentStore,
    skillStore,
    config,
    questionStore,
    blockageStore,
    journalStore,
    conversationStore,
    memoryStore,
    wikiStore,
  );
  if (journalStore) registerJournalRoutes(app, store, pmStore, agentStore, journalStore);
  if (wikiStore) registerWikiRoutes(app, store, pmStore, wikiStore, agentStore);
  const executeCtx: ExecuteProjectContext = {
    store,
    pmStore,
    agentStore,
    skillStore,
    config,
    questionStore,
    blockageStore,
    journalStore,
    conversationStore,
    memoryStore,
  };
  if (questionStore) registerQuestionRoutes(app, questionStore, agentStore, executeCtx);
  if (blockageStore && questionStore) {
    registerBlockerRoutes(app, blockageStore, questionStore, agentStore, executeCtx);
  }
  registerSettingsRoutes(app, store, config, db);

  return app;
}

function registerQuestionRoutes(
  app: Hono,
  questionStore: QuestionStore,
  agentStore: AgentStore,
  executeCtx: ExecuteProjectContext,
) {
  function syncChatQuestions() {
    const conversations = executeCtx.conversationStore;
    if (!conversations) return;
    for (const conversation of conversations.listConversations({ agentSlug: "kampaku", limit: 100 })) {
      const messages = conversations.getMessages(conversation.id);
      const assistant = [...messages].reverse().find((message) => message.role === "assistant" && message.content.includes("<kampaku-question>"));
      if (!assistant) continue;
      const match = assistant.content.match(/<kampaku-question>\s*([\s\S]*?)\s*<\/kampaku-question>/i);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[1]) as { prompt?: string; id?: string };
        if (!parsed.prompt?.trim()) continue;
        const marker = `conversation_id: ${conversation.id}; question_id: ${parsed.id ?? "unknown"}`;
        const exists = questionStore.listAll().some((item) => item.context?.includes(marker));
        if (!exists) {
          questionStore.askDirect({
            askedByAgentId: "kampaku",
            question: match[0],
            context: `${marker}\nRecovered from the Kampaku conversation history. Answering this question resumes the conversation.`,
            projectId: conversation.projectId ?? undefined,
          });
        }
      } catch {
        // Ignore malformed question tags; chat history remains readable.
      }
    }
  }

  app.get("/api/v1/questions", (c) => {
    syncChatQuestions();
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
      const conversationId = question.context?.match(/conversation_id:\s*([^;\s]+)/)?.[1];
      let continuation;
      if (conversationId && question.askedByAgentId === agentStore.getAgentBySlugOrId("kampaku")?.id) {
        continuation = await runKampakuChat(executeCtx as any, executeCtx.config, {
          message: `Answer to pending question [question_id: ${question.id}]: ${question.answer}`,
          conversationId,
          projectId: question.projectId,
        });
      }
      return c.json(continuation ? { ...question, continuation } : question);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.delete("/api/v1/questions/:id", (c) => {
    try {
      questionStore.delete(c.req.param("id"));
      return c.body(null, 204);
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

function registerBlockerRoutes(
  app: Hono,
  blockageStore: BlockageStore,
  questionStore: QuestionStore,
  agentStore: AgentStore,
  executeCtx: ExecuteProjectContext,
) {
  app.get("/api/v1/blockers", (c) => {
    const status = c.req.query("status") as "pending" | "resolved" | undefined;
    const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
    const blockers = enrichBlockers(blockageStore.list(status), slugById);
    return c.json({ blockers });
  });

  app.post("/api/v1/blockers/:id/resolve", async (c) => {
    try {
      const body = await c.req.json<{ resolution?: string; resolved_by_agent_id?: string }>();
      const blocker = blockageStore.resolve(
        c.req.param("id"),
        body.resolution ?? "",
        body.resolved_by_agent_id,
      );
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

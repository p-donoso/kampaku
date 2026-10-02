import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import { createGoal, getGoalAudit, listGoals } from "../application/goals.js";
import { getHealth } from "../application/health.js";
import { getRuntimeStatus } from "../application/pm/execution-status.js";
import {
  createProject,
  getDefaultProject,
  ProjectStoreError,
} from "../application/projects.js";
import { getAgent, provisionSubAgent } from "../application/agents.js";
import type { Store } from "../persistence/store.js";
import { toContractJob as formatJob } from "../persistence/store.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { ConversationStore } from "../persistence/conversation-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { SkillStore } from "../persistence/skill-store.js";
import { registerAgentRoutes } from "./agents-routes.js";
import { registerSkillsRoutes } from "./skills-routes.js";
import { advanceProjectIfAutoExecuting } from "../application/pm/execute-project.js";
import type { ExecuteProjectContext } from "../application/pm/execute-project.js";
import { registerPmRoutes, syncWorkItemFromJobResult } from "./pm-routes.js";
import { registerSettingsRoutes } from "./settings-routes.js";
import { registerJournalRoutes } from "./journal-routes.js";
import { registerRiskRoutes } from "./risk-routes.js";
import { registerPostActionRoutes } from "./post-action-routes.js";
import { registerWikiRoutes } from "./wiki-routes.js";
import { registerQuestionRoutes } from "./question-routes.js";
import type { RefusalStore } from "../persistence/refusal-store.js";
import { registerRefusalRoutes } from "./refusal-routes.js";
import { registerBlockerRoutes } from "./blocker-routes.js";
import { escalateFailedJobToBlocker } from "../application/pm/job-failure-escalation.js";
import { applyExpiredJobHygiene } from "../application/pm/queue-hygiene.js";
import { cancelJob, pauseJob, resumeJob, JobControlError } from "../application/jobs/job-control.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { WikiStore } from "../persistence/wiki-store.js";
import type { AgentStore as _AgentStore } from "../persistence/agent-store.js";
import type { PostActionReviewStore } from "../persistence/post-action-store.js";
import type { Db } from "../persistence/db.js";
import { resolveModelProviderSettings } from "../application/settings/model-provider.js";

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
  postActionStore?: PostActionReviewStore,
  // Appended, never inserted: this parameter list is positional and existing callers pass by
  // position. Adding a parameter in the middle silently misaligns every such caller, which
  // broke the journal API tests when this one was first placed after `questionStore`.
  refusalStore?: RefusalStore,
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
  app.get("/health", (c) => c.json(getHealth()));

  app.get("/api/v1/runtime/status", (c) => c.json(getRuntimeStatus(store)));

  /**
   * Opens a work order, with an accountable owner when one is named.
   *
   * Two measured defects are closed here. `project_lead_slug` was not accepted, so a project created
   * through this documented route could never be owned and the UI's OWNER column rendered `—`
   * (BOARD F-036). And there was no error mapping at all, so a duplicate slug surfaced as a bare
   * **500 Internal Server Error** indistinguishable from a crash (BOARD F-035).
   */
  app.post("/api/v1/projects", async (c) => {
    const body = await c.req.json<{
      id?: string;
      slug?: string;
      name?: string;
      description?: string;
      repositories?: unknown;
      createdAt?: string;
      project_lead_slug?: string;
      // The stack the emperor named, when they named one. Accepted on the route as well as on the
      // tool, because a surface an operator can use without chat must be able to do what chat can
      // (BOARD F-036), and the seed reads it identically either way.
      stack?: string;
    }>();
    if (!body.name?.trim()) {
      return c.json({ error: "name is required", code: "VALIDATION" }, 400);
    }

    try {
      const project = createProject(
        store,
        {
          id: body.id,
          slug: body.slug,
          name: body.name,
          description: body.description,
          repositories: body.repositories as never,
          createdAt: body.createdAt,
          project_lead_slug: body.project_lead_slug,
          stack: body.stack,
        },
        // The configured workspace, passed explicitly. `validateRepositories` falls back to
        // `process.env.KAMPAKU_WORKSPACE` when the policy is empty, so a route that passed `{}` checked
        // the boundary against an environment variable rather than against the workspace the instance is
        // actually running with — the same class as F-028, where a stored value depended on an
        // environment fact nobody had verified.
        { workspaceRoot: config.workspaceRoot },
        agentStore,
      );
      return c.json(project, 201);
    } catch (error) {
      if (error instanceof ProjectStoreError) {
        const status =
          error.code === "CONFLICT"
            ? 409
            : error.code === "NOT_FOUND"
              ? 404
              : error.code === "FORBIDDEN"
                ? 403
                : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  /**
   * Creates an agent, so a non-chat surface can produce an **owned** work order.
   *
   * Measured (BOARD F-036): `create_sub_agent` existed only on the agent path, so the UI could create a
   * project but never the lead it needs. Suites 01 and 02 both require an accountable owner, and the
   * statute makes it a gate — so the gap was that the operator's own surfaces could not satisfy a gate
   * that chat could.
   *
   * Root-scoped on purpose: this is the same authority the `create_sub_agent` tool enforces, and a route
   * that allowed more than the tool would be a second, weaker front door.
   */
  app.post("/api/v1/agents", async (c) => {
    const body = await c.req.json<{
      slug?: string;
      name?: string;
      responsibilities?: string;
      system_prompt?: string;
      parent_slug?: string;
      /** Optional explicit skills, on top of the defaults the seat inherits. */
      skill_slugs?: string[];
    }>();
    if (!body.slug?.trim() || !body.name?.trim()) {
      return c.json({ error: "slug and name are required", code: "VALIDATION" }, 400);
    }
    if (body.parent_slug && !agentStore.getAgentBySlugOrId(body.parent_slug)) {
      return c.json(
        { error: `Parent agent "${body.parent_slug}" not found.`, code: "VALIDATION" },
        400,
      );
    }

    try {
      // provisionSubAgent, not createSubAgent: the seat needs its default skills and its skill appendix
      // as well as its record, and doing that here rather than inside the shared function is how the two
      // surfaces drifted apart in the first place (BOARD F-039).
      const agent = provisionSubAgent(agentStore, skillStore, {
        slug: body.slug.trim(),
        name: body.name.trim(),
        responsibilities: body.responsibilities ?? body.name.trim(),
        systemPrompt: body.system_prompt ?? `You are ${body.name.trim()}.`,
        parentId: body.parent_slug
          ? agentStore.getAgentBySlugOrId(body.parent_slug)?.id
          : undefined,
        skillSlugs: body.skill_slugs,
      });
      // Returned through the same enrichment the read route uses, so a created agent and a fetched
      // agent cannot differ in shape.
      return c.json({ agent: getAgent(agentStore, agent.slug, skillStore) ?? agent }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A duplicate slug is a conflict, not a crash — the same correction as the project route above.
      const status = /already exists/i.test(message) ? 409 : 400;
      return c.json({ error: message, code: status === 409 ? "CONFLICT" : "VALIDATION" }, status);
    }
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

    // The worker asks for work every couple of seconds, whether or not there is any, so this is its
    // heartbeat and there is no separate one to keep alive. Recorded before the lease so an idle worker
    // (204, no job) counts as present too — otherwise a quiet factory would read as a dead one.
    store.touchWorker(workerId, new Date().toISOString());

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

  app.get("/api/v1/jobs/:jobId", (c) => {
    const jobId = c.req.param("jobId");
    const job = store.getJob(jobId);
    if (!job) return c.body(null, 404);
    const result = store.getJobResult(jobId);
    return c.json({
      id: job.id,
      taskId: job.taskId,
      status: job.status,
      leaseId: job.leaseId ?? null,
      error: result?.error ?? null,
      output: result?.output ?? null,
    });
  });

  app.get("/api/v1/jobs/:jobId/evidence", (c) => {
    return c.json({ jobId: c.req.param("jobId"), evidence: store.listJobEvidence(c.req.param("jobId")) });
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
          postActionStore,
          questionStore,
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
      postActionStore,
      questionStore,
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
    // Appended, not inserted: the parameter list is positional and every existing argument is passed by
    // position. The same note is on `createApp`'s own list, for the same reason.
    refusalStore,
    // Also appended. Without these two, a chat turn had no wiki and no post-action queue, so every wiki
    // tool answered `Wiki store is not available` and a project lead could not publish the register its own
    // plan cited (BOARD F-071, measured by suite 07 run 19).
    wikiStore,
    postActionStore,
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
  registerPostActionRoutes(app, {
    pmStore,
    agentStore,
    reviewStore: postActionStore,
    store,
    journalStore,
    memoryStore,
    wikiStore,
  });

  if (journalStore) registerJournalRoutes(app, store, pmStore, agentStore, journalStore);
  // The risk surface, beside the journal it is derived from: `play` can be stopped by an open high risk,
  // so the operator needs the route that names it and the route that answers it (BOARD F-084).
  if (journalStore) registerRiskRoutes(app, store, pmStore, agentStore, journalStore);
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
  if (refusalStore) registerRefusalRoutes(app, refusalStore, agentStore);
  if (blockageStore && questionStore) {
    registerBlockerRoutes(app, blockageStore, questionStore, agentStore, executeCtx);
  }
  registerSettingsRoutes(app, store, config, db);

  return app;
}

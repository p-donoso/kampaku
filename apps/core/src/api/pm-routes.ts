import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppConfig } from "../config.js";
import { submitIntent } from "../application/pm/submit-intent.js";
import {
  getEnrichedProjectOverview,
  getAgentDashboard,
  getWorkItemDetail,
} from "../application/pm/dashboard.js";
import { getProjectsRoster } from "../application/projects-roster.js";
import {
  deleteProject,
  listProjects,
  ProjectStoreError,
  updateProject,
} from "../application/projects.js";
import {
  executeWorkItem,
  ExecuteWorkItemError,
  retryWorkItem,
  syncWorkItemFromJobResult,
} from "../application/pm/execute-work-item.js";
import {
  ExecuteProjectError,
  advanceProjectIfAutoExecuting,
  getProjectExecutionState,
  pauseProject,
  playProject,
  stepProject,
  type ExecuteProjectContext,
} from "../application/pm/execute-project.js";
import { rollupParentWorkItemStatuses } from "../application/pm/work-item-parent-rollup.js";
import { ensurePhaseAuditorAfterLeafDone } from "../application/pm/phase-auditor-gate.js";
import { applyExpiredJobHygiene } from "../application/pm/queue-hygiene.js";
import { getRuntimeStatus } from "../application/pm/execution-status.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore, WorkItemStatus } from "../persistence/pm-store.js";
import { PmStoreError } from "../persistence/pm-store.js";
import { v4 as uuidv4 } from "uuid";
import type { SkillStore } from "../persistence/skill-store.js";
import type { Store, ProjectRecord } from "../persistence/store.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { ConversationStore } from "../persistence/conversation-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import { executeApprovePlan, executeRevokePlanApproval } from "../agents/runtime/tools/plan-approval.js";
import { executeGetReportingStatus } from "../agents/runtime/tools/journal-tools.js";
import type { WikiStore } from "../persistence/wiki-store.js";

export function registerPmRoutes(
  app: Hono,
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  skillStore: SkillStore,
  config: AppConfig,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
  conversationStore?: ConversationStore,
  memoryStore?: MemoryStore,
  wikiStore?: WikiStore,
) {
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

  app.post("/api/v1/intents", async (c) => {
    const body = await c.req.json<{
      intent?: string;
      projectSlug?: string;
      createMissingAgents?: boolean;
      granularity?: "standard" | "fine";
      mode?: "preview" | "apply";
      approvalReference?: string;
      approvalFingerprint?: string;
      approvalContentHash?: string;
    }>();

    if (!body.intent?.trim()) {
      return c.json({ error: "intent is required" }, 400);
    }

    try {
      const result = await submitIntent(
        { store, pmStore, agentStore, config, journalStore },
        {
          intent: body.intent.trim(), projectSlug: body.projectSlug, createMissingAgents: body.createMissingAgents,
          granularity: body.granularity, mode: body.mode, approvalReference: body.approvalReference, approvalFingerprint: body.approvalFingerprint, approvalContentHash: body.approvalContentHash,
        },
      );
      return c.json(result, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Intent planning failed." }, 409);
    }
  });

  app.post("/api/v1/plans/approve", async (c) => {
    const body = await c.req.json();
    try { return c.json(executeApprovePlan({ store, agentStore, skillStore } as any, body), 201); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : "Plan approval failed." }, 403); }
  });

  app.get("/api/v1/plans/:approvalReference", (c) => {
    const preview = store.getPlanPreview(c.req.param("approvalReference"));
    if (!preview) return c.json({ error: "Plan preview not found." }, 404);
    return c.json({
      approvalReference: c.req.param("approvalReference"),
      projectSlug: preview.projectSlug,
      planFingerprint: preview.planFingerprint,
      planContentHash: preview.planContentHash,
      plannerUsed: preview.plannerUsed,
      plan: preview.plan,
    });
  });

  app.post("/api/v1/plans/revoke", async (c) => {
    const body = await c.req.json();
    try { return c.json(executeRevokePlanApproval({ store, agentStore, skillStore } as any, body)); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : "Plan revocation failed." }, 403); }
  });

  app.get("/api/v1/work-items/:id/reporting-status", (c) => {
    if (!journalStore || !memoryStore) return c.json({ error: "Reporting status is not available." }, 503);
    const item = pmStore.getWorkItem(c.req.param("id"));
    if (!item) return c.body(null, 404);
    const agentSlug = c.req.query("agent_slug") ?? (item.assigneeAgentId ? agentStore.getAgentBySlugOrId(item.assigneeAgentId)?.slug : undefined);
    const projectId = c.req.query("project_id") ?? item.projectId;
    if (!agentSlug) return c.json({ error: "agent_slug is required" }, 400);
    return c.json(executeGetReportingStatus({ store, pmStore, agentStore, skillStore, journalStore, memoryStore, wikiStore } as any, { agent_slug: agentSlug, project_id: projectId, work_item_id: item.id, require_wiki_sync: c.req.query("require_wiki_sync") === "true" }));
  });

  app.get("/api/v1/projects", (c) => {
    return c.json({ projects: listProjects(store) });
  });

  app.get("/api/v1/projects/roster", (c) => {
    const projects = getProjectsRoster(store, pmStore, agentStore, questionStore, blockageStore);
    return c.json({ projects });
  });

  app.get("/api/v1/projects/:idOrSlug", (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    if (idOrSlug === "default") {
      return c.body(null, 404);
    }

    const overview = getEnrichedProjectOverview(
      store,
      pmStore,
      agentStore,
      idOrSlug,
      questionStore,
      blockageStore,
    );
    if (!overview) return c.body(null, 404);
    return c.json(overview);
  });

  app.patch("/api/v1/projects/:idOrSlug", async (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    const body = await c.req.json<{
      name?: string;
      description?: string;
      status?: ProjectRecord["status"];
      project_lead_slug?: string | null;
      coherence_strategy?: string | null;
      repositories?: ProjectRecord["repositories"];
      wikiSyncRequired?: boolean;
      wikiSyncPageSlug?: string;
      wikiSyncPhasePages?: Record<string, string>;
    }>();

    try {
      const project = updateProject(store, agentStore, idOrSlug, {
        name: body.name,
        description: body.description,
        status: body.status,
        project_lead_slug: body.project_lead_slug,
        coherence_strategy: body.coherence_strategy,
        repositories: body.repositories,
        wikiSyncRequired: body.wikiSyncRequired,
        wikiSyncPageSlug: body.wikiSyncPageSlug,
        wikiSyncPhasePages: body.wikiSyncPhasePages,
      });
      return c.json(project);
    } catch (error) {
      if (error instanceof ProjectStoreError) {
        const status = error.code === "NOT_FOUND" ? 404 : 403;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.delete("/api/v1/projects/:idOrSlug", (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    try {
      deleteProject(store, pmStore, idOrSlug);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof ProjectStoreError) {
        const status = error.code === "NOT_FOUND" ? 404 : 403;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/play", async (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    try {
      const result = await playProject(executeCtx, idOrSlug);
      return c.json(result, 202);
    } catch (error) {
      if (error instanceof ExecuteProjectError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      if (error instanceof ExecuteWorkItemError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/pause", (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    try {
      return c.json(pauseProject(store, idOrSlug));
    } catch (error) {
      if (error instanceof ExecuteProjectError) {
        const status = error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/step", async (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    try {
      const result = await stepProject(executeCtx, idOrSlug);
      return c.json(result, 202);
    } catch (error) {
      if (error instanceof ExecuteProjectError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      if (error instanceof ExecuteWorkItemError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:idOrSlug/execution", (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    const project = store.getProjectByIdOrSlug(idOrSlug);
    if (!project) return c.body(null, 404);
    const hygiene = applyExpiredJobHygiene(store, pmStore, journalStore, memoryStore, {
      agentStore,
      store,
    });
    const state = getProjectExecutionState(executeCtx, project.id);
    const { track, workItem, blockedReason } = state.nextStep;
    const runtime = getRuntimeStatus(store);
    return c.json({
      autoExecute: state.autoExecute,
      gated: state.gate.gated,
      gate: state.gate,
      nextStep: {
        trackId: track?.id ?? null,
        trackTitle: track?.title ?? null,
        workItemId: workItem?.id ?? null,
        workItemTitle: workItem?.title ?? null,
        blockedReason: blockedReason ?? null,
      },
      queue: {
        queuedJobs: runtime.queuedJobs,
        runningJobs: runtime.runningJobs,
        zombieJobs: runtime.zombieJobs,
        expiredJobsReclaimed: hygiene.expiredJobs,
      },
    });
  });

  app.patch("/api/v1/project-documents/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ title?: string; content_md?: string }>();

    const updated = pmStore.updateDocument(id, {
      title: body.title,
      contentMd: body.content_md,
    });

    if (!updated) return c.body(null, 404);
    return c.json(updated);
  });

  app.post("/api/v1/projects/:projectId/work-items", async (c) => {
    const projectId = c.req.param("projectId");
    const project = store.getProject(projectId) ?? store.getProjectBySlug(projectId);
    if (!project) return c.body(null, 404);

    const body = await c.req.json<{
      title?: string;
      description?: string;
      parent_id?: string | null;
      status?: WorkItemStatus;
      priority?: number;
      sort_order?: number;
      assignee_agent_id?: string;
      acceptance_criteria?: string[];
    }>();

    if (!body.title?.trim()) {
      return c.json({ error: "title is required" }, 400);
    }

    const now = new Date().toISOString();
    const siblings = pmStore
      .listWorkItemsByProject(project.id)
      .filter((item) => (item.parentId ?? null) === (body.parent_id ?? null));
    const maxSort = siblings.reduce((max, item) => Math.max(max, item.sortOrder), -1);

    try {
      const created = pmStore.createWorkItem({
        id: uuidv4(),
        projectId: project.id,
        parentId: body.parent_id ?? undefined,
        title: body.title.trim(),
        description: body.description,
        status: body.status ?? "todo",
        priority: body.priority ?? 0,
        sortOrder: body.sort_order ?? maxSort + 1,
        assigneeAgentId: body.assignee_agent_id,
        acceptanceCriteria: body.acceptance_criteria ?? [],
        dependsOn: [],
        createdAt: now,
        updatedAt: now,
      });
      return c.json(created, 201);
    } catch (error) {
      if (error instanceof PmStoreError) {
        const status = error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.get("/api/v1/work-items/:id", (c) => {
    const id = c.req.param("id");
    const detail = getWorkItemDetail(
      store,
      pmStore,
      agentStore,
      id,
      questionStore,
      blockageStore,
    );
    if (!detail) return c.body(null, 404);
    return c.json(detail);
  });

  app.get("/api/v1/work-items/:id/events", (c) => streamSSE(c, async (stream) => {
    let previous = "";
    let heartbeatAt = Date.now();
    while (true) {
      const detail = getWorkItemDetail(store, pmStore, agentStore, c.req.param("id"), questionStore, blockageStore);
      if (!detail) break;
      const snapshot = JSON.stringify({
        status: detail.item.status,
        jobId: detail.item.jobId ?? null,
        jobStatus: detail.item.jobStatus ?? null,
        executionPhase: detail.item.executionPhase,
        children: detail.children.map((child) => `${child.id}:${child.status}`),
      });
      if (snapshot !== previous) {
        previous = snapshot;
        await stream.writeSSE({ event: "work-item", data: snapshot });
      } else if (Date.now() - heartbeatAt >= 15_000) {
        await stream.writeSSE({ event: "heartbeat", data: String(Date.now()) });
        heartbeatAt = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }));

  app.patch("/api/v1/work-items/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{
      title?: string;
      description?: string;
      status?: WorkItemStatus;
      priority?: number;
      sort_order?: number;
      parent_id?: string | null;
      assignee_agent_id?: string;
      done_override?: "emperor" | "auditor";
    }>();

    try {
      const existing = pmStore.getWorkItem(id);
      if (body.status === "done") {
        if (body.done_override !== "emperor" && body.done_override !== "auditor") {
          return c.json(
            {
              error:
                "Manual status=done is blocked. Pass done_override=emperor or done_override=auditor after verifying acceptance criteria.",
              code: "DISHONEST_DONE",
            },
            403,
          );
        }
      }
      const patch: Parameters<PmStore["updateWorkItem"]>[1] = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.description !== undefined) patch.description = body.description;
      if (body.status !== undefined) patch.status = body.status;
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.sort_order !== undefined) patch.sortOrder = body.sort_order;
      if (body.parent_id !== undefined) {
        patch.parentId = body.parent_id === null ? undefined : body.parent_id;
      }
      if (body.assignee_agent_id !== undefined) {
        patch.assigneeAgentId = body.assignee_agent_id;
      }

      const updated = pmStore.updateWorkItem(id, patch);

      if (!updated) return c.body(null, 404);

      if (body.status === "done") {
        ensurePhaseAuditorAfterLeafDone(pmStore, agentStore, store, updated.id, journalStore);
      }

      if (body.status !== undefined) {
        rollupParentWorkItemStatuses(pmStore, updated.id);
      }

      const unblocked =
        existing?.status === "blocked" &&
        body.status !== undefined &&
        body.status !== "blocked" &&
        body.status !== "done" &&
        body.status !== "cancelled";
      if (unblocked) {
        await advanceProjectIfAutoExecuting(executeCtx, updated.projectId);
      }

      return c.json(updated);
    } catch (error) {
      if (error instanceof PmStoreError) {
        const status = error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.delete("/api/v1/work-items/:id", (c) => {
    const id = c.req.param("id");
    const cascade = c.req.query("cascade") === "true";

    try {
      pmStore.deleteWorkItem(id, { cascade });
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof PmStoreError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/v1/work-items/:id/execute", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await executeWorkItem(
        { store, pmStore, agentStore, skillStore, config, memoryStore },
        id,
      );
      return c.json(result, 202);
    } catch (error) {
      if (error instanceof ExecuteWorkItemError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/v1/work-items/:id/retry", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await retryWorkItem(
        { store, pmStore, agentStore, skillStore, config, memoryStore },
        id,
      );
      return c.json(result, 202);
    } catch (error) {
      if (error instanceof ExecuteWorkItemError) {
        const status =
          error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.get("/api/v1/agents/:slugOrId/dashboard", (c) => {
    const slugOrId = c.req.param("slugOrId");
    const includeSubordinates = c.req.query("include_subordinates") !== "false";

    const dashboard = getAgentDashboard(
      store,
      pmStore,
      agentStore,
      slugOrId,
      includeSubordinates,
    );

    if (!dashboard) return c.body(null, 404);
    return c.json(dashboard);
  });
}

export { syncWorkItemFromJobResult };

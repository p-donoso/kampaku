import { Hono } from "hono";
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
  type ExecuteProjectContext,
} from "../application/pm/execute-project.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore, WorkItemStatus } from "../persistence/pm-store.js";
import { PmStoreError } from "../persistence/pm-store.js";
import { v4 as uuidv4 } from "uuid";
import type { SkillStore } from "../persistence/skill-store.js";
import type { Store, ProjectRecord } from "../persistence/store.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { JournalStore } from "../persistence/journal-store.js";

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
) {
  const executeCtx: ExecuteProjectContext = {
    store,
    pmStore,
    agentStore,
    skillStore,
    config,
    questionStore,
    blockageStore,
  };

  app.post("/api/v1/intents", async (c) => {
    const body = await c.req.json<{
      intent?: string;
      projectSlug?: string;
      createMissingAgents?: boolean;
    }>();

    if (!body.intent?.trim()) {
      return c.json({ error: "intent is required" }, 400);
    }

    const result = await submitIntent(
      { store, pmStore, agentStore, config, journalStore },
      {
        intent: body.intent.trim(),
        projectSlug: body.projectSlug,
        createMissingAgents: body.createMissingAgents,
      },
    );

    return c.json(result, 201);
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
    }>();

    try {
      const project = updateProject(store, idOrSlug, body);
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

  app.get("/api/v1/projects/:idOrSlug/execution", (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    const project = store.getProjectByIdOrSlug(idOrSlug);
    if (!project) return c.body(null, 404);
    const state = getProjectExecutionState(executeCtx, project.id);
    return c.json({
      autoExecute: state.autoExecute,
      gated: state.gate.gated,
      gate: state.gate,
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
        acceptanceCriteria: [],
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
    }>();

    try {
      const existing = pmStore.getWorkItem(id);
      const updated = pmStore.updateWorkItem(id, {
        title: body.title,
        description: body.description,
        status: body.status,
        priority: body.priority,
        sortOrder: body.sort_order,
        parentId: body.parent_id === null ? undefined : body.parent_id,
        assigneeAgentId: body.assignee_agent_id,
      });

      if (!updated) return c.body(null, 404);

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
        { store, pmStore, agentStore, skillStore, config },
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
        { store, pmStore, agentStore, skillStore, config },
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

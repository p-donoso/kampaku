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
  decideWorkItemClosure,
  reevaluateBlockedWorkItemClosure,
  type ReconciliationContext,
} from "../application/pm/execute-work-item.js";
import {
  ClosureDischargeError,
  dischargeClosure,
  type ClosureDischarge,
  type ClosureDischargeContext,
} from "../application/pm/closure-discharge.js";
import { verifyWorkItem, VerifyWorkItemError } from "../application/pm/verify-work-item.js";
import { reportBlockedWorkItemsFromDerivation } from "../application/pm/blocked-item-explanation.js";
import { BlockReleaseError, releaseUnaccountedBlock } from "../application/pm/block-release.js";
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
import { cancelJobsForWorkItem } from "../application/jobs/work-item-jobs.js";
import { ensurePhaseAuditorAfterLeafDone } from "../application/pm/phase-auditor-gate.js";
import { applyExpiredJobHygiene } from "../application/pm/queue-hygiene.js";
import { getRuntimeStatus } from "../application/pm/execution-status.js";
import {
  gateDestructiveAction,
  readDestructiveConfirmation,
  readOptionalJsonBody,
} from "./destructive-gate.js";
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

/**
 * The consequence of a governance `PATCH`, in words an operator can check before confirming.
 *
 * It states what changes and what it means, rather than naming the fields: `repositories: [...]` does not
 * tell a reader that an entry with a `file://` path is created and seeded on disk when it is missing.
 */
function describeGovernanceChange(
  project: ProjectRecord,
  body: {
    project_lead_slug?: string | null;
    repositories?: ProjectRecord["repositories"];
  },
): string {
  const parts: string[] = [];
  if (body.project_lead_slug !== undefined) {
    parts.push(
      body.project_lead_slug === null || body.project_lead_slug.trim() === ""
        ? "clears the project lead"
        : `reassigns the project lead to "${body.project_lead_slug}"`,
    );
  }
  if (body.repositories !== undefined) {
    const urls = body.repositories.map((repo) => repo?.url ?? "(no url)").join(", ") || "(none)";
    parts.push(`rewrites the linked repositories to ${urls}`);
  }
  return (
    `This ${parts.join(" and ")} on project "${project.slug}". ` +
    "A local path in the new repository list is created and seeded when it does not exist. " +
    "It changes what the project points at and who owns it; it is not reversible from one unconfirmed turn."
  );
}

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

  /**
   * The inputs of the closure decision, from the stores this route group holds.
   *
   * Used by the two routes that need to *reason about a closure without spending a job*: the blocked-item
   * read (which must name the rule without deciding anything) and the discharge (which decides and then
   * lets closure decide again). The completion context rides along so a refusal that discovers a criterion
   * nobody has decided raises that gate right there, which is the mechanism BOARD F-082 exists for.
   */
  function closureReconciliationCtx(): ClosureDischargeContext {
    return {
      store,
      pmStore,
      journalStore,
      memoryStore,
      questionStore,
      blockageStore,
      agentStore,
      completionCtx: { agentStore, store, wikiStore, questionStore },
    };
  }

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
        { store, pmStore, agentStore, config, journalStore, skillStore },
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
    const projects = getProjectsRoster(
      store,
      pmStore,
      agentStore,
      questionStore,
      blockageStore,
      journalStore,
      memoryStore,
    );
    return c.json({ projects });
  });

  /**
   * Every blocked work item of a project, each with the rule that refused it and the command that clears it.
   *
   * The execution route names only the **head** blocking leaf, because that is what stops the line. Measured
   * 2026-10-01 (BOARD F-088): the operator of a project with a blocked leaf had no surface that said *which
   * rule* refused it, so the only reading available was the three causes the gate listed — and all three were
   * empty. This is the read half; `POST /api/v1/work-items/:id/closure` is the discharge.
   */
  app.get("/api/v1/projects/:idOrSlug/blocked", (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    const project = store.getProjectByIdOrSlug(idOrSlug);
    if (!project) return c.body(null, 404);
    // By the derived status, not the stored column: the two disagree about a container (that is what this
    // row is about), and a block the report omits is a block the operator cannot read.
    const blocks = reportBlockedWorkItemsFromDerivation(
      {
        pmStore,
        journalStore,
        blockageStore,
        questionStore,
        agentStore,
        fresh: (item) => {
          const decision = decideWorkItemClosure(closureReconciliationCtx(), item.id);
          if (decision.outcome === "closed") return { verdict: "would_close" as const };
          if (decision.outcome === "refused") return { verdict: "refused" as const, block: decision.block };
          return { verdict: "no_settled_job" as const };
        },
      },
      project.id,
      project.slug,
    );
    return c.json({ project: project.slug, blocks });
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
      allow_workspace_repository?: boolean;
      /**
       * Deliberate opt-in to link a `file://` path that does not exist yet, so the seeding below can
       * create and populate it. Before the fix this was hardcoded `true` inside `updateProject`, which
       * let one unauthenticated request create `/tmp/evil`, run `git init` and seed six files
       * (BOARD F-042). Nobody gets it unless they ask.
       */
      allow_missing_path?: boolean;
      wikiSyncRequired?: boolean;
      wikiSyncPageSlug?: string;
      wikiSyncPhasePages?: Record<string, string>;
      confirmation_reference?: string;
      confirmation_token?: string;
      confirmed_by?: string;
    }>();

    // Two governance fields are destructive and are gated: reassigning the lead changes who can approve,
    // and rewriting the repository list changes what the project points at on disk — and, with the
    // opt-in below, creates it. Both were settable by an unauthenticated REST call (BOARD F-042).
    const touchesGovernance =
      body.project_lead_slug !== undefined || body.repositories !== undefined;
    if (touchesGovernance) {
      const existing = store.getProjectByIdOrSlug(idOrSlug);
      if (!existing) return c.body(null, 404);
      const gate = gateDestructiveAction(
        store,
        {
          action: "project.update_governance",
          target: existing.slug,
          consequence: describeGovernanceChange(existing, body),
          payload: {
            project_lead_slug: body.project_lead_slug ?? null,
            repositories: body.repositories ?? null,
          },
        },
        readDestructiveConfirmation(c.req, body),
      );
      if (!gate.proceed) return c.json(gate.body, gate.status);
    }

    try {
      const project = updateProject(
        store,
        agentStore,
        idOrSlug,
        {
          name: body.name,
          description: body.description,
          status: body.status,
          project_lead_slug: body.project_lead_slug,
          coherence_strategy: body.coherence_strategy,
          repositories: body.repositories,
          wikiSyncRequired: body.wikiSyncRequired,
          wikiSyncPageSlug: body.wikiSyncPageSlug,
          wikiSyncPhasePages: body.wikiSyncPhasePages,
        },
        {
          allowWorkspaceRepository: body.allow_workspace_repository === true,
          workspaceRoot: config.workspaceRoot,
          // Opt-in per call, and off unless the caller says otherwise.
          allowMissingPath: body.allow_missing_path === true,
        },
      );
      return c.json(project);
    } catch (error) {
      if (error instanceof ProjectStoreError) {
        // `VALIDATION` is a 400 — the same mapping the create route uses. Before it fell through to 403,
        // so "this path does not exist" read as "you are not allowed", which is a different fact.
        const status =
          error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : error.code === "FORBIDDEN"
                ? 403
                : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.delete("/api/v1/projects/:idOrSlug", async (c) => {
    const idOrSlug = c.req.param("idOrSlug");
    const project = store.getProjectByIdOrSlug(idOrSlug);
    if (!project) return c.body(null, 404);

    const gate = gateDestructiveAction(
      store,
      {
        action: "project.delete",
        target: project.slug,
        consequence:
          `This deletes project "${project.slug}" and all of its history — documents, milestones and ` +
          "work items. It cannot be undone from inside the factory.",
        payload: { projectId: project.id },
      },
      readDestructiveConfirmation(c.req, await readOptionalJsonBody(c.req)),
    );
    if (!gate.proceed) return c.json(gate.body, gate.status);

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
      /** Paths this item's job must not write. Anything else it must not write is read from its own text. */
      frozen_paths?: string[];
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
        // An item created over REST may declare its freeze; the rest is derived at dispatch from its own text.
        frozenPaths: body.frozen_paths ?? [],
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

      // Cancelling a work item cancels the job queued beneath it — the same rule the `update_work_item` tool
      // applies, called from the other surface that can cancel one (suite 13, BOARD F-096 / F-126).
      if (body.status === "cancelled") {
        cancelJobsForWorkItem(store, updated.id);
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
        { store, pmStore, agentStore, skillStore, config, memoryStore, journalStore, blockageStore, questionStore },
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

  /**
   * **Re-run a work item's own stated checks against the artifact, and reconcile the item with the result.**
   *
   * The operator's own act, beside `closure` and `release`, and reachable from no agent: a done item's checks
   * ran once inside the job that produced the artifact, so nothing could tell a green board from a green
   * checkout afterwards. Suite 11's sabotage beats are unmeasurable without this — measured 2026-10-21 on the
   * suite's first run (`s11r1`), where the front office's only recommendation was *"re-run the four commands
   * through the worker"* and no surface could (BOARD F-122).
   *
   * `verdict: failed` **reopens** a `done` item, so the board cannot show done while a stated check fails; a
   * pass closes it back only when this surface is what reopened it.
   */
  app.post("/api/v1/work-items/:id/verification", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ by?: string; notes?: string }>();
    try {
      const item = pmStore.getWorkItem(id);
      const project = item ? store.getProject(item.projectId) : undefined;
      const result = verifyWorkItem(
        {
          pmStore,
          journalStore,
          project,
          // The closure gate decides, not this route: a check that passes on an open item re-decides it against
          // the evidence that just landed, so the operator does not spend a job to satisfy a criterion a command
          // already proved.
          reevaluate: (workItemId: string) =>
            reevaluateBlockedWorkItemClosure(closureReconciliationCtx(), workItemId),
        },
        { workItemIdOrTitle: id, by: body.by ?? "operator" },
      );
      return c.json(result, result.verdict === "unverifiable" ? 409 : 200);
    } catch (error) {
      if (error instanceof VerifyWorkItemError) {
        const status = error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/v1/work-items/:id/retry", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await retryWorkItem(
        { store, pmStore, agentStore, skillStore, config, memoryStore, journalStore, blockageStore, questionStore },
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

  /**
   * The discharge of a closure refusal: take the decision it asked for, then let closure decide again.
   *
   * Measured 2026-10-01 (BOARD F-088): the leaf that could not close had two succeeded jobs and two
   * answered gates, its refusal was real, and no operator surface could see it or clear it —
   * `kampaku projects step` re-ran the work and changed nothing. `decision` is one of three:
   *
   * - `decide` — re-decide the closure against the job already on record. No decision, no new job;
   * - `peer_review` — record the review the rule asked for, naming who took it;
   * - `criterion` — decide one acceptance criterion, which becomes its evidence.
   *
   * Every shape ends in the same closure decision, so a refusal that still stands stands and is named.
   */
  app.post("/api/v1/work-items/:id/closure", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{
      decision?: "decide" | "peer_review" | "criterion";
      criterion_id?: string;
      outcome?: "accept" | "reject";
      by?: string;
      notes?: string;
    }>();
    const decision = body.decision ?? "decide";
    try {
      const discharge: ClosureDischarge =
        decision === "peer_review"
          ? { kind: "peer-review", accept: body.outcome !== "reject" }
          : decision === "criterion"
            ? {
                kind: "criterion",
                criterionId: body.criterion_id ?? "",
                accept: body.outcome !== "reject",
              }
            : { kind: "decide" };
      const result = dischargeClosure(closureReconciliationCtx(), {
        workItemId: id,
        discharge,
        by: body.by,
        notes: body.notes,
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof ClosureDischargeError) {
        const status = error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  /**
   * Release a `blocked` work item that no closure rule and no pending escalation accounts for.
   *
   * The four reasons an item reads `blocked` and the surfaces that clear them, in one place:
   * `POST /work-items/:id/closure` takes the decision a closure rule asked for, `POST /blockers/:id/resolve`
   * and `POST /questions/:id/answer` clear the escalations that freeze an item, and this one exists for the
   * item left blocked with **nothing** to name — a freeze from before a freeze was recorded (BOARD F-089).
   * It refuses every block that is accounted for, so it cannot be used to walk past a gate.
   */
  app.post("/api/v1/work-items/:id/release", async (c) => {
    const body = await c.req.json<{ by?: string; notes?: string }>();
    try {
      const result = releaseUnaccountedBlock(
        { pmStore, journalStore, blockageStore, questionStore, agentStore },
        { workItemId: c.req.param("id"), by: body.by ?? "", notes: body.notes ?? "" },
      );
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof BlockReleaseError) {
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

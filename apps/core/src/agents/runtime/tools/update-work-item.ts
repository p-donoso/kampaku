import type { KampakuToolContext } from "./index.js";
import type { PmStore, WorkItemStatus } from "../../../persistence/pm-store.js";
import { rollupParentWorkItemStatuses } from "../../../application/pm/work-item-parent-rollup.js";
import { PmStoreError } from "../../../persistence/pm-store.js";
import { assertManualDoneAllowed, hasManualDoneEvidence, resolveManualDoneActor } from "../../../application/pm/done-honesty.js";
import { ensurePhaseAuditorAfterLeafDone } from "../../../application/pm/phase-auditor-gate.js";
import { assertWorkItemMutationScope } from "./authorization.js";

export interface UpdateWorkItemArgs {
  work_item_id: string;
  title?: string;
  description?: string;
  status?: WorkItemStatus;
  assignee_slug?: string | null;
  parent_work_item_id?: string | null;
}

export function executeUpdateWorkItem(
  ctx: KampakuToolContext,
  args: UpdateWorkItemArgs,
  scope?: { agentId?: string },
): {
  id: string;
  title: string;
  status: WorkItemStatus;
  assigneeSlug: string | null;
  parentId: string | null;
} {
  const existing = ctx.pmStore.getWorkItem(args.work_item_id);
  if (!existing) {
    throw new Error(`Work item not found: ${args.work_item_id}`);
  }
  if (scope?.agentId) {
    assertWorkItemMutationScope(ctx.agentStore, ctx.pmStore, ctx.store, scope.agentId, existing);
    if (args.parent_work_item_id) {
      const parent = ctx.pmStore.getWorkItem(args.parent_work_item_id);
      if (!parent || parent.projectId !== existing.projectId) {
        throw new Error("Parent work item must belong to the same project.");
      }
      assertWorkItemMutationScope(ctx.agentStore, ctx.pmStore, ctx.store, scope.agentId, parent);
    }
  }

  try {
    const patch: Parameters<PmStore["updateWorkItem"]>[1] = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.status !== undefined) {
      if (args.status === "done") {
        const agent = scope?.agentId ? ctx.agentStore.getAgentBySlugOrId(scope.agentId) : undefined;
        const actor = resolveManualDoneActor(agent?.slug);
        assertManualDoneAllowed(actor);
        if (actor === "auditor") {
          const evidence = ctx.journalStore?.listForWorkItem(existing.id) ?? [];
          if (!hasManualDoneEvidence(evidence)) {
            throw new Error(
              "Auditor closure requires a completion report, phase gate, or deliverable audit entry in the work-item journal.",
            );
          }
        }
      }
      patch.status = args.status;
    }
    if (args.assignee_slug !== undefined) {
      if (args.assignee_slug === null) {
        patch.assigneeAgentId = undefined;
      } else {
        const agent = ctx.agentStore.getAgentBySlugOrId(args.assignee_slug);
        if (!agent) throw new Error(`Agent not found: ${args.assignee_slug}`);
        patch.assigneeAgentId = agent.id;
      }
    }
    if (args.parent_work_item_id !== undefined) {
      patch.parentId = args.parent_work_item_id === null ? undefined : args.parent_work_item_id;
    }

    const updated = ctx.pmStore.updateWorkItem(args.work_item_id, patch);
    if (!updated) throw new Error(`Work item not found: ${args.work_item_id}`);

    if (args.status === "done" || args.status === "cancelled") {
      if (args.status === "done") {
        ensurePhaseAuditorAfterLeafDone(ctx.pmStore, ctx.agentStore, ctx.store, updated.id, ctx.journalStore);
      }
      rollupParentWorkItemStatuses(ctx.pmStore, updated.id);
    }

    const assigneeSlug = updated.assigneeAgentId
      ? ctx.agentStore.getAgentBySlugOrId(updated.assigneeAgentId)?.slug ?? null
      : null;

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      assigneeSlug,
      parentId: updated.parentId ?? null,
    };
  } catch (error) {
    if (error instanceof PmStoreError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export const UPDATE_WORK_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "update_work_item",
    description:
      "Update an existing work item: cancel duplicates, reassign to another agent, reparent under a container, or refine title/description. Prefer this over submit_intent when fixing task tree hygiene on an existing project.",
    parameters: {
      type: "object",
      properties: {
        work_item_id: {
          type: "string",
          description: "Work item UUID.",
        },
        title: {
          type: "string",
          description: "New title.",
        },
        description: {
          type: "string",
          description: "New description or acceptance-criteria notes.",
        },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "blocked", "done", "cancelled"],
          description: "New status. Use cancelled to retire duplicate tasks.",
        },
        assignee_slug: {
          type: ["string", "null"],
          description: "Agent slug to assign, or null to clear.",
        },
        parent_work_item_id: {
          type: ["string", "null"],
          description: "Parent container work item UUID, or null for root.",
        },
      },
      required: ["work_item_id"],
    },
  },
};

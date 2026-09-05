import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { createModelBroker } from "../model-broker/client.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { Store } from "../persistence/store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import { recordDelegationJournal } from "../application/pm/journal-events.js";
import { createProject } from "../application/projects.js";
import { createMissingAgentFromSlug, defaultProjectTeamSlugs } from "../bootstrap/kampaku-platform-team.js";
import { decomposeIntent } from "./decompose-intent.js";
import { expandUntilBudget } from "./expand-phase-leaves.js";
import { inferProjectLeadSlug, matchAgentsBatch } from "./match-agent.js";
import { resolvePlanGranularity, type PlanGranularity } from "./plan-granularity.js";
import {
  dropInvalidLeaves,
  formatPlanValidationIssues,
  validatePlan,
} from "./plan-validation.js";
import { snapshotPlannedComplexity } from "./work-item-complexity.js";
import { sortWorkItemsForCreation, slugifyName, type PlannedWorkItem } from "./types.js";
import { listOpenWorkItems } from "./open-work-items.js";
import { resolveModelProviderSettings } from "../application/settings/model-provider.js";

export interface PlanAndDelegateInput {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
  granularity?: PlanGranularity;
}

export interface PlanAndDelegateResult {
  projectSlug: string;
  projectId: string;
  plannerUsed: "llm" | "stub";
  documentsCreated: number;
  milestonesCreated: number;
  workItemsCreated: number;
  granularity: PlanGranularity;
  planValidation: { ok: boolean; leafCount: number; issueCount: number };
  assignments: Array<{
    workItemId: string;
    title: string;
    assigneeSlug: string;
    reason: string;
  }>;
  summary: string;
}

export interface PlanAndDelegateContext {
  store: Store;
  pmStore: PmStore;
  agentStore: AgentStore;
  config: AppConfig;
  journalStore?: JournalStore;
  skillStore?: import("../persistence/skill-store.js").SkillStore;
}

function isContainerItem(item: PlannedWorkItem, allItems: PlannedWorkItem[]): boolean {
  const key = item.title.toLowerCase();
  return allItems.some((other) => other.parent_ref?.toLowerCase() === key);
}

function buildCoherenceDocument(
  projectName: string,
  projectLeadSlug: string | undefined,
  coherenceStrategy: string | undefined,
  rootTasks: PlannedWorkItem[],
): string {
  const lines = [
    `# Coherence plan — ${projectName}`,
    "",
    "This roadmap and its task tree will be **executed by AI agents**. The project lead maintains coherence.",
    "",
    projectLeadSlug ? `**Project lead:** \`${projectLeadSlug}\`` : "",
    coherenceStrategy ? `\n${coherenceStrategy}\n` : "",
    "## Project lead role",
    "- Consolidate task and subtask tree state",
    "- Validate per-task closure criteria",
    "- Reassign or unblock subtasks without losing context",
    "",
  ];

  const roots = rootTasks.filter((item) => !item.parent_ref);
  if (roots.length > 0) {
    lines.push("## Planned root tasks");
    for (const task of roots) {
      lines.push(`- ${task.title}`);
    }
    lines.push("");
  }

  return lines.filter(Boolean).join("\n");
}

export async function planAndDelegate(
  ctx: PlanAndDelegateContext,
  input: PlanAndDelegateInput,
): Promise<PlanAndDelegateResult> {
  const broker = createModelBroker(resolveModelProviderSettings(ctx.store, ctx.config));

  const agents = ctx.agentStore.listAllAgents();
  const existingProject = input.projectSlug
    ? ctx.store.getProjectBySlug(input.projectSlug)
    : undefined;

  const openWorkItems = existingProject
    ? listOpenWorkItems(ctx.pmStore.listWorkItemsByProject(existingProject.id), ctx.agentStore)
    : [];

  const granularity = resolvePlanGranularity({
    granularity: input.granularity,
    existingProject: Boolean(existingProject),
  });

  const { plan, plannerUsed } = await decomposeIntent({
    intent: input.intent,
    projectSlug: input.projectSlug,
    existingProjectName: existingProject?.name,
    openWorkItems,
    agents,
    config: ctx.config,
    broker,
    granularity,
  });

  const mode = existingProject ? "incremental" : "greenfield";
  let prepared = await expandUntilBudget({
    plan: dropInvalidLeaves(plan),
    intent: input.intent,
    granularity,
    broker: plannerUsed === "llm" ? broker : undefined,
    mode,
  });
  prepared = dropInvalidLeaves(prepared);
  const validation = validatePlan(prepared, { intent: input.intent, granularity, mode });
  plan.work_items = prepared.work_items;

  let project = existingProject;
  if (!project && plan.project) {
    project = createProject(ctx.store, {
      slug: plan.project.slug,
      name: plan.project.name,
      description: plan.project.description,
      status: "planning",
    });
  } else if (!project) {
    const name = "New Project";
    project = createProject(ctx.store, {
      slug: input.projectSlug ?? slugifyName(name),
      name,
      description: input.intent.slice(0, 500),
      status: "planning",
    });
  }

  const projectLeadSlug =
    plan.project_lead_slug ??
    inferProjectLeadSlug(ctx.agentStore, input.intent, project.slug);

  const projectLead = projectLeadSlug
    ? ctx.agentStore.getAgentBySlugOrId(projectLeadSlug)
    : undefined;

  ctx.store.updateProjectPlanning(project.id, {
    planGranularity: granularity,
    ...(projectLead ? { projectLeadAgentId: projectLead.id } : {}),
    ...(plan.coherence_strategy != null ? { coherenceStrategy: plan.coherence_strategy } : {}),
  });

  const now = new Date().toISOString();
  const kampaku = ctx.agentStore.getKampakuAgent();

  const coherenceDoc = buildCoherenceDocument(
    project.name,
    projectLeadSlug,
    plan.coherence_strategy,
    plan.work_items,
  );

  const documents = [...(plan.documents ?? [])];
  if (!documents.some((d) => /coherence/i.test(d.title))) {
    documents.push({
      title: "Coherence plan",
      content_md: coherenceDoc,
    });
  }

  let documentsCreated = 0;
  for (const doc of documents) {
    ctx.pmStore.createDocument({
      id: uuidv4(),
      projectId: project.id,
      slug: slugifyName(doc.title),
      title: doc.title,
      contentMd: doc.content_md,
      createdAt: now,
      updatedAt: now,
    });
    documentsCreated += 1;
  }

  let milestonesCreated = 0;
  for (const [index, milestone] of (plan.milestones ?? []).entries()) {
    ctx.pmStore.createMilestone({
      id: uuidv4(),
      projectId: project.id,
      title: milestone.title,
      description: milestone.description,
      targetDate: milestone.target_date,
      sortOrder: index,
      status: "planned",
      successCriteria: milestone.success_criteria ?? [],
      executedBy: milestone.executed_by ?? "ai_agents",
    });
    milestonesCreated += 1;
  }

  const createMissingAgents = input.createMissingAgents ?? !existingProject;

  const sortedItems = sortWorkItemsForCreation(plan.work_items);

  if (createMissingAgents) {
    const slugsToCreate = new Set<string>();
    const teamSlug = project.slug ?? slugifyName(project.name);
    for (const teamMember of defaultProjectTeamSlugs(teamSlug)) {
      slugsToCreate.add(teamMember);
    }
    if (plan.project_lead_slug) slugsToCreate.add(plan.project_lead_slug);
    for (const item of sortedItems) {
      if (item.assignee_slug) slugsToCreate.add(item.assignee_slug);
    }
    for (const slug of slugsToCreate) {
      const item = sortedItems.find((entry) => entry.assignee_slug === slug);
      const parentSlug =
        slug.endsWith("-lead") || !plan.project_lead_slug || slug === plan.project_lead_slug
          ? "kampaku"
          : (plan.project_lead_slug ?? `${teamSlug}-lead`);
      createMissingAgentFromSlug(
        ctx.agentStore,
        slug,
        item?.suggested_responsibility,
        parentSlug,
        ctx.skillStore,
      );
    }
  }

  const routing = await matchAgentsBatch(sortedItems, {
    agentStore: ctx.agentStore,
    config: ctx.config,
    broker,
    projectSlug: project.slug,
    projectLeadSlug,
    intent: input.intent,
  });

  const workItemIdByTitle = new Map<string, string>();
  const assignments: PlanAndDelegateResult["assignments"] = [];
  let workItemsCreated = 0;

  for (const [index, item] of sortedItems.entries()) {
    let { agent, reason } = routing.get(item.title) ?? {
      agent: kampaku,
      reason: "Fallback",
    };

    if (isContainerItem(item, plan.work_items) && projectLead) {
      agent = projectLead;
      reason = "Container task assigned to project lead for coherence oversight";
    }

    const parentId = item.parent_ref
      ? workItemIdByTitle.get(item.parent_ref.toLowerCase())
      : undefined;

    const workItemId = uuidv4();
    const createdAt = new Date().toISOString();

    ctx.pmStore.createWorkItem({
      id: workItemId,
      projectId: project.id,
      parentId,
      title: item.title,
      description: item.description,
      status: "todo",
      priority: item.priority,
      sortOrder: index,
      assigneeAgentId: agent.id,
      assignedByAgentId: projectLead?.id ?? kampaku.id,
      routingReason: reason,
      acceptanceCriteria: item.acceptance_criteria ?? [],
      dependsOn: item.depends_on ?? [],
      complexity: snapshotPlannedComplexity(item, plan.work_items, granularity),
      createdAt,
      updatedAt: createdAt,
    });

    ctx.pmStore.recordDelegationEvent({
      workItemId,
      fromAgentId: projectLead?.id ?? kampaku.id,
      toAgentId: agent.id,
      reason,
      occurredAt: createdAt,
    });

    recordDelegationJournal(ctx.journalStore, ctx.pmStore, {
      projectId: project.id,
      workItemId,
      parentId,
      title: item.title,
      fromAgentId: projectLead?.id ?? kampaku.id,
      toAgentId: agent.id,
      reason,
      occurredAt: createdAt,
    });

    workItemIdByTitle.set(item.title.toLowerCase(), workItemId);
    assignments.push({
      workItemId,
      title: item.title,
      assigneeSlug: agent.slug,
      reason,
    });
    workItemsCreated += 1;
  }

  const leadNote = projectLeadSlug ? `\nProject lead: ${projectLeadSlug}` : "";
  const validationNote = validation.ok
    ? `${validation.leafCount} validated leaf tasks (${granularity})`
    : `Plan validation warnings:\n${formatPlanValidationIssues(validation.issues)}`;
  const summary = [
    `Project "${project.name}" (${project.slug})${leadNote}`,
    `${workItemsCreated} task(s) in recursive tree for AI agents`,
    validationNote,
    `${milestonesCreated} roadmap milestone(s) [executed by AI]`,
    assignments.map((a) => `  - ${a.title} → ${a.assigneeSlug}`).join("\n"),
  ].join("\n");

  return {
    projectSlug: project.slug,
    projectId: project.id,
    plannerUsed,
    documentsCreated,
    milestonesCreated,
    workItemsCreated,
    granularity,
    planValidation: {
      ok: validation.ok,
      leafCount: validation.leafCount,
      issueCount: validation.issues.length,
    },
    assignments,
    summary,
  };
}

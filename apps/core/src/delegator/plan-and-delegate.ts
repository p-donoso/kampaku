import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { createModelBroker } from "../model-broker/client.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import { PLAN_PREVIEW_WINDOW_MS } from "../persistence/store.js";
import type { Store } from "../persistence/store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { PostActionReviewStore } from "../persistence/post-action-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import { buildPostActionRuntime, recordPostActionLifecycle } from "../application/pm/post-action/index.js";
import { recordDelegationJournal } from "../application/pm/journal-events.js";
import { createProject } from "../application/projects.js";
import { createMissingAgentFromSlug, defaultProjectTeamSlugs } from "../application/bootstrap/kampaku-platform-team.js";
import { decomposeIntent } from "./decompose-intent.js";
import { assertTurnBudget, type TurnDeadline } from "../agents/runtime/turn-budget.js";
import { expandUntilBudget } from "./expand-phase-leaves.js";
import { inferProjectLeadSlug, matchAgentsBatch } from "./match-agent.js";
import { assessPlanRoster, type PlanRosterFinding } from "./roster-validation.js";
import { resolvePlanGranularity, type PlanGranularity } from "./plan-granularity.js";
import {
  dropInvalidLeaves,
  formatPlanValidationIssues,
  validatePlan,
} from "./plan-validation.js";
import { snapshotPlannedComplexity } from "./work-item-complexity.js";
import { parsePlannedProject, sortWorkItemsForCreation, slugifyName, type PlannedProject, type PlannedWorkItem } from "./types.js";
import { resolveDependencyReferences } from "../application/pm/work-item-order.js";
import { listOpenWorkItems } from "./open-work-items.js";
import { supersedePriorPlan } from "../application/pm/plan-supersession.js";
import { brokerOptionsFor, resolveModelProviderSettings } from "../application/settings/model-provider.js";
import { createHash } from "node:crypto";

export interface PlanAndDelegateInput {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
  granularity?: PlanGranularity;
  mode?: "preview" | "apply";
  approvalReference?: string;
  approvalFingerprint?: string;
  approvalContentHash?: string;
  /**
   * The clock of the turn that asked for this plan.
   *
   * Planning spends several model calls — one to decompose, then one per coarse node per depth to expand —
   * and all of it happens inside a single tool call, so none of it is bounded by the session loops that
   * check the turn's deadline before *their* model calls. Measured 2026-09-25 (suite 06): the intake turn
   * spent 1 063 s of a 300 s budget here and never returned. See turn-budget.ts.
   */
  turn?: TurnDeadline | undefined;
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
  /** When the previewed plan stops being approvable, ISO-8601. Present only on a preview. */
  previewExpiresAt?: string;
  assignments: Array<{
    workItemId: string;
    title: string;
    assigneeSlug: string;
    reason: string;
  }>;
  /**
   * What the plan declared that this project cannot provide, resolved before anything was recorded or
   * persisted. BOARD F-102: the roster used to be previewed unvalidated and applied after a silent
   * substitution, and a criterion requiring a station the project could not have was persisted with it.
   * Empty when the plan's own roster is exactly what the project can staff.
   */
  rosterFindings: PlanRosterFinding[];
  summary: string;
  approvalReference?: string;
  planFingerprint?: string;
  planContentHash?: string;
}

export interface PlanAndDelegateContext {
  store: Store;
  pmStore: PmStore;
  agentStore: AgentStore;
  config: AppConfig;
  journalStore?: JournalStore;
  skillStore?: import("../persistence/skill-store.js").SkillStore;
  memoryStore?: MemoryStore;
  wikiStore?: import("../persistence/wiki-store.js").WikiStore;
  postActionStore?: PostActionReviewStore;
}

function isContainerItem(item: PlannedWorkItem, allItems: PlannedWorkItem[]): boolean {
  const key = item.title.toLowerCase();
  return allItems.some((other) => other.parent_ref?.toLowerCase() === key);
}

function assignFormalPhaseKeys(items: PlannedWorkItem[]): PlannedWorkItem[] {
  const byTitle = new Map(items.map((item) => [item.title.toLowerCase(), item]));
  const keys = new Map<string, string>();
  const resolve = (item: PlannedWorkItem): string => {
    const titleKey = item.title.toLowerCase();
    const existing = keys.get(titleKey);
    if (existing) return existing;
    const ownKey = item.phase_key ?? (item.parent_ref ? undefined : `phase-${slugifyName(item.title)}`);
    const key = ownKey ?? (item.parent_ref ? resolve(byTitle.get(item.parent_ref.toLowerCase()) ?? item) : `phase-${slugifyName(item.title)}`);
    keys.set(titleKey, key);
    return key;
  };
  return items.map((item) => ({ ...item, phase_key: resolve(item) }));
}

function hashPlanContent(plan: PlannedProject): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
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
  // Built lazily, and only when a model is actually going to be called.
  //
  // It used to be constructed here, unconditionally, which was harmless while the broker silently
  // defaulted to `http://localhost:3001/v1`; now that a missing endpoint is a real error, an eager
  // construction would make **stub mode** fail for want of an endpoint it never uses. The contract's own
  // wording is "fails at the point the model is actually needed", so the failure belongs here instead.
  let cachedBroker: ReturnType<typeof createModelBroker> | undefined;
  const broker = () => {
    cachedBroker ??= createModelBroker(
      brokerOptionsFor("planning", ctx.config, resolveModelProviderSettings(ctx.store, ctx.config)),
    );
    return cachedBroker;
  };

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

  const approvedPreview = input.mode === "apply" && input.approvalReference
    ? ctx.store.getPlanPreview(input.approvalReference)
    : undefined;
  // **An apply resolves its approval before it spends a single model call.** The old order derived a whole
  // plan and only then discovered that the reference resolved to nothing, which made a refused apply as
  // expensive as a preview: one decomposition plus one expansion pass, up to a model call per node per depth.
  // It also put a recoverable refusal behind every failure that planning itself can raise.
  //
  // Measured 2026-09-28 (suite 07, run 16): with the reference dropped at the tool boundary (see
  // `tools/submit-intent.ts`), four apply attempts re-planned the whole project and were then refused for a
  // reason that named no field — and the second attempt died on an unrelated `parent_ref` schema error, which
  // means a schema slip in one node could consume the turn's remaining budget on a path that was going to be
  // refused anyway. A refusal that costs nothing cannot take a turn down with it.
  if (input.mode === "apply") {
    if (!input.approvalReference) {
      throw new Error(
        "Plan apply refused: approval_reference is required. Run submit_intent in preview mode first, then " +
          "approve the reference it returned. Nothing was persisted.",
      );
    }
    if (!approvedPreview) {
      // **A preview that lapsed and a preview that never existed are different answers**, and the refusal
      // says which one it is: the fix for a lapsed preview is "preview again", and the fix for a reference
      // from nowhere is "check the reference". Measured 2026-10-21 (suite 12, `s12r1`): previews carried no
      // lifetime, so there was only one answer, and it was right by accident.
      const lapsedAt = ctx.store.getPlanPreviewExpiry(input.approvalReference);
      if (lapsedAt) {
        throw new Error(
          `Plan apply refused: the preview for approval_reference "${input.approvalReference}" expired at ` +
            `"${lapsedAt}". A preview stays approvable for ${Math.round(PLAN_PREVIEW_WINDOW_MS / 3_600_000)} ` +
            "hours after it is recorded, because the plan is a statement about the checkout at that moment. " +
            "Run submit_intent in preview mode again. Nothing was persisted.",
        );
      }
      throw new Error(
        `Plan apply refused: no previewed plan matches approval_reference "${input.approvalReference}". ` +
          "Either the reference is not from this instance, or the preview it names never completed. Run " +
          "submit_intent in preview mode and approve the reference it returns. Nothing was persisted.",
      );
    }
  }
  let plan: PlannedProject;
  let plannerUsed: "llm" | "stub";
  if (approvedPreview) {
    plan = approvedPreview.plan;
    plannerUsed = approvedPreview.plannerUsed;
  } else {
    const decomposed = await decomposeIntent({
      intent: input.intent,
      projectSlug: input.projectSlug,
      existingProjectName: existingProject?.name,
      openWorkItems,
      agents,
      config: ctx.config,
      broker: ctx.config.plannerMode === "llm" ? broker() : undefined,
      granularity,
      turn: input.turn,
    });
    plan = decomposed.plan;
    plannerUsed = decomposed.plannerUsed;
  }

  const mode = existingProject ? "incremental" : "greenfield";
  let preparedPlan = approvedPreview ? plan : await expandUntilBudget({
    plan: plannerUsed === "llm" ? plan : dropInvalidLeaves(plan), intent: input.intent, granularity,
    broker: plannerUsed === "llm" ? broker() : undefined, mode,
    maxDepth: plannerUsed === "llm" && granularity === "standard" ? 0 : undefined,
    turn: input.turn,
  });
  const retainedPlan = plannerUsed === "llm" ? preparedPlan : dropInvalidLeaves(preparedPlan);
  preparedPlan = { ...retainedPlan, work_items: assignFormalPhaseKeys(retainedPlan.work_items) };
  let validation = validatePlan(preparedPlan, { intent: input.intent, granularity, mode });
  if (plannerUsed === "llm" && !validation.ok && !approvedPreview) {
    assertTurnBudget(input.turn, "Plan repair");
    const repair = await broker().chat([
      {
        role: "system",
        content: "You repair Kampaku execution plans. Return only a complete JSON plan matching the original schema. Preserve the requested scope and existing project context. Fix every validation issue by making leaf descriptions at least 200 characters and adding a file-exists check or runnable npm command to each leaf. Do not add generic future phases or silently drop requested implementation work.",
      },
      {
        role: "user",
        content: JSON.stringify({
          intent: input.intent,
          invalid_plan: preparedPlan,
          validation_issues: formatPlanValidationIssues(validation.issues),
        }),
      },
    ]);
    const repaired = parsePlannedProject(JSON.parse(repair.content));
    if (input.projectSlug && repaired.project) repaired.project.slug = input.projectSlug;
    preparedPlan = { ...repaired, work_items: assignFormalPhaseKeys(repaired.work_items) };
    validation = validatePlan(preparedPlan, { intent: input.intent, granularity, mode });
  }
  if (plannerUsed === "llm" && !validation.ok) {
    throw new Error(`LLM plan failed validation after repair:\n${formatPlanValidationIssues(validation.issues)}`);
  }
  // **The plan's own declared roster is resolved here, before the plan is recorded or applied** (BOARD
  // F-102). Everything downstream — the preview record, the content hash the approval is bound to, the owners
  // the apply persists — reads the plan *after* this call, so what the emperor approves is what the apply
  // writes. Two things it can find: a leaf the plan gave to a station this project cannot have, and a criterion
  // that requires an author other than the leaf's own on a project with one seat. Both are reported; neither
  // is discovered later by reading back the leaves and noticing who owns them.
  //
  // Measured on suite 08's fifth re-run (`s08r12`): four platform stations previewed, an apply that refused
  // them, four leaves re-owned by the project's single lead with the preview's criteria left standing, and a
  // phase gate whose criterion — *"The auditor authored none of leaves one to three"* — nobody could satisfy.
  const prospectiveSlug = input.projectSlug ?? plan.project?.slug ?? slugifyName("new-project");
  const rosterLeadSlug =
    plan.project_lead_slug ??
    inferProjectLeadSlug(ctx.agentStore, input.intent, prospectiveSlug) ??
    (input.createMissingAgents === true ? `${prospectiveSlug}-lead` : undefined);
  const roster = assessPlanRoster(preparedPlan.work_items, {
    projectSlug: prospectiveSlug,
    projectLeadSlug: rosterLeadSlug,
    agentStore: ctx.agentStore,
  });
  preparedPlan = { ...preparedPlan, work_items: roster.workItems };
  const rosterReasonByTitle = new Map(roster.owners.map((owner) => [owner.title, owner.reason]));
  plan.work_items = preparedPlan.work_items;
  // **An apply takes the preview's fingerprint and content hash; it does not re-derive them.** The approval the
  // apply is presenting was recorded against a *preview*, and `recordPlanApproval` already proved that approval
  // matched that preview's fingerprint, content hash and project. Re-deriving here measures something else —
  // this call's request — so a caller that restates its own request even slightly (the planner's default
  // `granularity` resolves differently once the project exists, or the field is simply omitted on the retry)
  // gets a hash the approval was never about, and the apply is refused for a reason the caller cannot see.
  //
  // Measured 2026-09-26 taking suite 07 (run 10, after the front office stopped re-reading the checkout and the
  // sequence finally reached the apply): the lead previewed at 20:42:56 and approved at 20:43:00 with matching
  // fingerprints, then called `submit_intent` four more times and **never once with `mode: "apply"`** — every
  // attempt was refused, no work item was persisted, and the turn stopped at its budget with the plan sitting
  // one call away. The approval is bound to the preview; the apply should be too.
  const planFingerprint = approvedPreview ? approvedPreview.planFingerprint : createHash("sha256").update(JSON.stringify({ intent: input.intent.trim(), projectSlug: input.projectSlug ?? plan.project?.slug ?? null, granularity })).digest("hex");
  const planContentHash = approvedPreview ? approvedPreview.planContentHash : hashPlanContent({ ...plan, work_items: preparedPlan.work_items });

  if (input.mode === "apply") {
    // **Every unmet condition is reported, with the values it compared.** The previous form listed eight
    // checks in one boolean and answered with one sentence naming none of them, so a caller could not tell a
    // lost approval from a slug mismatch from a hash that had drifted, and its only rational move was to
    // repeat the call. Measured 2026-09-28 (suite 07, run 16): five apply attempts over four minutes, each
    // rejected by the same sentence, one call away from a working plan. A refusal is a message to the caller;
    // one that does not say what to change is not a message.
    const short = (value: string | undefined) => (value ? `${value.slice(0, 12)}…` : "absent");
    const problems: string[] = [];
    if (!input.projectSlug?.trim()) {
      problems.push("project_slug is required and was absent.");
    } else if (input.projectSlug !== approvedPreview?.projectSlug) {
      problems.push(
        `project_slug "${input.projectSlug}" is not the project this plan was previewed for ` +
          `("${approvedPreview?.projectSlug}").`,
      );
    }
    if (input.approvalFingerprint !== planFingerprint) {
      problems.push(
        `approval_fingerprint ${short(input.approvalFingerprint)} does not match the previewed plan's ` +
          `${short(planFingerprint)}.`,
      );
    }
    if (input.approvalContentHash !== planContentHash) {
      problems.push(
        `approval_content_hash ${short(input.approvalContentHash)} does not match the previewed plan's ` +
          `${short(planContentHash)}.`,
      );
    }
    // Asked with the slug the preview was recorded under, so this cannot report "no approval" for an approval
    // that exists under a slug the caller merely spelled differently — that case is named above, as a slug
    // mismatch, which is what it is.
    // **A roster this project cannot staff is a refusal of the plan, not a substitution the caller discovers
    // by reading back the leaves.** With the preview check above in place this is empty for every preview
    // recorded after it; it fires for a preview that predates it, or for a plan whose declared owners changed
    // between the preview and the apply. Either way the answer names the leaf, the declared owner and the seat
    // the project would have to give it, so the caller's move is to preview again, not to guess.
    for (const finding of roster.findings) {
      if (finding.kind !== "roster_refused") continue;
      problems.push(finding.detail);
    }
    if (
      problems.length === 0 &&
      input.approvalReference &&
      input.projectSlug &&
      !ctx.store.hasPlanApproval(
        approvedPreview?.projectSlug ?? input.projectSlug,
        input.approvalReference,
        planFingerprint,
        planContentHash,
      )
    ) {
      problems.push(
        `no live approval is recorded for reference "${input.approvalReference}" with this fingerprint and ` +
          "content hash. An approval expires, and a lapse of 24 hours is the default; approve the preview " +
          "again, or preview again if the plan changed.",
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `Plan apply refused:\n- ${problems.join("\n- ")}\nNothing was persisted.`,
      );
    }
  }

  if (input.mode === "preview") {
    const previewSlug = plan.project?.slug ?? input.projectSlug ?? slugifyName("new-project");
    const approvalReference = `plan-${uuidv4()}`;
    const { expiresAt: previewExpiresAt } = ctx.store.recordPlanPreview({ projectSlug: previewSlug, approvalReference, planFingerprint, planContentHash, plan: { ...plan, work_items: preparedPlan.work_items }, plannerUsed });
    return {
      projectSlug: previewSlug,
      projectId: "",
      plannerUsed,
      documentsCreated: 0,
      milestonesCreated: 0,
      workItemsCreated: 0,
      granularity,
      planValidation: { ok: validation.ok, leafCount: validation.leafCount, issueCount: validation.issues.length },
      rosterFindings: roster.findings,
      // The owners listed here are the owners the apply will persist, not the ones the plan declared — and where
      // the two differ the reason says so. A preview whose assignment list is a different roster than the one
      // that lands is the defect this file's roster check exists to remove (BOARD F-102).
      assignments: preparedPlan.work_items.map((item) => ({
        workItemId: "",
        title: item.title,
        assigneeSlug: item.assignee_slug ?? "unassigned",
        reason: rosterReasonByTitle.get(item.title) ?? "Preview only; requires lead approval before persistence",
      })),
      summary: [
        `Plan preview for "${previewSlug}". No project, agents, tasks, documents, or assignments were persisted. Approval reference: ${approvalReference}`,
        roster.summary,
      ].filter(Boolean).join("\n\n"),
      approvalReference,
      // The preview's own lifetime, in the preview's own report. A caller that has to guess when an approval
      // stops being usable will approve one that cannot be applied (BOARD F-012): an approval carries an
      // expiry and the preview it points at now carries the same one, so both numbers are in the answer.
      previewExpiresAt,
      planFingerprint,
      planContentHash,
    };
  }

  let project = existingProject;
  if (!project && plan.project) {
    project = createProject(ctx.store, {
      slug: plan.project.slug,
      name: plan.project.name,
      description: plan.project.description,
      status: "planning",
    }, { workspaceRoot: ctx.config.workspaceRoot });
  } else if (!project) {
    const name = "New Project";
    project = createProject(ctx.store, {
      slug: input.projectSlug ?? slugifyName(name),
      name,
      description: input.intent.slice(0, 500),
      status: "planning",
    }, { workspaceRoot: ctx.config.workspaceRoot });
  }

  const createMissingAgents = input.createMissingAgents === true;
  const projectLeadSlug =
    plan.project_lead_slug ??
    inferProjectLeadSlug(ctx.agentStore, input.intent, project.slug) ??
    (createMissingAgents ? `${project.slug}-lead` : undefined);

  // Create an explicitly requested project team before resolving the lead and
  // routing tasks, so the project record and root work actually belong to it.
  const sortedItems = sortWorkItemsForCreation(plan.work_items);
  const seatsWithoutCapabilities: string[] = [];
  if (createMissingAgents) {
    const slugsToCreate = new Set<string>();
    const teamSlug = project.slug ?? slugifyName(project.name);
    for (const teamMember of defaultProjectTeamSlugs(teamSlug)) {
      slugsToCreate.add(teamMember);
    }
    if (projectLeadSlug) slugsToCreate.add(projectLeadSlug);
    for (const item of sortedItems) {
      if (item.assignee_slug) slugsToCreate.add(item.assignee_slug);
    }
    for (const slug of slugsToCreate) {
      const item = sortedItems.find((entry) => entry.assignee_slug === slug);
      const parentSlug =
        slug.endsWith("-lead") || !projectLeadSlug || slug === projectLeadSlug
          ? "kampaku"
          : projectLeadSlug;
      const created = createMissingAgentFromSlug(
        ctx.agentStore,
        slug,
        item?.suggested_responsibility,
        parentSlug,
        ctx.skillStore,
      );
      // A seat whose role matches no known skill has no capabilities at all. It used to be created
      // silently, so the plan named an agent that could do nothing and nothing reported it
      // (BOARD F-023). Collected here and stated in the plan summary below.
      if (created && created.skills.matchedRole === null) {
        seatsWithoutCapabilities.push(slug);
      }
    }
  }

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

  // **A re-plan replaces its own previous output, and says so where a reader will look.** Measured 2026-10-20
  // (suite 07's `s07r22`, BOARD F-119): a second apply over an applied plan cancelled the first eight items and
  // left the first plan's pages and milestone published as current, so the surface held two contradicting trees
  // and a cold reader had to arbitrate which was real. The supersession happens **before** this plan's records are
  // written, so "the previous plan" is unambiguous, and it touches only `origin: "plan"` rows — a project's
  // knowledge pages are not this plan's output and are left alone however stale they are.
  const superseded = existingProject
    ? supersedePriorPlan(ctx.store, ctx.pmStore, ctx.wikiStore, project, {
        documentTitles: documents.map((doc) => doc.title),
        milestoneTitles: (plan.milestones ?? []).map((milestone) => milestone.title),
      })
    : undefined;

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

  const routing = await matchAgentsBatch(sortedItems, {
    agentStore: ctx.agentStore,
    config: ctx.config,
    // Only when a model is in play. Routing in stub mode is deterministic and must not require an
    // endpoint, which is what the lazy `broker()` exists for.
    broker: plannerUsed === "llm" ? broker() : undefined,
    projectSlug: project.slug,
    projectLeadSlug,
    intent: input.intent,
    pmStore: ctx.pmStore,
    skillStore: ctx.skillStore,
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
      frozenPaths: item.frozen_paths ?? [],
      // The planner names its dependencies by title — that is what a model can write while authoring a plan —
      // and they are resolved here to the ids this loop has already assigned. Stored by id so a later
      // retitling cannot silently detach the graph, which is what BOARD F-069 measured in run 18's store.
      // A forward edge to a step not yet written stays a title, and `dependsOnSatisfied` still honours it.
      dependsOn: resolveDependencyReferences(item.depends_on ?? [], workItemIdByTitle),
      complexity: snapshotPlannedComplexity(item, plan.work_items, granularity),
      phaseKey: item.phase_key,
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

    recordPostActionLifecycle(
      buildPostActionRuntime({
        pmStore: ctx.pmStore,
        agentStore: ctx.agentStore,
        reviewStore: ctx.postActionStore,
        store: ctx.store,
        journalStore: ctx.journalStore,
        memoryStore: ctx.memoryStore,
        wikiStore: ctx.wikiStore,
      }),
      {
        event: "delegation_completed",
        projectId: project.id,
        agentSlug: agent.slug,
        workItemId,
        referenceId: `${workItemId}:delegation`,
        summary: `Delegated "${item.title}" to ${agent.slug}. Reason recorded: ${reason}`,
        decisions: [reason],
        acceptanceCriteria: item.acceptance_criteria ?? [],
      },
    );

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
  // ...and it names the operation that closes the gap, because "give them a skill explicitly" was an
  // instruction with nothing behind it until `create_skill` existed: a capability the seed catalog does
  // not ship could not be authored at all, so a seat for an uncovered aspect could only be renamed or
  // left short (BOARD F-022).
  const capabilityWarning = seatsWithoutCapabilities.length > 0
    ? `Seats created with no capabilities: ${seatsWithoutCapabilities.join(", ")}. Their role name matched no known skill, so they were created without skills and cannot do work. Author what their aspect needs with create_skill (project_slug names this project, so it is scoped to it) and assign that slug, give them a seed skill explicitly, or name the role after an aspect the repository has.`
    : undefined;
  // The supersession is reported, not performed quietly: the reader of this apply needs to know that a previous
  // plan's pages stopped being current, or the surface silently loses history it was told to keep (BOARD F-119).
  const supersessionNote = superseded
    ? [
        superseded.archivedDocuments.length > 0
          ? `Superseded ${superseded.archivedDocuments.length} plan document(s) from the previous plan: ` +
            `${superseded.archivedDocuments.join(", ")}. They are archived, not deleted, and each now says so.`
          : undefined,
        superseded.cancelledMilestones.length > 0
          ? `Cancelled ${superseded.cancelledMilestones.length} previous milestone(s) this plan does not restate: ` +
            `${superseded.cancelledMilestones.join("; ")}.`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n")
    : undefined;

  const summary = [
    `Project "${project.name}" (${project.slug})${leadNote}`,
    `${workItemsCreated} task(s) in recursive tree for AI agents`,
    validationNote,
    supersessionNote,
    // Stated in the apply's own report as well as in the preview's, so a plan applied with a criterion no seat
    // on this project can satisfy says so at the moment it is applied rather than at the moment somebody tries
    // to sign it.
    roster.summary,
    capabilityWarning,
    `${milestonesCreated} roadmap milestone(s) [executed by AI]`,
    assignments.map((a) => `  - ${a.title} → ${a.assigneeSlug}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

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
    rosterFindings: roster.findings,
    summary,
  };
}

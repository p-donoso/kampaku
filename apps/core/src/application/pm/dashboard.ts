import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, ProjectOverview, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { Store } from "../../persistence/store.js";
import {
  deriveWorkItemComplexity,
  type WorkItemComplexity,
} from "../../delegator/work-item-complexity.js";
import type { PlanGranularity } from "../../delegator/plan-granularity.js";
import { getProjectByIdOrSlug } from "../projects.js";
import { identifyAcceptanceCriteria } from "./acceptance-criteria.js";
import { keyEvidenceToCriteria } from "./evidence-review.js";
import { type ExecutionPhase } from "./execution-status.js";
import {
  buildPendingEscalationWorkItemIds,
  ownBlockWorkItemIds,
  rollupWorkItemTreeWithExecution,
  type ExecutionWorkItemNode,
} from "./work-item-status-rollup.js";

function pendingEscalationIds(
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): Set<string> {
  return buildPendingEscalationWorkItemIds([
    ...(questionStore?.listPending() ?? []),
    ...(blockageStore?.listPending() ?? []),
  ]);
}

function findWorkItemNode<T extends { item: WorkItemRecord; children: T[] }>(
  nodes: T[],
  workItemId: string,
): T | undefined {
  for (const node of nodes) {
    if (node.item.id === workItemId) return node;
    const nested = findWorkItemNode(node.children, workItemId);
    if (nested) return nested;
  }
  return undefined;
}

export function getProjectOverview(
  store: Store,
  pmStore: PmStore,
  idOrSlug: string,
): ProjectOverview | undefined {
  const project = getProjectByIdOrSlug(store, idOrSlug);
  if (!project) return undefined;
  return pmStore.getProjectOverview(project);
}

type EnrichedWorkItem = WorkItemRecord & {
  assigneeSlug?: string;
  jobStatus?: string;
  executionPhase: ExecutionPhase;
  executionLabel: string;
};

type EnrichedWorkItemNode = {
  item: EnrichedWorkItem;
  children: EnrichedWorkItemNode[];
};

function countDescendantLeaves(node: EnrichedWorkItemNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countDescendantLeaves(child), 0);
}

function withComplexity(
  nodes: EnrichedWorkItemNode[],
  granularity: PlanGranularity | undefined,
  depth = 0,
): EnrichedWorkItemNode[] {
  return nodes.map((node) => {
    const children = withComplexity(node.children, granularity, depth + 1);
    const isContainer = children.length > 0;
    const leafCount = isContainer
      ? children.reduce((sum, child) => sum + countDescendantLeaves(child), 0)
      : 1;
    const derived = deriveWorkItemComplexity({
      title: node.item.title,
      description: node.item.description,
      acceptanceCriteria: node.item.acceptanceCriteria,
      granularity,
      depth,
      role: isContainer ? "container" : "leaf",
      leafCount,
    });
    const stored = node.item.complexity;
    const complexity: WorkItemComplexity = stored
      ? {
          ...stored,
          depth: stored.depth ?? depth,
          role: isContainer ? "container" : "leaf",
          leafCount: isContainer ? leafCount : stored.leafCount || 1,
          granularity: stored.granularity ?? granularity ?? derived.granularity,
        }
      : derived;
    return {
      item: { ...node.item, complexity },
      children,
    };
  });
}

function withAssigneeSlugs(
  nodes: ExecutionWorkItemNode[],
  slugById: Map<string, string>,
): EnrichedWorkItemNode[] {
  return nodes.map((node) => ({
    item: {
      ...node.item,
      assigneeSlug: node.item.assigneeAgentId
        ? slugById.get(node.item.assigneeAgentId)
        : undefined,
    },
    children: withAssigneeSlugs(node.children, slugById),
  }));
}

export type EnrichedProjectOverview = ProjectOverview & {
  /**
   * The container's owner, as the **slug** every other surface spells it with (BOARD F-109).
   *
   * The stored field is `projectLeadAgentId` — an agent id — and the id is what REST used to answer, while
   * chat, the web UI and the durable-state block all resolve and render the slug. Suite 01's oracle asks the
   * surfaces to "agree on the project slug/id, the **owner slug**, and the repository path string", and a
   * surface that answers an id where the others answer a slug agrees about the value and not about the name.
   * Resolving it here, beside the item assignee slugs this function already resolves from the same map, is
   * the one place it can be done without a second lookup: the map is already built below.
   *
   * `null` when the container has no owner **or** when the id resolves to no agent, which are different
   * states the caller can tell apart by reading `projectLeadAgentId` beside it — a resolved slug that is
   * silently the id is the defect this field exists to remove.
   */
  project: ProjectOverview["project"] & { projectLeadSlug: string | null };
  workItems: EnrichedWorkItemNode[];
};

export function enrichProjectOverview(
  overview: ProjectOverview,
  agentStore: AgentStore,
  store: Store,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
): EnrichedProjectOverview {
  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const rolled = rollupWorkItemTreeWithExecution(
    overview.workItems,
    store,
    pendingEscalationIds(questionStore, blockageStore),
    ownBlockWorkItemIds(journalStore, overview.project.id),
  );

  return {
    ...overview,
    project: {
      ...overview.project,
      projectLeadSlug: overview.project.projectLeadAgentId
        ? slugById.get(overview.project.projectLeadAgentId) ?? null
        : null,
    },
    workItems: withComplexity(
      withAssigneeSlugs(rolled, slugById),
      overview.project.planGranularity,
    ),
  };
}

export function getEnrichedProjectOverview(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  idOrSlug: string,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
) {
  const overview = getProjectOverview(store, pmStore, idOrSlug);
  if (!overview) return undefined;
  return enrichProjectOverview(overview, agentStore, store, questionStore, blockageStore, journalStore);
}

export interface WorkItemChildSummary {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
}

export interface WorkItemTaskOption {
  id: string;
  title: string;
  parentId: string | null;
}

export interface WorkItemDetail {
  item: EnrichedWorkItem & {
    routingReason?: string;
    acceptanceCriteria: string[];
    dependsOn: string[];
  };
  project: { id: string; slug: string; name: string; planGranularity?: PlanGranularity };
  parent?: { id: string; title: string };
  children: WorkItemChildSummary[];
  projectTasks: WorkItemTaskOption[];
  /**
   * The evidence a done item's own jobs left, read from the job's durable record.
   *
   * Suite [16](../../../../../docs/eval/16-operator-ui.md) journey 7 asks the operator to *"open a done item and
   * see the evidence that justifies it, including which check produced it"*, and the oracle adds that *"at least
   * one evidence record names the criterion it covers"*. Measured 2026-11-04: no UI surface rendered any of it —
   * the work-item panel showed the acceptance criteria as a list of strings and the Job tab rendered the job's
   * raw `output` JSON, so an operator could read a green leaf and could not read what made it green. The store
   * has held `job.evidence_recorded` since BOARD F-077 and `GET /api/v1/jobs/:jobId/evidence` has exposed it
   * since then; what was missing was the read beside the item, which is this field (BOARD F-133).
   *
   * The criteria carry their ids (`ac-1`, `ac-2`, …) because that is the axis the evidence is keyed on and the
   * axis every clearing surface takes (`kampaku projects closure <id> --criterion ac-N`). Reporting an evidence
   * record with no criterion beside it would leave the operator matching prose to strings.
   */
  evidence: WorkItemEvidence;
}

/** The criteria of one item, and the durable evidence that does or does not justify each. */
export interface WorkItemEvidence {
  criteria: Array<{
    id: string;
    text: string;
    /**
     * The records this criterion is evidenced by, each saying how it got here.
     *
     * `recorded` — the job named this criterion. `matched` — the job named the check or artifact it observed and
     * Core keyed it to this criterion the same way the closure gate does (`keyEvidenceToCriteria`, BOARD F-105).
     * The distinction is rendered because the two are not the same claim: one is the producer's assertion, the
     * other is the platform's reading. Presenting a derived link as the job's own would be exactly the defect this
     * board keeps recording — a surface more confident than its evidence.
     */
    records: Array<{
      jobId: string;
      kind: string;
      subject: string;
      passed: boolean;
      observedAt: string;
      sourceTool?: string;
      attribution: "recorded" | "matched";
    }>;
  }>;
  /** Records nothing keyed to a criterion of this item. Kept rather than dropped: an unkeyed record is a finding. */
  unkeyed: Array<{
    jobId: string;
    kind: string;
    subject: string;
    passed: boolean;
    observedAt: string;
    sourceTool?: string;
  }>;
  /** The jobs dispatched for this item, with what each reported: checks by name, and the files it wrote. */
  jobs: Array<{
    id: string;
    status: string;
    checks: Array<{ name: string; passed: boolean }>;
    filesChanged: string[];
    finishedAt: string | null;
  }>;
}

export function getWorkItemDetail(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  workItemId: string,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
): WorkItemDetail | undefined {
  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem) return undefined;

  const project = store.getProject(workItem.projectId);
  if (!project) return undefined;

  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const allItems = pmStore.listWorkItemsByProject(workItem.projectId);
  const rolledTree = withComplexity(
    withAssigneeSlugs(
      rollupWorkItemTreeWithExecution(
        pmStore.buildWorkItemTree(allItems),
        store,
        pendingEscalationIds(questionStore, blockageStore),
        ownBlockWorkItemIds(journalStore, workItem.projectId),
      ),
      slugById,
    ),
    project.planGranularity,
  );
  const node = findWorkItemNode(rolledTree, workItemId);
  if (!node) return undefined;

  const parent = workItem.parentId ? findWorkItemNode(rolledTree, workItem.parentId) : undefined;

  const children = node.children
    .map((child) => ({
      id: child.item.id,
      title: child.item.title,
      status: child.item.status,
      sortOrder: child.item.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    item: {
      ...node.item,
      routingReason: workItem.routingReason,
      acceptanceCriteria: workItem.acceptanceCriteria,
      dependsOn: workItem.dependsOn,
      complexity: node.item.complexity,
    },
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      planGranularity: project.planGranularity,
    },
    parent: parent ? { id: parent.item.id, title: parent.item.title } : undefined,
    children,
    projectTasks: allItems.map((i) => ({
      id: i.id,
      title: i.title,
      parentId: i.parentId ?? null,
    })),
    evidence: workItemEvidence(store, workItem),
  };
}

/**
 * The evidence of one item, keyed by the criterion id the plan wrote it under.
 *
 * The jobs are enumerated from the job store and attributed through the job's **own** input
 * (`input.context.workItemId`, written at dispatch — the same link `GET /api/v1/jobs` and the ledger read),
 * never through `work_items.job_id`, which is cleared when a job settles: an item that paused on a gate, or was
 * re-dispatched, would otherwise report no evidence at all exactly when the operator is asking.
 */
function workItemEvidence(store: Store, workItem: WorkItemRecord): WorkItemEvidence {
  const itemsCriterionIds = identifyAcceptanceCriteria(workItem.acceptanceCriteria);
  const byCriterion = new Map<string, WorkItemEvidence["criteria"][number]["records"]>(
    itemsCriterionIds.map((criterion) => [criterion.id, []]),
  );
  const unkeyed: WorkItemEvidence["unkeyed"] = [];
  const jobs: WorkItemEvidence["jobs"] = [];

  for (const job of store.listJobs()) {
    const context = (job.input?.context ?? {}) as { workItemId?: unknown };
    const attributed =
      context.workItemId === workItem.id || job.id === workItem.jobId;
    if (!attributed) continue;

    const result = store.getJobResult(job.id);
    const output = (result?.output ?? {}) as Record<string, unknown>;
    const checkResults =
      output.checkResults && typeof output.checkResults === "object"
        ? (output.checkResults as Record<string, unknown>)
        : {};
    const filesChanged = Array.isArray(output.filesChanged)
      ? output.filesChanged.filter((entry): entry is string => typeof entry === "string")
      : [];

    jobs.push({
      id: job.id,
      status: job.status,
      checks: Object.entries(checkResults).map(([name, passed]) => ({ name, passed: passed === true })),
      filesChanged,
      finishedAt: result?.finishedAt ?? null,
    });

    const records = store.listJobEvidence(job.id);
    // Keyed the way the closure gate keys it, so the panel and the gate cannot disagree about which criterion a
    // record evidences. The producer's own link is kept where it exists; a link Core derived is marked as such.
    const keyed = keyEvidenceToCriteria(
      itemsCriterionIds,
      records.map((record) => ({
        criterionId: record.criterionId,
        subject: record.subject,
        passed: record.passed,
        observedAt: record.observedAt,
        sourceTool: record.sourceTool,
      })),
    );

    records.forEach((record, index) => {
      const entry = {
        jobId: record.jobId,
        kind: record.kind,
        subject: record.subject,
        passed: record.passed,
        observedAt: record.observedAt,
        sourceTool: record.sourceTool,
      };
      const attributed = keyed[index];
      const ids = [
        ...(attributed?.criterionId ? [attributed.criterionId] : []),
        ...(attributed?.criterionIds ?? []),
      ];
      const buckets = ids
        .map((id) => byCriterion.get(id))
        .filter((bucket): bucket is WorkItemEvidence["criteria"][number]["records"] => Boolean(bucket));
      if (buckets.length === 0) {
        unkeyed.push(entry);
        return;
      }
      for (const bucket of buckets) {
        bucket.push({ ...entry, attribution: record.criterionId ? "recorded" : "matched" });
      }
    });
  }

  return {
    criteria: itemsCriterionIds.map((criterion) => ({
      id: criterion.id,
      text: criterion.text,
      records: byCriterion.get(criterion.id) ?? [],
    })),
    unkeyed,
    jobs,
  };
}

export interface AgentDashboardWorkItem {
  id: string;
  title: string;
  status: string;
  projectSlug: string;
  projectName: string;
  assigneeSlug: string;
  routingReason?: string;
}

export interface AgentDashboard {
  agentSlug: string;
  agentName: string;
  includeSubordinates: boolean;
  byStatus: Record<string, AgentDashboardWorkItem[]>;
  total: number;
}

export function getAgentDashboard(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  slugOrId: string,
  includeSubordinates = true,
): AgentDashboard | undefined {
  const agent = agentStore.getAgentBySlugOrId(slugOrId);
  if (!agent) return undefined;

  const agentIds = includeSubordinates
    ? agentStore.getAgentIdsWithSubordinates(agent.id)
    : [agent.id];

  const slugById = new Map(
    agentStore.listAllAgents().map((a) => [a.id, a.slug]),
  );

  const items = pmStore.listWorkItemsForAgents(agentIds);
  const byStatus: Record<string, AgentDashboardWorkItem[]> = {};

  for (const item of items) {
    const project = store.getProject(item.projectId);
    if (!project) continue;

    const entry: AgentDashboardWorkItem = {
      id: item.id,
      title: item.title,
      status: item.status,
      projectSlug: project.slug,
      projectName: project.name,
      assigneeSlug: item.assigneeAgentId
        ? (slugById.get(item.assigneeAgentId) ?? "unknown")
        : "unassigned",
      routingReason: item.routingReason,
    };

    const bucket = byStatus[item.status] ?? [];
    bucket.push(entry);
    byStatus[item.status] = bucket;
  }

  return {
    agentSlug: agent.slug,
    agentName: agent.name,
    includeSubordinates,
    byStatus,
    total: items.length,
  };
}

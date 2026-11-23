import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import {
  assessWorkItemBudget,
  impliedDeliverablePaths,
  impliedRequiredChecks,
  LEAF_CHECK_BUDGET_MAX,
  LEAF_FILE_BUDGET_MAX,
  type WorkItemBudgetAssessment,
} from "../../delegator/plan-validation.js";
import { resolveDeclaredCheckCommands, type DeclaredCheckCommand } from "./declared-checks.js";
import { requiredPassingChecksFor } from "./leaf-checks.js";

export const LEAF_SPLIT_ROUTING_PREFIX = "leaf_split:";
/**
 * What the **slices** a split writes say, which is a different spelling from the split item's own.
 *
 * `ensureLeafSplitWorkItem` writes `leaf_split:<the leaf that was overweight>` on the item that *represents*
 * the split, and `applyDeterministicLeafSplit` writes `split_of:<the same leaf>` on each slice beneath it.
 * Two spellings, one kind — and `isLeafSplitWorkItem` knew only the first, so the slices it is precisely the
 * job of to clear what their parent is blocked on were not recognised as split work at all. Measured
 * 2026-10-02 on run `s08r10`'s own data dir: `POST /work-items/a2401119/execute` — `split_of:b7421984`,
 * blocked, nothing of its own refused it — was refused by its container, while the escape hatch the product
 * documents names this kind (BOARD F-089).
 */
export const LEAF_SLICE_ROUTING_PREFIX = "split_of:";

export function buildLeafSplitRoutingReason(workItemId: string): string {
  return `${LEAF_SPLIT_ROUTING_PREFIX}${workItemId}`;
}

export function parseLeafSplitRoutingReason(routingReason?: string): { workItemId: string } | null {
  if (!routingReason?.startsWith(LEAF_SPLIT_ROUTING_PREFIX)) return null;
  const workItemId = routingReason.slice(LEAF_SPLIT_ROUTING_PREFIX.length).trim();
  return workItemId ? { workItemId } : null;
}

/**
 * Whether this item is split work: the item that represents a split, or a slice that split wrote.
 *
 * The identity parser stays the split item's own (`ensureLeafSplitWorkItem` looks the split up by it), so the
 * two readings are kept apart where they differ and joined where the gate asks the question — is this item
 * something a split produced, and so something a blocked container must not forbid.
 */
export function isLeafSplitWorkItem(item: WorkItemRecord): boolean {
  return (
    parseLeafSplitRoutingReason(item.routingReason) !== null ||
    item.routingReason?.startsWith(LEAF_SLICE_ROUTING_PREFIX) === true
  );
}

/**
 * Why this leaf is overweight, in the one vocabulary the planner also reads.
 *
 * The rule lives in `assessWorkItemBudget`, in `delegator/plan-validation.ts`, and it is deliberately **not**
 * "the blob names more than three paths": measured 2026-10-01 on suite 08's re-run (run `s08r8`, BOARD F-086),
 * leaf `e811808c` grew past the budget because its acceptance criteria named four files — one of them a module
 * the criterion cites in order to forbid duplicating it — while the leaf's own scope named three. A criterion
 * that **mentions** a path is evidence, not work, and the text a previous split **wrote** is not this item's
 * scope either.
 */
export function overweightLeafAssessment(item: WorkItemRecord): WorkItemBudgetAssessment {
  return assessWorkItemBudget({
    title: item.title,
    description: item.description,
    acceptanceCriteria: item.acceptanceCriteria,
  });
}

export function isOverweightLeaf(item: WorkItemRecord): boolean {
  return overweightLeafAssessment(item).overweight;
}

function resolveLeadAgentId(store: Store, agentStore: AgentStore, projectId: string): string | undefined {
  const project = store.getProject(projectId);
  if (project?.projectLeadAgentId) return project.projectLeadAgentId;
  if (project?.slug) {
    const lead = agentStore.getAgentBySlugOrId(`${project.slug}-lead`);
    if (lead) return lead.id;
  }
  return agentStore.getKampakuAgent()?.id;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/**
 * The checkout the project is linked to, when it is a local directory this process can read.
 *
 * Read for one purpose: writing a criterion that names a command **this** checkout declares. A repository link
 * that is not a `file://` path, or a path that is not a directory, yields nothing, and the split then leaves
 * the leaf's own criteria in place rather than inventing a toolchain.
 */
export function linkedCheckoutPath(store: Store, projectId: string): string | undefined {
  const url = store.getProject(projectId)?.repositories[0]?.url;
  if (!url?.startsWith("file://")) return undefined;
  try {
    const path = fileURLToPath(url);
    return existsSync(path) && statSync(path).isDirectory() ? path : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The criterion a child is handed for a check the checkout declares.
 *
 * The sentence names the **command**, not the check name, because that is the shape both readers recognise:
 * `inferRequiredCheckScripts` routes a criterion naming `make check` to the `test` check, and the worker
 * resolves `test` against the same checkout. The declaration is carried in the parenthesis so a reader can
 * see why this command and not another — the platform's own "evidence or nothing" rule.
 */
function checkCriterion(check: DeclaredCheckCommand): string {
  return `${check.command} exits 0 (declared by ${check.evidence}).`;
}

/** A path a criterion may name: it exists, or the directory it would be created in does. */
function pathCanExist(checkoutPath: string | undefined, path: string): boolean {
  if (!checkoutPath) return true;
  try {
    if (existsSync(join(checkoutPath, path))) return true;
    return existsSync(dirname(join(checkoutPath, path)));
  } catch {
    return false;
  }
}

/** Criteria that require a check, verbatim from the leaf — used when the checkout declares no check at all. */
function leafCheckCriteria(criteria: string[]): string[] {
  return criteria.filter((criterion) => impliedRequiredChecks(criterion).length > 0);
}

/**
 * Keeps at most `LEAF_CHECK_BUDGET_MAX` distinct checks across a child's criteria.
 *
 * A child that comes out of the splitter overweight is a splitter that feeds itself: each pass writes
 * criteria in its own words, the next pass reads them as work, and a Python leaf ends up with grandchildren
 * requiring `package.js`. So the criteria this function assembles are checked against the same budget that
 * sent the parent here, and a criterion that would add a third check is dropped rather than carried.
 */
function withinCheckBudget(criteria: string[], max = LEAF_CHECK_BUDGET_MAX): string[] {
  const seen = new Set<string>();
  const checks = new Set<string>();
  const kept: string[] = [];
  for (const criterion of criteria) {
    if (seen.has(criterion)) continue;
    const required = impliedRequiredChecks(criterion);
    const merged = new Set([...checks, ...required]);
    if (merged.size > max) continue;
    seen.add(criterion);
    for (const name of merged) checks.add(name);
    kept.push(criterion);
  }
  return kept;
}

/**
 * Splits an overweight leaf into children whose acceptance criteria a **tool in this repository** can decide.
 *
 * The three defects this replaces, all measured on run `s08r8` (BOARD F-086) and all in the block it replaces:
 *
 * 1. The criteria came from a hardcoded npm template, so a Python checkout's children required
 *    `npm test succeeds when package.json defines a test script` — a command that checkout cannot run.
 * 2. The template's own sentence matched the npm detector, so the child was overweight in turn and a second
 *    pass wrote `npm run test succeeds`: the splitter fed itself.
 * 3. An unordered extension alternation parsed `package.json` as `package.js`, and the child was given
 *    `file exists at package.js`.
 *
 * What it does now: the file budget is read from the leaf's own scope, the check criteria are read from the
 * **checkout the project is linked to** (never from a template, and never from a sentence a previous split
 * wrote), a child never receives fewer decidable criteria than its parent had, and a path is only named in a
 * criterion when it can exist in that checkout.
 */
export function applyDeterministicLeafSplit(
  pmStore: PmStore,
  store: Store,
  original: WorkItemRecord,
): WorkItemRecord[] {
  const scopePaths = impliedDeliverablePaths(original);
  const criteria = original.acceptanceCriteria ?? [];
  const checkoutPath = linkedCheckoutPath(store, original.projectId);
  const declaredChecks = resolveDeclaredCheckCommands(checkoutPath);
  const inheritedChecks = leafCheckCriteria(criteria);
  const now = new Date().toISOString();
  const created: WorkItemRecord[] = [];

  const fileGroups = scopePaths.length > 0 ? chunk(scopePaths, LEAF_FILE_BUDGET_MAX) : [];
  // The check names a child is handed: what the leaf's own criteria require, and where the leaf's criteria
  // require nothing the checkout's own primary check — never a name this repository cannot resolve. A leaf
  // that is over budget on checks and not on files is cut by check instead of by file, which is the only
  // honest way to make a four-check leaf into two-check children.
  // **A slice is never handed a gate its siblings exist to satisfy.**
  //
  // Measured 2026-11-08 on suite 19 run `s19r9`. The plan's first repair leaf carried `./run-tests.sh exits 0` — the
  // whole legacy suite, of which one check is this leaf's own defect and the other is its sibling's. The leaf went
  // over budget and was split, every slice inherited the aggregate, and each slice was then asked to make the whole
  // suite green while the sibling's defect was still in the file. No slice could close, so neither could the leaves
  // above them, and the only way out was an operator merging the two repairs by hand — twice.
  //
  // The aggregate keeps exactly one owner: the leaf whose only check it is, which is the plan's verification leaf.
  // A leaf that quotes a check its runner enumerates hands its slices that member; `requiredPassingChecksFor` is the
  // same reading the dispatch and the closure gate use, so a slice cannot be judged by one rule and dispatched by
  // another. A leaf with one check and no member keeps it, so nothing else changes shape.
  const requiredNames = requiredPassingChecksFor(
    { title: original.title, description: original.description, acceptanceCriteria: criteria },
    checkoutPath,
  );
  const checkNames = requiredNames.length > 0 ? requiredNames : declaredChecks.slice(0, 1).map((check) => check.name);
  const criterionForCheck = (name: string): string | undefined => {
    const declared = declaredChecks.find((check) => check.name === name);
    if (declared) return checkCriterion(declared);
    // The checkout declares no command for this name; the leaf's own words are what the runner's vocabulary
    // already recognises, so they are kept verbatim rather than replaced by a sentence nothing can decide.
    return inheritedChecks.find((criterion) => impliedRequiredChecks(criterion).includes(name));
  };
  const resolvedCriteria = checkNames
    .map((name) => ({ name, criterion: criterionForCheck(name) }))
    .filter((entry): entry is { name: string; criterion: string } => Boolean(entry.criterion));
  const checkGroups =
    resolvedCriteria.length > LEAF_CHECK_BUDGET_MAX
      ? chunk(resolvedCriteria, LEAF_CHECK_BUDGET_MAX).map((group) => group.map((entry) => entry.criterion))
      : [resolvedCriteria.map((entry) => entry.criterion)];
  const parts = Math.max(fileGroups.length, checkGroups.length);

  for (let index = 0; index < parts; index += 1) {
    const slicePaths = (fileGroups[index] ?? []).filter((path) => pathCanExist(checkoutPath, path));
    const checkCriteria = checkGroups[index] ?? checkGroups[0] ?? [];
    const title = `${original.title} — slice ${index + 1}`;
    const description = [
      `Split from overweight leaf "${original.title}" (${overweightLeafAssessment(original).reason || "over budget"}).`,
      slicePaths.length > 0
        ? `Touch only: ${slicePaths.join(", ")}. Do not edit sibling slice files.`
        : "Keep this slice to one concern and at most three files.",
      // The check commands are named in the acceptance criteria, never in this sentence: a description that
      // enumerates them re-quotes every member to the next reading, which is how the splitter fed itself on
      // `s08r8` in its npm shape — and on `s19r9` it made a verification leaf's slices look as if they had quoted
      // a member, which would have narrowed the one leaf whose whole job is the aggregate.
      declaredChecks.length > 0
        ? "The checks this slice must pass are the ones its acceptance criteria name."
        : "This repository declares no check the platform can name; run whatever check it documents.",
      "Follow repository conventions. Record command stdout in the completion report before closure.",
    ].join(" ");
    // The leaf's own criteria are kept where they belong to this slice — the one that names this slice's
    // paths — so a slice keeps the specificity its planner wrote, and nothing a tool could decide is dropped
    // in favour of a sentence no tool can decide.
    const sliceOwnCriteria = criteria.filter((criterion) => {
      const names = impliedDeliverablePaths({ title: criterion, description: "" });
      return names.some((path) => slicePaths.includes(path));
    });
    const acceptanceCriteria = withinCheckBudget([
      ...checkCriteria,
      ...(slicePaths.length > 0 ? [`file exists at ${slicePaths[0]}`] : []),
      ...sliceOwnCriteria,
      // Last resort only: a leaf whose checks the checkout does not declare keeps its own check criteria
      // rather than losing them to a template.
      ...(declaredChecks.length === 0 ? inheritedChecks : []),
    ]);

    created.push(
      pmStore.createWorkItem({
        id: uuidv4(),
        projectId: original.projectId,
        parentId: original.id,
        title,
        description,
        status: "todo",
        priority: original.priority,
        sortOrder: index,
        assigneeAgentId: original.assigneeAgentId,
        assignedByAgentId: original.assignedByAgentId,
        acceptanceCriteria,
        // The freeze belongs to the work, not to the split: a parent that must not touch a file does not license
        // its slices to touch it. Inherited rather than re-derived, because a slice's description is written by
        // the splitter and no longer contains the parent's sentence.
        frozenPaths: original.frozenPaths,
        dependsOn: [],
        routingReason: `split_of:${original.id}`,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  return created;
}

export function ensureLeafSplitWorkItem(
  pmStore: PmStore,
  agentStore: AgentStore,
  store: Store,
  overweight: WorkItemRecord,
): WorkItemRecord {
  // The budget is checked here and not only at the call site: a caller that reaches this function with an item
  // the budget does not call overweight used to get a split item plus a one-child "split" anyway, which is how
  // the tree grew nodes nobody asked for on run `s08r8` (BOARD F-086).
  if (!isOverweightLeaf(overweight)) return overweight;

  const existing = pmStore
    .listWorkItemsByProject(overweight.projectId)
    .find((item) => parseLeafSplitRoutingReason(item.routingReason)?.workItemId === overweight.id);
  if (existing) return existing;

  const children = pmStore
    .listWorkItemsByProject(overweight.projectId)
    .filter((item) => item.parentId === overweight.id);
  if (children.length > 0) return overweight;

  const leadId = resolveLeadAgentId(store, agentStore, overweight.projectId);
  const now = new Date().toISOString();
  const splitItem = pmStore.createWorkItem({
    id: uuidv4(),
    projectId: overweight.projectId,
    parentId: overweight.parentId,
    frozenPaths: overweight.frozenPaths,
    title: `Split overweight task — ${overweight.title}`,
    description: [
      `The leaf "${overweight.title}" is over budget: ${overweightLeafAssessment(overweight).reason}.`,
      `Its children's acceptance criteria are the checks this project's own checkout declares, plus the`,
      `leaf's criteria that belong to each slice.`,
    ].join(" "),
    status: "todo",
    priority: 100,
    sortOrder: Math.min(overweight.sortOrder, 0) - 1,
    assigneeAgentId: leadId,
    acceptanceCriteria: [
      "Overweight leaf is converted into child micro-tasks with verifiable AC",
    ],
    dependsOn: [],
    routingReason: buildLeafSplitRoutingReason(overweight.id),
    createdAt: now,
    updatedAt: now,
  });

  applyDeterministicLeafSplit(pmStore, store, overweight);
  pmStore.updateWorkItem(splitItem.id, { status: "done" });
  return splitItem;
}

export function findNextLeafSplitWorkItem(pmStore: PmStore, projectId: string): WorkItemRecord | null {
  const pending = pmStore
    .listWorkItemsByProject(projectId)
    .filter((item) => isLeafSplitWorkItem(item) && item.status === "todo")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return pending[0] ?? null;
}

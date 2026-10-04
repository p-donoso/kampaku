import { isContainerPlannedItem, type PlannedProject, type PlannedWorkItem } from "./types.js";
import {
  complexityBudget,
  type PlanGranularity,
} from "./plan-granularity.js";
import { validateVerticalSlicePlan } from "./vertical-slice.js";
import { inferRequiredCheckScripts } from "../application/pm/work-item-checks.js";

export const VERIFIABLE_AC_PATTERN =
  /\bnpm (test|run)\b|\b(file|document|artifact|dataset|image|audio|video) exists\b|\bpytest\b|\bcargo test\b|\bgo test\b|\b(run|execute|invoke)\b.{0,80}\b(check|command|script|test)\b|\b(endpoint|route|URL|API)\b.{0,100}\b(return|respond|status|behave|reachable)\b|\b(UI|screen|page|form|workflow)\b.{0,100}\b(open|render|display|navigate|submit|complete|work)\b|\b(published|exported|recorded|transcribed|plays back|persists|saved)\b|\.(ts|tsx|js|mjs|py|go|rs|md|yaml|yml|json|csv|pdf|png|jpg|jpeg|wav|mp3|mp4)\b/i;

/**
 * A file path as a plan or a criterion writes one.
 *
 * Both halves of this pattern are load-bearing, and both were measured wrong on suite 08's re-run (run
 * `s08r8`, BOARD F-086). The extension alternation was unordered and unbounded, so `package.json` parsed as
 * `package.js` — `js` is tried before `json`, won the alternation, and left `on` outside the match. The leaf
 * splitter then wrote `file exists at package.js` as a child's acceptance criterion: a criterion demanding a
 * file that nothing in the repository names. So the longer extension must be tried first (`json` before
 * `js`, `tsx` before `ts`), and the lookahead is what keeps a short extension from matching the prefix of a
 * longer one at all.
 */
const FILE_PATH_PATTERN =
  /(?:[\w@./-]+\/)*[\w.-]+\.(?:tsx|mjs|cjs|jsx|json|ya?ml|css|svg|ts|js|py|go|rs|md)(?![\w])/gi;

/**
 * npm script names named by text, kept for the planners' own budget heuristic
 * ({@link ../delegator/work-item-complexity.ts}). The overweight rule below deliberately does **not** read
 * this list: a budget a non-Node repository cannot satisfy is not a budget, and `npm` names are not a
 * property of a work item (BOARD F-003 § the vocabulary has to be one vocabulary).
 */
const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  { pattern: /\bnpm run test:e2e\b/i, script: "test:e2e" },
  { pattern: /\bnpm run build\b/i, script: "build" },
  { pattern: /\bnpm run typecheck\b/i, script: "typecheck" },
  { pattern: /\bnpm run test(?!:)/i, script: "test" },
  { pattern: /\bnpm test\b/i, script: "test" },
];

/**
 * How many distinct files a leaf may be expected to produce, and how many checks its criteria may require.
 *
 * The two budgets are the whole definition of "overweight": they are read by the plan validator that flags a
 * leaf, by the recursive planner that expands one, and by `application/pm/leaf-splitter.ts` that splits one
 * before a job starts. Three readers, one rule — two rules is how a plan passes validation and is still
 * split at execution time.
 */
export const LEAF_FILE_BUDGET_MAX = 3;
export const LEAF_CHECK_BUDGET_MAX = 2;

export interface WorkItemBudgetAssessment {
  /** Paths the item's own scope statement (title + description) names. */
  files: string[];
  /** Checks the item's acceptance criteria require, in the runner's neutral vocabulary. */
  checks: string[];
  overweight: boolean;
  /** Why it is overweight, in words a reader of the split item can act on. Empty when it is not. */
  reason: string;
}

/**
 * Paths a work item's **own scope statement** names: its title and description.
 *
 * Acceptance criteria are evidence prose, not scope. A criterion cites the files it proves something about —
 * the pre-existing test it has to keep green, the module it may not duplicate, the file it explicitly says
 * **not** to touch — and counting those as work is how a leaf that changes two files reads as "overweight".
 * Measured 2026-09-30 taking suite 08's re-run (run `s08r8`, BOARD F-086): leaf `e811808c`'s five planner-written
 * criteria named four paths, one of them named precisely because the criterion says not to duplicate it, and
 * that count alone sent the leaf through `applyDeterministicLeafSplit`. The file budget is read from what the
 * item says it will **produce**, never from the criteria that will prove it.
 */
export function impliedDeliverablePaths(input: { title: string; description?: string }): string[] {
  return extractImpliedFilePaths([input.title, input.description ?? ""].join("\n"));
}

/**
 * The repository's own checks a block of text requires, in the vocabulary the runner resolves.
 *
 * Delegates to `application/pm/work-item-checks.ts` — the same list the closure gate and the worker read —
 * so `make check`, `pytest`, `cargo test` and `npm test` all count as one `test` requirement, and text a
 * splitter wrote in another repository's vocabulary counts as whatever it names. That last part is the
 * measured self-amplification of BOARD F-086: the splitter's own npm sentence re-triggered the npm detector
 * and made its child overweight in turn.
 */
export function impliedRequiredChecks(text: string): string[] {
  return inferRequiredCheckScripts(text);
}

/**
 * Why an item is overweight, or that it is not. One rule, read by the planner and the executor alike.
 */
export function assessWorkItemBudget(input: {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
}): WorkItemBudgetAssessment {
  const files = impliedDeliverablePaths(input);
  const checks = impliedRequiredChecks((input.acceptanceCriteria ?? []).join("\n"));
  const reasons: string[] = [];
  // The reason names no path on purpose. It is written into the split item a reader sees and into the
  // children's descriptions, and a description that lists four paths is itself over the file budget — the
  // splitter would then hand its own children a reason to be split again, which is the self-amplification
  // measured on run `s08r8` in its npm shape. Callers that want the list have `files`.
  if (files.length > LEAF_FILE_BUDGET_MAX) {
    reasons.push(`names ${files.length} file paths in its scope (max ${LEAF_FILE_BUDGET_MAX})`);
  }
  if (checks.length > LEAF_CHECK_BUDGET_MAX) {
    reasons.push(
      `requires ${checks.length} checks in its acceptance criteria (max ${LEAF_CHECK_BUDGET_MAX}): ${checks.join(", ")}`,
    );
  }
  return {
    files,
    checks,
    overweight: reasons.length > 0,
    reason: reasons.join("; "),
  };
}

export interface PlanValidationIssue {
  code:
    | "too_few_leaves"
    | "thin_description"
    | "missing_verifiable_ac"
    | "overweight_files"
    | "overweight_scripts"
    | "too_few_leaves_in_phase"
    | "invalid_vertical_slice"
    | "undefined_requirement_reference";
  message: string;
  title?: string;
}

/**
 * A requirement identifier, as a plan cites it: `R1`, `R12`, and the range forms `R1-R5` / `R1–R5`.
 *
 * The boundary classes are load-bearing. Without them `R1` matches inside `JSON1` and `ORDER1`, and a rule
 * that fires on unrelated text is a rule the repair pass will be sent chasing for no reason.
 */
const REQUIREMENT_ID_PATTERN = /(?<![A-Za-z0-9_])(R\d{1,3})(?![A-Za-z0-9_])/gi;
const REQUIREMENT_RANGE_PATTERN = /(?<![A-Za-z0-9_])R(\d{1,3})\s*[–—-]\s*R?(\d{1,3})(?![A-Za-z0-9_])/gi;

/**
 * Requirement identifiers a plan can actually be checked against.
 *
 * Taken from the plan's own vertical slices, which are the only place a plan declares `requirement_ids`.
 * Deliberately **not** taken from prose: a criterion saying *"requirements live in the phase description"* is
 * the defect, not the definition.
 */
export function declaredRequirementIds(plan: PlannedProject): Set<string> {
  const declared = new Set<string>();
  for (const slice of plan.vertical_slices ?? []) {
    for (const id of slice.requirement_ids ?? []) declared.add(id.trim().toLowerCase());
  }
  return new Set([...declared].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
}

/**
 * Requirement identifiers a block of text names, ranges expanded.
 *
 * Measured 2026-09-29 by suite 07 run 19, which is why this exists: the phase container's third acceptance
 * criterion read *"Requirement statements R1-R5 are each covered by at least one leaf acceptance criterion, with
 * no requirement left unowned"* and **`R1`–`R5` appeared nowhere else in the project** — not in a document, not
 * in a work item, not in the journal. So the phase gate the plan wrote for itself could be neither satisfied
 * nor falsified, and the front office raised it as a required question without being asked to (BOARD F-071).
 * A criterion that names something the phase must cover has to name something that exists.
 */
export function referencedRequirementIds(text: string): string[] {
  const referenced = new Set<string>();
  for (const match of text.matchAll(REQUIREMENT_ID_PATTERN)) {
    referenced.add(match[1]!.toLowerCase());
  }
  for (const match of text.matchAll(REQUIREMENT_RANGE_PATTERN)) {
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const [low, high] = from <= to ? [from, to] : [to, from];
    // A range wider than 200 identifiers is not a requirement list, and expanding one would produce a finding
    // the reader cannot act on. The literal endpoints are still reported.
    if (high - low > 200) {
      referenced.add(`r${from}`);
      referenced.add(`r${to}`);
      continue;
    }
    for (let n = low; n <= high; n += 1) referenced.add(`r${n}`);
  }
  // Ordered by number, not by the order the two passes happened to find them: this list is printed into a
  // finding a model is asked to act on, and `R1, R3, R2` reads as a defect in the report rather than in the plan.
  return [...referenced].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export interface PlanValidationResult {
  ok: boolean;
  issues: PlanValidationIssue[];
  leafCount: number;
  minTotalLeaves: number;
  sliceIssues: string[];
}

/**
 * Clauses that name a path in order to **forbid** it.
 *
 * A path in a title or a description is not automatically a deliverable. A plan freezes files as often as it
 * creates them — *"No change to `words.py` semantics or `WORD_RE`"*, *"`tests/test_words.py` is the existing
 * contract and must stay green unmodified"*, *"Do not edit `pyproject.toml` here"* — and a prohibition read as
 * a deliverable list inverts the constraint it states.
 *
 * Measured 2026-10-04 on suite 08's fourth re-run (`s08r11`, BOARD F-099). A leaf's description carried the
 * plan's freeze, and the splitter derived the slice's **touch scope** from it: the child was created with
 * *"a declared touch scope of `src/textstats/words.py, tests/test_words.py, src/textstats/stats.py`"* — the
 * first two being precisely the two files the parent said must not be modified. The job that ran on that child
 * added `rank_words()` back into the frozen `words.py`, `make check` went green, and the platform reported
 * success. The same extraction is what the file budget is counted from, so a leaf that says *do not touch* more
 * than three files was also **split for being too large**, which it is not: it names nothing to write.
 *
 * A clause, not a whole text: `Touch only: a.py, b.py. Do not edit c.py.` must yield `a.py, b.py`.
 *
 * The vocabulary is deliberately narrow and deliberately **not** a list of imperative verbs. It names only
 * words that state a prohibition, because the two errors are not equally bad: failing to notice a prohibition
 * leaves today's behaviour (the path is counted, as it would be without this rule), while noticing one that is
 * not there **drops a deliverable** from a scope and from a budget. So `keep` and `without` are out — they
 * appear in ordinary positive sentences (`Create src/a.py and keep make lint green without new files`) — and an
 * unrecognised phrasing fails **open**, keeping the path.
 *
 * Clause splitting is by sentence, which is the granularity plans actually write these in: every freeze
 * measured on the run above is its own sentence.
 */
const PROHIBITION_CLAUSE_PATTERN =
  /\b(?:do not|don't|does not|must not|mustn't|never|no (?:change|new|other)|avoid|leave|forbid|prohibit|frozen|untouched|unmodified|unchanged|read-only|readonly|not to)\b/i;

/**
 * The paths a block of text asks for, with the ones it forbids removed.
 *
 * @param text - Title and description, or any plan text a deliverable list is derived from.
 * @returns Distinct repo-relative paths, in first-seen order.
 */
export function extractImpliedFilePaths(text: string): string[] {
  const permitted = text
    .split(/(?<=\.)\s+|\n+/)
    .filter((clause) => !PROHIBITION_CLAUSE_PATTERN.test(clause))
    .join("\n");
  const matches = permitted.match(FILE_PATH_PATTERN) ?? [];
  return [...new Set(matches.map((path) => path.replace(/^\.\//, "")))];
}

export function extractImpliedNpmScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

export function hasVerifiableAcceptanceCriterion(criteria: string[] | undefined): boolean {
  return (criteria ?? []).some((criterion) => VERIFIABLE_AC_PATTERN.test(criterion));
}

export function plannedLeaves(items: PlannedWorkItem[]): PlannedWorkItem[] {
  return items.filter((item) => !isContainerPlannedItem(item, items));
}

export function plannedPhaseContainers(items: PlannedWorkItem[]): PlannedWorkItem[] {
  const roots = items.filter((item) => !item.parent_ref);
  const withChildren = roots.filter((item) => isContainerPlannedItem(item, items));
  return withChildren.length > 0 ? withChildren : roots;
}

/** Count leaf tasks anywhere under a container (direct and nested). */
export function countLeavesUnderPhase(
  phase: PlannedWorkItem,
  items: PlannedWorkItem[],
): number {
  if (!isContainerPlannedItem(phase, items)) return 1;
  const phaseKey = phase.title.toLowerCase();
  let total = 0;
  for (const child of items) {
    if (child.parent_ref?.toLowerCase() !== phaseKey) continue;
    if (isContainerPlannedItem(child, items)) {
      total += countLeavesUnderPhase(child, items);
    } else {
      total += 1;
    }
  }
  return total;
}

export function isOverweightPlannedLeaf(leaf: PlannedWorkItem): boolean {
  return assessWorkItemBudget({
    title: leaf.title,
    description: leaf.description,
    acceptanceCriteria: leaf.acceptance_criteria,
  }).overweight;
}

export function validatePlan(
  plan: PlannedProject,
  input: {
    intent: string;
    granularity: PlanGranularity;
    mode?: "greenfield" | "incremental";
    requireVerticalSlices?: boolean;
  },
): PlanValidationResult {
  const items = plan.work_items;
  const leaves = plannedLeaves(items);
  const phases = plannedPhaseContainers(items);
  const budget = complexityBudget(input.intent, input.granularity, phases.length || undefined);
  const issues: PlanValidationIssue[] = [];
  const sliceIssues = plan.vertical_slices?.flatMap((slice) => validateVerticalSlicePlan([{
    id: slice.id,
    title: slice.title,
    outcome: slice.outcome,
    requirementIds: slice.requirement_ids,
    workItemIds: slice.work_item_ids,
    evidenceKinds: slice.evidence_kinds,
  }]).issues) ?? [];
  for (const message of sliceIssues) issues.push({ code: "invalid_vertical_slice", message });
  const incremental = input.mode === "incremental";
  if (input.requireVerticalSlices && (!plan.vertical_slices || plan.vertical_slices.length === 0)) {
    issues.push({ code: "invalid_vertical_slice", message: "Product plan must contain at least one vertical slice with an observable outcome." });
  }

  if (!incremental && leaves.length < budget.minTotalLeaves) {
    issues.push({
      code: "too_few_leaves",
      message: `Plan has ${leaves.length} leaf tasks; granularity ${input.granularity} requires at least ${budget.minTotalLeaves}.`,
    });
  }

  // An acceptance criterion may only cite requirements the plan itself declares. Checked for every item and
  // not just leaves, because the measured case was the **phase container's** own criterion — the one the phase
  // gate is scored against, where an unfalsifiable requirement does the most damage (BOARD F-071).
  const declaredRequirements = declaredRequirementIds(plan);
  for (const item of items) {
    const text = [item.title, item.description ?? "", ...(item.acceptance_criteria ?? [])].join("\n");
    const missing = referencedRequirementIds(text).filter((id) => !declaredRequirements.has(id));
    if (missing.length === 0) continue;
    issues.push({
      code: "undefined_requirement_reference",
      message:
        `"${item.title}" cites requirement ${missing.length === 1 ? "identifier" : "identifiers"} ` +
        `${missing.map((id) => id.toUpperCase()).join(", ")}, which nothing in this plan defines. ` +
        "Either declare them in the plan's vertical slices (`requirement_ids`) or write the criterion " +
        "against the work-item ids it can see, so the criterion can be satisfied or falsified.",
      title: item.title,
    });
  }

  if (!incremental) {
    for (const phase of phases) {
      const count = countLeavesUnderPhase(phase, items);
      if (count < budget.minLeavesPerPhase) {
        issues.push({
          code: "too_few_leaves_in_phase",
          title: phase.title,
          message: `Phase "${phase.title}" has ${count} leaves; need at least ${budget.minLeavesPerPhase}.`,
        });
      }
    }
  }

  for (const leaf of leaves) {
    const description = leaf.description?.trim() ?? "";
    if (description.length < 200) {
      issues.push({
        code: "thin_description",
        title: leaf.title,
        message: `Leaf "${leaf.title}" description is ${description.length} characters; need at least 200.`,
      });
    }
    if (!hasVerifiableAcceptanceCriterion(leaf.acceptance_criteria)) {
      issues.push({
        code: "missing_verifiable_ac",
        title: leaf.title,
        message: `Leaf "${leaf.title}" acceptance criteria must state observable evidence: a passing check, an artifact path, a documented endpoint/UI behavior, or an explicit publication/export/persistence result.`,
      });
    }
    // One rule for the planner and the executor (see `assessWorkItemBudget`): the file budget counts what the
    // leaf's own scope names, the check budget counts the checks its criteria require in the runner's
    // vocabulary. Reading the criteria's file mentions here is what made a two-file leaf unplannable, and
    // reading npm names here is what made a Python leaf's budget meaningless.
    const assessment = assessWorkItemBudget({
      title: leaf.title,
      description,
      acceptanceCriteria: leaf.acceptance_criteria,
    });
    if (assessment.files.length > LEAF_FILE_BUDGET_MAX) {
      issues.push({
        code: "overweight_files",
        title: leaf.title,
        message: `Leaf "${leaf.title}" implies ${assessment.files.length} files (max ${LEAF_FILE_BUDGET_MAX}): ${assessment.files.slice(0, 6).join(", ")}.`,
      });
    }
    if (assessment.checks.length > LEAF_CHECK_BUDGET_MAX) {
      issues.push({
        code: "overweight_scripts",
        title: leaf.title,
        message: `Leaf "${leaf.title}" lists ${assessment.checks.length} checks (max ${LEAF_CHECK_BUDGET_MAX}): ${assessment.checks.join(", ")}.`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    leafCount: leaves.length,
    minTotalLeaves: incremental ? 0 : budget.minTotalLeaves,
    sliceIssues,
  };
}

/** Drop thin / unverifiable leaves. Overweight leaves stay so recursive expansion can split them. */
export function dropInvalidLeaves(plan: PlannedProject): PlannedProject {
  const items = plan.work_items;
  const work_items = items.filter((item) => {
    if (isContainerPlannedItem(item, items) || !item.parent_ref) return true;
    const description = item.description?.trim() ?? "";
    if (description.length < 200) return false;
    if (!hasVerifiableAcceptanceCriterion(item.acceptance_criteria)) return false;
    return true;
  });
  return { ...plan, work_items };
}

export function formatPlanValidationIssues(issues: PlanValidationIssue[]): string {
  return issues.map((issue) => `- [${issue.code}] ${issue.message}`).join("\n");
}

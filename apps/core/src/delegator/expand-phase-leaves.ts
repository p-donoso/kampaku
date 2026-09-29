import type { ModelBroker } from "../model-broker/client.js";
import {
  countLeavesUnderPhase,
  dropInvalidLeaves,
  extractImpliedFilePaths,
  extractImpliedNpmScripts,
  isOverweightPlannedLeaf,
  plannedPhaseContainers,
  plannedLeaves,
  validatePlan,
} from "./plan-validation.js";
import {
  complexityBudget,
  granularityPromptBlock,
  GRANULARITY_BUDGETS,
  type PlanGranularity,
} from "./plan-granularity.js";
import {
  isContainerPlannedItem,
  plannedWorkItemSchema,
  type PlannedProject,
  type PlannedWorkItem,
} from "./types.js";
import { z } from "zod";
import {
  assertTurnBudget,
  TurnBudgetExceededError,
  type TurnDeadline,
} from "../agents/runtime/turn-budget.js";

const expandOutputSchema = z.object({
  work_items: z.array(plannedWorkItemSchema).min(1),
});

export const MAX_EXPAND_DEPTH = 5;

/**
 * Fallback leaf templates for expanding a phase when the planner returns too little.
 *
 * These are deliberately toolchain-neutral. They used to name `package.json`, `tsconfig`, `vite.config.ts`
 * and `npm run build`, so a phase expanded for a Python, Rust, or Go project produced acceptance
 * criteria naming a command that checkout could not run — the defect shape [BOARD F-003] tracks
 * (invariant §1 of the agnosticism invariants). A template may describe *what* the leaf must leave
 * behind; only the repository may say which command proves it.
 */
const STUB_LEAF_TEMPLATES: Array<{ title: string; concern: string; fileHint: string; command: string }> = [
  { title: "Scaffold unit config", concern: "the build, packaging, or module configuration this unit needs in the project's own toolchain", fileHint: "the unit's manifest or module configuration", command: "Run the unit's declared build check" },
  { title: "Define domain types", concern: "the data types and exported interfaces this unit needs, expressed in the project's language", fileHint: "the unit's type or interface definitions", command: "Run the project's declared type check" },
  { title: "Implement core module", concern: "the primary implementation of the unit with its happy-path behavior", fileHint: "the unit's primary source file", command: "Run the unit's declared test check" },
  { title: "Wire public entry", concern: "the public entry point that other code in the repository imports", fileHint: "the unit's public entry point", command: "Run the unit's declared build check" },
  { title: "Handle error paths", concern: "validation and failure states with messages a caller can act on", fileHint: "the unit's error handling", command: "Run the unit's declared test check" },
  { title: "Add unit tests", concern: "focused unit tests written with the project's existing test runner", fileHint: "the unit's unit test file", command: "Run the unit's declared test check" },
  { title: "Add fixture data", concern: "small fixtures that the unit's tests load", fileHint: "the unit's test fixtures", command: "Run the unit's declared test check" },
  { title: "Document usage", concern: "the repository's own documentation for running this slice", fileHint: "the repository documentation that ships with the code", command: "Run the repository's documentation check if it declares one" },
  { title: "Add CI step", concern: "a CI job that runs the repository's own check command", fileHint: "the repository's CI workflow", command: "Run the CI check locally" },
  { title: "Verify production build", concern: "confirmation that the unit is included in the project's production artifact", fileHint: "the unit's build output", command: "Run the unit's declared build check" },
  { title: "Add integration test", concern: "one integration test covering the wired entry point", fileHint: "the unit's integration test", command: "Run the unit's declared test check" },
  { title: "Sync project documentation", concern: "project documentation that matches the files which actually exist", fileHint: "the repository documentation for this unit", command: "Run the repository's documentation check if it declares one" },
  { title: "Harden inputs", concern: "bounds checks and sanitization for input reachable from outside the unit", fileHint: "the unit's input validation", command: "Run the unit's declared test check" },
  { title: "Add logging", concern: "structured logs for success and failure that carry no secrets", fileHint: "the unit's logging", command: "Run the unit's declared test check" },
  { title: "Cover edge cases", concern: "tests for empty, invalid, and boundary input", fileHint: "the unit's edge-case tests", command: "Run the unit's declared test check" },
  { title: "Export public API", concern: "stable public exports consumed by other units", fileHint: "the unit's public interface", command: "Run the unit's declared build check" },
  { title: "Add acceptance check", concern: "the acceptance criterion command the worker must run before closure", fileHint: "the project's check configuration", command: "Run the unit's declared test check" },
  { title: "Record follow-up risks", concern: "a short note of remaining risks, marked deferred when unimplemented", fileHint: "the repository's deferred-work note", command: "Run the repository's documentation check if it declares one" },
];
function slugPart(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "module";
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups.length > 0 ? groups : [[]];
}

function buildLeafDescription(phaseTitle: string, template: (typeof STUB_LEAF_TEMPLATES)[number], intent: string): string {
  const intentSlice = intent.replace(/\s+/g, " ").trim().slice(0, 180);
  return [
    `AI-executable leaf under "${phaseTitle}".`,
    `Concern: ${template.concern}.`,
    `Primary file: ${template.fileHint}.`,
    "Do not create more than this file plus a test if needed; split further rather than packing extra paths.",
    `Context from emperor intent: ${intentSlice}.`,
    "Follow repository agent conventions. Run the acceptance command before closure and record stdout in the completion report.",
  ].join(" ");
}

function padDescription(text: string): string {
  if (text.trim().length >= 200) return text;
  return `${text.trim()} Keep this slice to one concern with at most three file paths and two check scripts. Follow repository agent conventions, run the acceptance command before closure, and record stdout in the completion report.`;
}

export function expandPhaseLeavesStub(
  phase: PlannedWorkItem,
  intent: string,
  granularity: PlanGranularity,
  existing: PlannedWorkItem[],
  neededOverride?: number,
): PlannedWorkItem[] {
  const budget = GRANULARITY_BUDGETS[granularity];
  const current = countLeavesUnderPhase(phase, existing);
  const needed = neededOverride ?? Math.max(0, budget.targetLeavesPerPhase - current);
  if (needed === 0) return [];

  const usedTitles = new Set(existing.map((item) => item.title.toLowerCase()));
  const leaves: PlannedWorkItem[] = [];
  const prefix = slugPart(phase.title);

  for (const template of STUB_LEAF_TEMPLATES) {
    if (leaves.length >= needed) break;
    const title = `${phase.title} — ${template.title}`;
    if (usedTitles.has(title.toLowerCase())) continue;
    usedTitles.add(title.toLowerCase());
    leaves.push({
      title,
      description: buildLeafDescription(phase.title, template, intent),
      priority: existing.length + leaves.length,
      parent_ref: phase.title,
      suggested_responsibility: phase.suggested_responsibility ?? "engineering",
      acceptance_criteria: [
        `${template.command} succeeds`,
        `Primary deliverable exists at ${template.fileHint.replace("module", prefix)}`,
      ],
    });
  }

  let extra = 1;
  while (leaves.length < needed) {
    const title = `${phase.title} — Micro-task ${current + leaves.length + 1}`;
    leaves.push({
      title,
      description: buildLeafDescription(phase.title, STUB_LEAF_TEMPLATES[0]!, intent) + ` Sequence ${extra}.`,
      priority: existing.length + leaves.length,
      parent_ref: phase.title,
      suggested_responsibility: phase.suggested_responsibility ?? "engineering",
      acceptance_criteria: [
        "Run the unit's declared test check and record its exit status",
        `the unit's primary source file exists in the repository as ${prefix}-${extra}`,
      ],
    });
    extra += 1;
  }

  return leaves;
}

export function expandOverweightLeafStub(
  leaf: PlannedWorkItem,
  intent: string,
  existing: PlannedWorkItem[],
): PlannedWorkItem[] {
  const blob = [leaf.title, leaf.description ?? "", ...(leaf.acceptance_criteria ?? [])].join("\n");
  const files = extractImpliedFilePaths(blob);
  const scripts = extractImpliedNpmScripts(blob);
  if (files.length <= 3 && scripts.length <= 2) return [];

  const fileGroups = files.length > 0 ? chunk(files, 3) : [[undefined as string | undefined]];
  const scriptGroups = scripts.length > 2 ? chunk(scripts, 2) : [scripts];
  const parts = Math.max(fileGroups.length, scriptGroups.length, 2);
  const usedTitles = new Set(existing.map((item) => item.title.toLowerCase()));
  const children: PlannedWorkItem[] = [];
  const intentSlice = intent.replace(/\s+/g, " ").trim().slice(0, 120);

  for (let index = 0; index < parts; index += 1) {
    const fileGroup = (fileGroups[index] ?? fileGroups[0] ?? []).filter(
      (path): path is string => Boolean(path),
    );
    const scriptGroup = scriptGroups[index] ?? scriptGroups[0] ?? [];
    let title = `${leaf.title} — slice ${index + 1}`;
    let suffix = 1;
    while (usedTitles.has(title.toLowerCase())) {
      suffix += 1;
      title = `${leaf.title} — slice ${index + 1}.${suffix}`;
    }
    usedTitles.add(title.toLowerCase());
    const primary = fileGroup[0] ?? `src/${slugPart(leaf.title)}-${index + 1}.ts`;
    children.push({
      title,
      description: padDescription(
        [
          `Recursive split of overweight leaf "${leaf.title}".`,
          fileGroup.length > 0
            ? `Touch only: ${fileGroup.join(", ")}. Do not edit sibling slice files.`
            : `Primary file: ${primary}.`,
          `Context: ${intentSlice}.`,
        ].join(" "),
      ),
      priority: existing.length + children.length,
      parent_ref: leaf.title,
      suggested_responsibility: leaf.suggested_responsibility ?? "engineering",
      acceptance_criteria: [
        // The command stays the repository's own. Naming `npm run <script>` here produced criteria
        // a non-Node checkout cannot run; the check name is resolved against the project instead.
        ...(scriptGroup.length > 0
          ? scriptGroup.map((script) => `Run the repository's declared ${script} check and record its exit status`)
          : ["Run the repository's declared test check and record its exit status"]),
        `file exists at ${primary}`,
      ],
    });
  }

  return children;
}

function expandSystemPrompt(granularity: PlanGranularity, parentTitle: string): string {
  return `You expand one Kampaku container into AI-executable micro-tasks.
Return JSON only: { "work_items": [ ... ] }

Rules:
- parent_ref must be exactly ${JSON.stringify(parentTitle)}.
- One concern per leaf (one component, endpoint, test file, or config file).
- description min 200 characters: context, target file paths, verifiable commands.
- acceptance_criteria must include the repository's own check command (whatever its toolchain declares) or a file-exists check. Never name a package manager or runner the repository does not use.
- Do not pack more than 3 file creations or more than 2 check commands into one leaf.
- If the parent is still feature-sized, emit nested containers only when necessary; prefer leaf micro-tasks.
${granularityPromptBlock(granularity)}
- Do not emit the parent container itself; only new child tasks.
- Never assign kampaku-* platform agents.`;
}

export async function expandPhaseLeaves(options: {
  phase: PlannedWorkItem;
  plan: PlannedProject;
  intent: string;
  granularity: PlanGranularity;
  broker?: ModelBroker;
  neededOverride?: number;
  /** The clock of the turn that asked for this plan. Checked before every model call. */
  turn?: TurnDeadline | undefined;
}): Promise<PlannedWorkItem[]> {
  const existing = options.plan.work_items;
  const budget = GRANULARITY_BUDGETS[options.granularity];
  const needed =
    options.neededOverride ??
    Math.max(0, budget.targetLeavesPerPhase - countLeavesUnderPhase(options.phase, existing));
  if (needed === 0 && !isOverweightPlannedLeaf(options.phase)) {
    return [];
  }

  if (!options.broker && !isContainerPlannedItem(options.phase, existing) && isOverweightPlannedLeaf(options.phase)) {
    return expandOverweightLeafStub(options.phase, options.intent, existing);
  }

  if (!options.broker) {
    return expandPhaseLeavesStub(
      options.phase,
      options.intent,
      options.granularity,
      existing,
      needed,
    );
  }

  try {
    // Before the availability probe, before the model call: this loop is one call per node per depth, and
    // it belongs to a turn whose budget is already running. See turn-budget.ts.
    assertTurnBudget(options.turn, `Plan expansion of "${options.phase.title}"`);

    const available = await options.broker.isAvailable();
    if (!available) {
      throw new Error("LLM plan expansion requires an available model provider.");
    }

    const result = await options.broker.chat([
      { role: "system", content: expandSystemPrompt(options.granularity, options.phase.title) },
      {
        role: "user",
        content: JSON.stringify({
          intent: options.intent,
          container: options.phase,
          existing_titles: existing.map((item) => item.title),
          target_new_leaves: needed || budget.targetLeavesPerPhase,
        }),
      },
    ]);
    // **One malformed response must not discard the whole plan.** The expansion is a strict Zod parse, and it
    // used to be a bare `.parse()`: a single wrong primitive in one node's JSON threw, the error propagated
    // through `expandUntilBudget` into `planAndDelegate`, and the caller saw planning fail outright.
    //
    // Measured 2026-09-28 taking suite 07 (run 15, after the provider was made steady): the planner expanded
    // for **42 minutes** — one model call per node per depth, five depths, ~13k output tokens each — and then
    // `LLM plan expansion failed for "Add the frozen PYTHON ?= python3 assignment when absent"` with
    // `ZodError: expected "string", received "number"` for a *single* node's field. Nothing was persisted and
    // every minute of that work was gone, for a defect the model could have corrected if asked.
    //
    // The recovery is the one this codebase already uses one layer up for a plan that fails `validatePlan`:
    // ask once more, showing the model its own output and the exact schema error, and re-parse. Only if that
    // also fails does this node contribute nothing — `expandUntilBudget` already treats an empty expansion as
    // "this node needs nothing" and carries on with the rest of the plan.
    const workItems = await parseExpandedLeaves(options.broker, result.content, options.phase.title);
    return workItems.map((item) => ({
      ...item,
      parent_ref: options.phase.title,
    }));
  } catch (error) {
    // A budget stop is not an expansion failure, and wrapping it as one would hide the only fact the
    // emperor needs: the turn ran out of time. Rethrown unchanged.
    if (error instanceof TurnBudgetExceededError) throw error;
    const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 180)}` : "Unknown model error";
    throw new Error(`LLM plan expansion failed for "${options.phase.title}". ${reason}`, { cause: error });
  }
}

function thinnestContainerChild(
  parent: PlannedWorkItem,
  items: PlannedWorkItem[],
): PlannedWorkItem | undefined {
  const key = parent.title.toLowerCase();
  const nested = items.filter(
    (item) => item.parent_ref?.toLowerCase() === key && isContainerPlannedItem(item, items),
  );
  if (nested.length === 0) return undefined;
  return nested.reduce((best, item) =>
    countLeavesUnderPhase(item, items) < countLeavesUnderPhase(best, items) ? item : best,
  );
}

export function findNodesNeedingExpansion(
  plan: PlannedProject,
  granularity: PlanGranularity,
  mode: "greenfield" | "incremental",
  intent = "",
): PlannedWorkItem[] {
  const items = plan.work_items;
  const budget = GRANULARITY_BUDGETS[granularity];
  const targets: PlannedWorkItem[] = [];
  const seen = new Set<string>();

  const push = (item: PlannedWorkItem) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(item);
  };

  for (const leaf of plannedLeaves(items)) {
    if (isOverweightPlannedLeaf(leaf)) push(leaf);
  }
  for (const issue of validatePlan(plan, { intent, granularity, mode }).issues) {
    if (issue.title && (issue.code === "thin_description" || issue.code === "missing_verifiable_ac")) {
      const leaf = items.find((item) => item.title === issue.title);
      if (leaf) push(leaf);
    }
  }

  if (mode === "incremental") return targets;

  const phases = plannedPhaseContainers(items);
  const totalBudget = complexityBudget(intent, granularity, phases.length || undefined);

  for (const phase of phases) {
    const count = countLeavesUnderPhase(phase, items);
    if (count >= budget.minLeavesPerPhase) continue;
    const nested = thinnestContainerChild(phase, items);
    if (nested && countLeavesUnderPhase(nested, items) < budget.minLeavesPerPhase) {
      push(nested);
    } else {
      push(phase);
    }
  }

  if (plannedLeaves(items).length < totalBudget.minTotalLeaves) {
    for (const phase of phases) push(phase);
  }

  if (targets.length === 0 && plannedLeaves(items).length === 0) {
    for (const phase of phases) push(phase);
  }

  return targets;
}

/** Recursively expand coarse containers and overweight leaves until the complexity budget holds. */
export async function expandUntilBudget(options: {
  plan: PlannedProject;
  intent: string;
  granularity: PlanGranularity;
  broker?: ModelBroker;
  mode?: "greenfield" | "incremental";
  maxDepth?: number;
  /** The clock of the turn that asked for this plan. Checked before every model call. */
  turn?: TurnDeadline | undefined;
}): Promise<PlannedProject> {
  const mode = options.mode ?? "greenfield";
  const maxDepth = options.maxDepth ?? MAX_EXPAND_DEPTH;
  let plan = { ...options.plan, work_items: [...options.plan.work_items] };

  for (let depth = 0; depth < maxDepth; depth += 1) {
    assertTurnBudget(options.turn, "Plan expansion");
    if (!options.broker) plan = dropInvalidLeaves(plan);
    const validation = validatePlan(plan, {
      intent: options.intent,
      granularity: options.granularity,
      mode,
    });
    if (validation.ok) return plan;

    const targets = findNodesNeedingExpansion(
      plan,
      options.granularity,
      mode,
      options.intent,
    );
    if (targets.length === 0) return plan;

    const workItems = [...plan.work_items];
    const phases = plannedPhaseContainers(workItems);
    const totalBudget = complexityBudget(
      options.intent,
      options.granularity,
      phases.length || undefined,
    );
    let added = 0;
    for (const node of targets) {
      const currentPlan = { ...plan, work_items: workItems };
      const isOverweight =
        !isContainerPlannedItem(node, workItems) && isOverweightPlannedLeaf(node);
      const currentLeaves = countLeavesUnderPhase(node, workItems);
      const shortfall = Math.max(0, totalBudget.minTotalLeaves - plannedLeaves(workItems).length);
      const towardTarget = Math.max(
        0,
        GRANULARITY_BUDGETS[options.granularity].targetLeavesPerPhase - currentLeaves,
      );
      const towardTotal =
        shortfall > 0 && mode === "greenfield"
          ? Math.max(1, Math.ceil(shortfall / Math.max(phases.length, 1)))
          : 0;
      const needed = isOverweight ? undefined : Math.max(towardTarget, towardTotal);
      const extra = await expandPhaseLeaves({
        phase: node,
        plan: currentPlan,
        intent: options.intent,
        granularity: options.granularity,
        broker: options.broker,
        neededOverride: needed,
        turn: options.turn,
      });
      if (extra.length === 0) continue;
      workItems.push(...extra);
      added += extra.length;
      plan = { ...plan, work_items: workItems };
    }

    if (added === 0) return plan;
  }

  return options.broker ? plan : dropInvalidLeaves(plan);
}

/** @deprecated Prefer expandUntilBudget — kept as a thin alias for call sites. */
export async function expandThinPhases(options: {
  plan: PlannedProject;
  intent: string;
  granularity: PlanGranularity;
  broker?: ModelBroker;
  mode?: "greenfield" | "incremental";
}): Promise<PlannedProject> {
  return expandUntilBudget(options);
}

/**
 * Parse one expansion response, asking the model to correct itself once before giving up.
 *
 * Returns `[]` when the response cannot be repaired, which the caller's loop reads as "this node added
 * nothing" — a degraded plan beats no plan. See the measurement in `expandPhaseLeaves`.
 */
async function parseExpandedLeaves(
  broker: ModelBroker,
  rawContent: string,
  containerTitle: string,
): Promise<PlannedWorkItem[]> {
  const attempt = (content: string): PlannedWorkItem[] | undefined => {
    try {
      return expandOutputSchema.parse(JSON.parse(content) as unknown).work_items;
    } catch {
      return undefined;
    }
  };

  const first = attempt(rawContent);
  if (first) return first;

  let problem = "the response was not valid JSON in the expected shape";
  try {
    expandOutputSchema.parse(JSON.parse(rawContent) as unknown);
  } catch (error) {
    problem = error instanceof Error ? `${error.name}: ${error.message.slice(0, 400)}` : String(error);
  }

  try {
    const repair = await broker.chat([
      {
        role: "system",
        content:
          "You repair JSON that failed schema validation. Return only the corrected JSON object, matching the " +
          "original schema exactly. Every field the schema types as a string must be a JSON string, every array " +
          "of strings must contain only strings, and numeric fields must be numbers. Do not add commentary.",
      },
      {
        role: "user",
        content: JSON.stringify({
          container: containerTitle,
          invalid_response: rawContent.slice(0, 12000),
          validation_error: problem,
        }),
      },
    ]);
    const repaired = attempt(repair.content);
    if (repaired) return repaired;
  } catch {
    // A repair that cannot be reached is the same as a repair that did not help: this node adds nothing.
  }
  return [];
}

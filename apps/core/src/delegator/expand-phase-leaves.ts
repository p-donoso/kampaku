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

const expandOutputSchema = z.object({
  work_items: z.array(plannedWorkItemSchema).min(1),
});

export const MAX_EXPAND_DEPTH = 5;

const STUB_LEAF_TEMPLATES: Array<{ title: string; concern: string; fileHint: string; command: string }> = [
  { title: "Scaffold package config", concern: "package.json, tsconfig, and tool config for this module", fileHint: "package.json", command: "npm run build" },
  { title: "Define domain types", concern: "TypeScript types and exported interfaces for the module", fileHint: "src/types.ts", command: "file exists at src/types.ts" },
  { title: "Implement core module", concern: "primary implementation file with the happy-path behavior", fileHint: "src/module.ts", command: "npm test" },
  { title: "Wire public entry", concern: "export the module from the application entry or index", fileHint: "src/index.ts", command: "npm run build" },
  { title: "Handle error paths", concern: "validation and failure states with user-visible messages", fileHint: "src/errors.ts", command: "npm test" },
  { title: "Add unit tests", concern: "focused unit tests for the core module", fileHint: "src/module.test.ts", command: "npm test" },
  { title: "Add fixture data", concern: "small fixtures used by tests and local demos", fileHint: "src/fixtures.ts", command: "file exists at src/fixtures.ts" },
  { title: "Document usage", concern: "README or wiki section describing how to run this slice", fileHint: "docs/wiki/dev-setup.md", command: "file exists at docs/wiki/dev-setup.md" },
  { title: "Add CI step", concern: "workflow job that runs the module's verification command", fileHint: ".github/workflows/ci.yml", command: "file exists at .github/workflows/ci.yml" },
  { title: "Verify production build", concern: "ensure the module is included in the production bundle", fileHint: "vite.config.ts", command: "npm run build" },
  { title: "Add integration test", concern: "one integration test covering the wired entry", fileHint: "src/module.integration.test.ts", command: "npm test" },
  { title: "Sync wiki page", concern: "architecture note that matches files that actually exist", fileHint: "docs/wiki/architecture-overview.md", command: "file exists at docs/wiki/architecture-overview.md" },
  { title: "Harden inputs", concern: "bounds checks and sanitization for user or file input", fileHint: "src/validate.ts", command: "npm test" },
  { title: "Add logging", concern: "structured logs for success and failure without secrets", fileHint: "src/log.ts", command: "file exists at src/log.ts" },
  { title: "Cover edge cases", concern: "additional tests for empty, invalid, and boundary input", fileHint: "src/module.edge.test.ts", command: "npm test" },
  { title: "Export public API", concern: "stable named exports consumed by other modules", fileHint: "src/public-api.ts", command: "npm run build" },
  { title: "Add acceptance check", concern: "acceptance criterion command the worker must run before done", fileHint: "package.json", command: "npm test" },
  { title: "Record follow-up risks", concern: "short note of remaining risks tagged as Roadmap if unimplemented", fileHint: "docs/roadmap.md", command: "file exists at docs/roadmap.md" },
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
  return `${text.trim()} Keep this slice to one concern with at most three file paths and two npm scripts. Follow repository agent conventions, run the acceptance command before closure, and record stdout in the completion report.`;
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
      acceptance_criteria: ["npm test succeeds", `file exists at src/${prefix}-${extra}.ts`],
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
        ...(scriptGroup.length > 0
          ? scriptGroup.map((script) => `npm run ${script} succeeds`)
          : ["npm test succeeds"]),
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
- acceptance_criteria must include a runnable command (npm test, npm run build) or file-exists check.
- Do not pack more than 3 file creations or more than 2 npm scripts into one leaf.
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
}): Promise<PlannedWorkItem[]> {
  const existing = options.plan.work_items;
  const budget = GRANULARITY_BUDGETS[options.granularity];
  const needed =
    options.neededOverride ??
    Math.max(0, budget.targetLeavesPerPhase - countLeavesUnderPhase(options.phase, existing));
  if (needed === 0 && !isOverweightPlannedLeaf(options.phase)) {
    return [];
  }

  if (!isContainerPlannedItem(options.phase, existing) && isOverweightPlannedLeaf(options.phase)) {
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
    const available = await options.broker.isAvailable();
    if (!available) {
      return expandPhaseLeavesStub(
        options.phase,
        options.intent,
        options.granularity,
        existing,
        needed,
      );
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
    const parsed = expandOutputSchema.parse(JSON.parse(result.content) as unknown);
    return parsed.work_items.map((item) => ({
      ...item,
      parent_ref: options.phase.title,
    }));
  } catch {
    return expandPhaseLeavesStub(
      options.phase,
      options.intent,
      options.granularity,
      existing,
      needed,
    );
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
}): Promise<PlannedProject> {
  const mode = options.mode ?? "greenfield";
  const maxDepth = options.maxDepth ?? MAX_EXPAND_DEPTH;
  let plan = { ...options.plan, work_items: [...options.plan.work_items] };

  for (let depth = 0; depth < maxDepth; depth += 1) {
    plan = dropInvalidLeaves(plan);
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
      });
      if (extra.length === 0) continue;
      workItems.push(...extra);
      added += extra.length;
      plan = { ...plan, work_items: workItems };
    }

    if (added === 0) return plan;
  }

  return dropInvalidLeaves(plan);
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

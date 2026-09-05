import { z } from "zod";

export const plannedWorkItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  priority: z.number().int().default(0),
  parent_ref: z.string().optional(),
  suggested_responsibility: z.string().optional(),
  assignee_slug: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
});

export const plannedProjectSchema = z.object({
  project: z
    .object({
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
    })
    .optional(),
  project_lead_slug: z.string().optional(),
  coherence_strategy: z.string().optional(),
  documents: z
    .array(
      z.object({
        title: z.string().min(1),
        content_md: z.string().min(1),
      }),
    )
    .optional(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        target_date: z.string().optional(),
        success_criteria: z.array(z.string()).optional(),
        executed_by: z.literal("ai_agents").optional(),
      }),
    )
    .optional(),
  work_items: z.array(plannedWorkItemSchema).min(1),
});

export type PlannedWorkItem = z.infer<typeof plannedWorkItemSchema>;
export type PlannedProject = z.infer<typeof plannedProjectSchema>;

export function isContainerPlannedItem(item: PlannedWorkItem, allItems: PlannedWorkItem[]): boolean {
  const key = item.title.toLowerCase();
  return allItems.some((other) => other.parent_ref?.toLowerCase() === key);
}

/** Fill empty leaf AC only. Do not pad thin descriptions — plan validation rejects those. */
export function normalizePlannedWorkItems(items: PlannedWorkItem[]): PlannedWorkItem[] {
  return items.map((item) => {
    if (isContainerPlannedItem(item, items)) return item;
    const criteria = item.acceptance_criteria ?? [];
    if (criteria.length > 0) return item;
    return {
      ...item,
      acceptance_criteria: [
        "file exists at the primary path named in the description",
        "npm test passes when package.json defines a test script",
      ],
    };
  });
}

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  );
}

/** Parents before children so parent_ref resolves during persistence. */
export function sortWorkItemsForCreation(items: PlannedWorkItem[]): PlannedWorkItem[] {
  const byTitle = new Map(items.map((item) => [item.title.toLowerCase(), item]));
  const sorted: PlannedWorkItem[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (item: PlannedWorkItem) => {
    const key = item.title.toLowerCase();
    if (visited.has(key)) return;
    if (visiting.has(key)) return;
    visiting.add(key);

    if (item.parent_ref) {
      const parent = byTitle.get(item.parent_ref.toLowerCase());
      if (parent) visit(parent);
    }

    visiting.delete(key);
    visited.add(key);
    sorted.push(item);
  };

  for (const item of items) visit(item);
  return sorted;
}

export function decomposeIntentStub(intent: string, projectSlug?: string): PlannedProject {
  const lower = intent.toLowerCase();

  const projectMatch =
    intent.match(/proyecto\s+(?:llamado\s+|denominado\s+)?["']?([^"'.]+)["']?/i) ??
    intent.match(/project\s+(?:called\s+|named\s+)?["']?([^"'.]+)["']?/i);

  const projectName = projectMatch?.[1]?.trim() ?? "Demo App";
  const slug = projectSlug ?? slugifyName(projectName);

  const workItems: PlannedWorkItem[] = [];

  const phasePatterns: Array<{ pattern: RegExp; group: string; responsibility: string }> = [
    { pattern: /login|auth|autentic/i, group: "Authentication module", responsibility: "authentication" },
    { pattern: /api|rest|backend/i, group: "REST API", responsibility: "backend api" },
    { pattern: /optimis|ssim|vector|byot|upload|compose/i, group: "Vision pipeline", responsibility: "ai ml" },
    { pattern: /canvas|draw|shape|ui|frontend|interfaz/i, group: "User interface", responsibility: "frontend ui" },
    { pattern: /test|prueba|e2e|cypress|playwright/i, group: "Quality assurance", responsibility: "testing qa" },
    { pattern: /wiki|docs|readme/i, group: "Documentation", responsibility: "docs" },
    { pattern: /\bci\b|github|oss|license/i, group: "OSS and CI", responsibility: "tooling" },
    { pattern: /audit|sensei/i, group: "Deliverable audit", responsibility: "audit" },
  ];

  for (const { pattern, group, responsibility } of phasePatterns) {
    if (!pattern.test(lower)) continue;
    workItems.push({
      title: group,
      description:
        `Phase container for ${group}. The project lead owns coherence; leaf micro-tasks under this phase are expanded recursively to the complexity budget and executed by specialist agents.`,
      priority: workItems.length,
      suggested_responsibility: "planning",
      acceptance_criteria: [`All leaf tasks under "${group}" are done with verifiable commands`],
    });
    void responsibility;
  }

  if (workItems.length === 0) {
    workItems.push({
      title: "Initial scope",
      description:
        "Root phase container coordinated by the project lead. Recursive expansion adds one-concern leaf tasks with verifiable acceptance criteria until the complexity budget is met.",
      priority: 0,
      suggested_responsibility: "planning",
      acceptance_criteria: ["All leaf tasks under this phase are done"],
    });
  }

  return {
    project: {
      name: projectName,
      slug,
      description: intent.slice(0, 500),
    },
    project_lead_slug: undefined,
    coherence_strategy:
      "The project lead consolidates the task tree state, validates closure criteria, and maintains coherence across agents.",
    documents: [
      {
        title: "Project vision",
        content_md: `# ${projectName}\n\n${intent}\n\n> Roadmap and tasks executed by AI agents. The project lead supervises closure and coherence.`,
      },
    ],
    milestones: [
      {
        title: "MVP",
        description: "First functional version executed by AI agents",
        executed_by: "ai_agents",
        success_criteria: [
          "All MVP tasks in done",
          "Project lead validated closure criteria",
        ],
      },
      {
        title: "Launch",
        description: "Production-ready version",
        executed_by: "ai_agents",
        success_criteria: ["QA approved", "Documentation published", "Final tasks closed"],
      },
    ],
    work_items: normalizePlannedWorkItems(workItems),
  };
}

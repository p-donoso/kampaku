import { randomUUID } from "node:crypto";
import type { KampakuToolContext } from "./index.js";

export interface ProposeProjectPlanArgs {
  project_slug_or_id: string;
  intent?: string;
}

function isHelloEvalPlanIntent(intent: string): boolean {
  const lower = intent.toLowerCase();
  return (
    lower.includes("hello eval") ||
    (lower.includes("tiny") && (lower.includes("web") || lower.includes("page"))) ||
    (lower.includes("plan") && lower.includes("stranger"))
  );
}

/**
 * Persist a human-readable multi-step plan as todo work items (no jobs / no done).
 * Default template matches suite 06 stranger seed honesty (node hello.js / node --test).
 */
export function executeProposeProjectPlan(ctx: KampakuToolContext, args: ProposeProjectPlanArgs) {
  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error(
      "Refusing to flood the platform project board. Propose plans on the stranger project slug.",
    );
  }

  const intent = args.intent?.trim() || "Plan Hello Eval for the stranger project.";
  if (!isHelloEvalPlanIntent(intent) && !intent.toLowerCase().includes("hello")) {
    // Still allow emperor-confirmed stranger planning with Hello Eval template when project has file:// seed
    const hasExternal = project.repositories.some((repo) => repo.url.startsWith("file://"));
    if (!hasExternal) {
      throw new Error(
        "propose_project_plan currently supports Hello Eval / stranger file:// projects. Staff or bootstrap the stranger project first.",
      );
    }
  }

  const existing = ctx.pmStore.listWorkItemsByProject(project.id);
  if (existing.length > 0) {
    throw new Error(
      `Project ${project.slug} already has ${existing.length} work item(s). Clear or finish them before proposing a fresh Hello Eval plan.`,
    );
  }

  const leadId = project.projectLeadAgentId ?? ctx.agentStore.getKampakuAgent().id;
  const lead = ctx.agentStore.getAgentBySlugOrId(leadId) ?? ctx.agentStore.getKampakuAgent();
  const now = new Date().toISOString();

  const steps: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    parentTitle?: string;
  }> = [
    {
      title: "Hello Eval plan",
      description:
        "Container for a tiny Hello Eval deliverable on the stranger project. Do not mark done from planning alone. Wait for emperor go before large execution.",
      acceptanceCriteria: [
        "Child steps remain todo until emperor approves execution",
        "README.md documents node hello.js and node --test",
      ],
    },
    {
      title: "Verify seed greeting",
      parentTitle: "Hello Eval plan",
      description:
        "Confirm the seeded stranger tree already prints Hello Eval. A human should copy the command from the project README.",
      acceptanceCriteria: ["node hello.js prints Hello Eval", "file exists: hello.js"],
    },
    {
      title: "Verify seed tests",
      parentTitle: "Hello Eval plan",
      description:
        "Confirm the seeded test file passes with the Node built-in test runner. Do not invent npm run build or Express.",
      acceptanceCriteria: ["node --test passes", "file exists: hello.test.js"],
    },
    {
      title: "Add one-page Hello Eval HTML",
      parentTitle: "Hello Eval plan",
      description:
        "Add a single static page (index.html) that shows the text Hello Eval in the browser. Keep the stack minimal — no invented frameworks. Update README with how a stranger opens the page.",
      acceptanceCriteria: [
        "file exists: index.html",
        "index.html contains Hello Eval",
        "README.md mentions index.html",
      ],
    },
  ];

  const idByTitle = new Map<string, string>();
  const created: Array<{ id: string; title: string; parentId: string | null; status: string }> = [];

  for (const [index, step] of steps.entries()) {
    const id = randomUUID();
    const parentId = step.parentTitle ? idByTitle.get(step.parentTitle) ?? null : null;
    ctx.pmStore.createWorkItem({
      id,
      projectId: project.id,
      parentId: parentId ?? undefined,
      title: step.title,
      description: step.description,
      status: "todo",
      priority: "medium",
      sortOrder: index,
      assigneeAgentId: lead.id,
      assignedByAgentId: ctx.agentStore.getKampakuAgent().id,
      routingReason: "Emperor-directed Hello Eval plan proposal (no execution started)",
      acceptanceCriteria: step.acceptanceCriteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    idByTitle.set(step.title, id);
    created.push({ id, title: step.title, parentId, status: "todo" });
  }

  const leaves = created.filter((item) => item.title !== "Hello Eval plan");
  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    workItemsCreated: created.length,
    leafCount: leaves.length,
    jobsStarted: 0,
    status: "todo",
    workItems: created,
    verifyCommandsFromSeed: ["node hello.js", "node --test"],
    summary:
      `Proposed ${leaves.length} leaf steps under Hello Eval plan for ${project.slug}. ` +
      "All items are todo; no jobs started. Wait for emperor go before execution.",
  };
}

export const PROPOSE_PROJECT_PLAN_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_project_plan",
    description:
      "Propose a multi-step Hello Eval plan on an existing stranger project as todo work items with copy-pasteable acceptance checks (node hello.js, node --test, index.html). Does not mark done, does not start jobs, does not modify the Kampaku monorepo. Kampaku only. Use after bootstrap_stranger_project when the emperor asks for a human-readable plan and to wait before execution.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Stranger project slug or id (not kampaku).",
        },
        intent: {
          type: "string",
          description: "Emperor planning intent, e.g. tiny Hello Eval web page plan.",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};

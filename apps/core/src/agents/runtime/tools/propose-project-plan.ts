import { randomUUID } from "node:crypto";
import { intentAllowsEngineeringDefaultAc } from "../../../delegator/domain-intent.js";
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

function isFirstSlicePlanIntent(intent: string): boolean {
  const lower = intent.toLowerCase();
  return (
    lower.includes("first slice") ||
    lower.includes("standing team") ||
    lower.includes("adequate team") ||
    lower.includes("covering all aspects") ||
    lower.includes("do not invent engineering") ||
    lower.includes("not software")
  );
}

/**
 * Persist a human-readable multi-step plan as todo work items (no jobs / no done).
 * Hello Eval template for stranger file:// seeds; otherwise a domain-agnostic first slice.
 */
export function executeProposeProjectPlan(ctx: KampakuToolContext, args: ProposeProjectPlanArgs) {
  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error(
      "Refusing to flood the platform project board. Propose plans on a dedicated project slug.",
    );
  }

  const intent = args.intent?.trim() || "Plan Hello Eval for the stranger project.";
  const helloEval = isHelloEvalPlanIntent(intent) || intent.toLowerCase().includes("hello");
  const firstSlice = !helloEval && isFirstSlicePlanIntent(intent);
  if (!helloEval && !firstSlice) {
    const hasExternal = project.repositories.some((repo) => repo.url.startsWith("file://"));
    if (!hasExternal) {
      throw new Error(
        "propose_project_plan supports Hello Eval / stranger file:// projects or a first-slice intent on a staffed project.",
      );
    }
  }

  const existing = ctx.pmStore.listWorkItemsByProject(project.id);
  if (existing.length > 0) {
    throw new Error(
      `Project ${project.slug} already has ${existing.length} work item(s). Clear or finish them before proposing a fresh plan.`,
    );
  }

  const leadId = project.projectLeadAgentId ?? ctx.agentStore.getKampakuAgent().id;
  const lead = ctx.agentStore.getAgentBySlugOrId(leadId) ?? ctx.agentStore.getKampakuAgent();
  const now = new Date().toISOString();
  const useEngineeringAc = intentAllowsEngineeringDefaultAc(intent);

  const steps: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    parentTitle?: string;
  }> = firstSlice
    ? [
        {
          title: "First work slice",
          description:
            "Container for the first coherent slice of domain work. Do not mark done from planning alone. Do not invent a default engineering stack (npm/CI/OpenAPI/frontend/backend) unless the emperor named one.",
          acceptanceCriteria: [
            "Child steps remain todo until emperor approves execution",
            "Acceptance language matches the emperor's domain",
          ],
        },
        {
          title: "Define slice success criteria",
          parentTitle: "First work slice",
          description:
            "Write measurable success criteria for this first slice using the project's domain vocabulary so a cold reader understands done without assuming a software repo.",
          acceptanceCriteria: [
            "stated acceptance check in the description passes",
            "file exists at work/success-criteria.md",
          ],
        },
        {
          title: "Produce first deliverable",
          parentTitle: "First work slice",
          description:
            "Produce the primary first-slice deliverable named in the emperor intent. Keep scope to one coherent artifact set.",
          acceptanceCriteria: [
            "named deliverable in the description exists",
            "file exists at work/first-deliverable.md",
          ],
        },
        {
          title: "Record handoff notes",
          parentTitle: "First work slice",
          description:
            "Record handoff notes so the next specialist can continue without rediscovering constraints.",
          acceptanceCriteria: [
            "stated acceptance check in the description passes",
            "file exists at work/handoff.md",
          ],
        },
      ]
    : [
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
  const containerTitle = firstSlice ? "First work slice" : "Hello Eval plan";

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
      routingReason: firstSlice
        ? "Emperor-directed first work slice (no execution started)"
        : "Emperor-directed Hello Eval plan proposal (no execution started)",
      acceptanceCriteria: step.acceptanceCriteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    idByTitle.set(step.title, id);
    created.push({ id, title: step.title, parentId, status: "todo" });
  }

  const leaves = created.filter((item) => item.title !== containerTitle);
  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    workItemsCreated: created.length,
    leafCount: leaves.length,
    jobsStarted: 0,
    status: "todo",
    domainAgnostic: firstSlice || !useEngineeringAc,
    workItems: created,
    verifyCommandsFromSeed: firstSlice
      ? ["named deliverable in the description exists", "stated acceptance check in the description passes"]
      : ["node hello.js", "node --test"],
    summary: firstSlice
      ? `Proposed ${leaves.length} leaf steps under First work slice for ${project.slug}. All items are todo; no jobs started. Domain-agnostic AC — no invented engineering stack.`
      : `Proposed ${leaves.length} leaf steps under Hello Eval plan for ${project.slug}. All items are todo; no jobs started. Wait for emperor go before execution.`,
  };
}

export const PROPOSE_PROJECT_PLAN_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_project_plan",
    description:
      "Propose a multi-step plan as todo work items without starting jobs. Use Hello Eval acceptance for stranger software seeds, or a domain-agnostic first work slice when staffing a non-default engineering project. Does not mark done, does not modify the Kampaku monorepo. Kampaku only. Never invent npm/CI/OpenAPI AC unless the emperor asked for an engineering stack.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project slug or id (not kampaku).",
        },
        intent: {
          type: "string",
          description: "Emperor planning intent, e.g. first work slice covering domain aspects or tiny Hello Eval web page plan.",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};

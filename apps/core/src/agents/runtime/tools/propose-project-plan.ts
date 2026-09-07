import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { intentAllowsEngineeringDefaultAc } from "../../../delegator/domain-intent.js";
import type { KampakuToolContext } from "./index.js";

export interface ProposeProjectPlanArgs {
  project_slug_or_id: string;
  intent?: string;
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

function detectSeedEntrypoint(repoPath: string): {
  script: string;
  expectedOutput: string | null;
  testFile: string | null;
} | null {
  if (!existsSync(repoPath)) return null;
  const files = new Set(readdirSync(repoPath));
  const candidates = [...files]
    .filter((name) => /\.(js|mjs|cjs)$/i.test(name) && !/\.test\./i.test(name))
    .sort((a, b) => {
      const preferred = ["hello.js", "index.js", "main.js"];
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
  const script = candidates[0];
  if (!script) return null;

  let expectedOutput: string | null = null;
  try {
    const source = readFileSync(resolve(repoPath, script), "utf8");
    const logMatch = source.match(/console\.log\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    const returnMatch = source.match(/return\s+["'`]([^"'`]+)["'`]/);
    expectedOutput = logMatch?.[1] ?? returnMatch?.[1] ?? null;
  } catch {
    expectedOutput = null;
  }

  const testCandidates = [
    script.replace(/\.js$/, ".test.js"),
    "hello.test.js",
    `${script.replace(/\.js$/, "")}.test.js`,
  ];
  const testFile = testCandidates.find((name) => files.has(name)) ?? null;

  return { script, expectedOutput, testFile };
}

function buildStrangerSeedSteps(repoPath: string | null): Array<{
  title: string;
  description: string;
  acceptanceCriteria: string[];
  parentTitle?: string;
}> {
  const seed = repoPath ? detectSeedEntrypoint(repoPath) : null;
  const script = seed?.script ?? "hello.js";
  const expected = seed?.expectedOutput;
  const testFile = seed?.testFile ?? script.replace(/\.js$/, ".test.js");
  const entryAc = expected
    ? [`node ${script} prints ${expected}`, `file exists: ${script}`]
    : [`node ${script}`, `file exists: ${script}`];
  const pageNeedle = expected ?? "Ready";

  return [
    {
      title: "First stranger slice",
      description:
        "Container for the first verifiable stranger-repo slice. Do not mark done from planning alone. Wait for emperor go before large execution. Acceptance criteria come from disk facts — not invented npm/Express stacks.",
      acceptanceCriteria: [
        "Child steps remain todo until emperor approves execution",
        `README.md documents node ${script} and node --test`,
      ],
    },
    {
      title: "Verify seed entrypoint",
      parentTitle: "First stranger slice",
      description:
        "Confirm the seeded stranger tree entrypoint runs as documented. A human should copy the command from the project README.",
      acceptanceCriteria: entryAc,
    },
    {
      title: "Verify seed tests",
      parentTitle: "First stranger slice",
      description:
        "Confirm the seeded test file passes with the Node built-in test runner. Do not invent npm run build or Express.",
      acceptanceCriteria: ["node --test passes", `file exists: ${testFile}`],
    },
    {
      title: "Add one-page static HTML",
      parentTitle: "First stranger slice",
      description:
        "Add a single static page (index.html) that shows the seeded greeting (or Ready) in the browser. Keep the stack minimal — no invented frameworks. Update README with how a stranger opens the page.",
      acceptanceCriteria: [
        "file exists: index.html",
        `index.html contains ${pageNeedle}`,
        "README.md mentions index.html",
      ],
    },
  ];
}

/**
 * Persist a human-readable multi-step plan as todo work items (no jobs / no done).
 * Stranger file:// seeds: AC derived from disk. Domain first-slice: agnostic deliverable checks.
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

  const intent = args.intent?.trim() || "Propose the first verifiable work slice.";
  const firstSlice = isFirstSlicePlanIntent(intent);
  const fileRepo = project.repositories.find((repo) => repo.url.startsWith("file://"));
  if (!firstSlice && !fileRepo) {
    throw new Error(
      "propose_project_plan needs a stranger file:// project or a first-slice intent on a staffed project.",
    );
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
  const repoPath = fileRepo ? fileURLToPath(fileRepo.url) : null;

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
    : buildStrangerSeedSteps(repoPath);

  const idByTitle = new Map<string, string>();
  const created: Array<{ id: string; title: string; parentId: string | null; status: string }> = [];
  const containerTitle = firstSlice ? "First work slice" : "First stranger slice";

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
        : "Emperor-directed stranger seed plan (no execution started)",
      acceptanceCriteria: step.acceptanceCriteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    idByTitle.set(step.title, id);
    created.push({ id, title: step.title, parentId, status: "todo" });
  }

  const leaves = created.filter((item) => item.title !== containerTitle);
  const seed = repoPath ? detectSeedEntrypoint(repoPath) : null;
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
      : [
          seed?.expectedOutput
            ? `node ${seed.script} prints ${seed.expectedOutput}`
            : `node ${seed?.script ?? "hello.js"}`,
          "node --test",
        ],
    summary: firstSlice
      ? `Proposed ${leaves.length} leaf steps under First work slice for ${project.slug}. All items are todo; no jobs started. Domain-agnostic AC — no invented engineering stack.`
      : `Proposed ${leaves.length} leaf steps under First stranger slice for ${project.slug}. All items are todo; no jobs started. Wait for emperor go before execution.`,
  };
}

export const PROPOSE_PROJECT_PLAN_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_project_plan",
    description:
      "Propose a multi-step plan as todo work items without starting jobs. For stranger file:// projects, derive acceptance checks from disk. For domain staffing, use a domain-agnostic first work slice. Does not mark done, does not modify the Kampaku monorepo. Kampaku only. Never invent npm/CI/OpenAPI AC unless the emperor asked for an engineering stack.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project slug or id (not kampaku).",
        },
        intent: {
          type: "string",
          description:
            "Emperor planning intent, e.g. first work slice covering domain aspects or stranger seed vertical slice with wait-for-go.",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};

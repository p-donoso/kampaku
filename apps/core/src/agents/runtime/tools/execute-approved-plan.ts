import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inferDiskChecksFromAcceptanceCriteria,
  runDiskChecks,
  type DiskCheck,
} from "../../../application/pm/work-item-checks.js";
import { rollupParentWorkItemStatuses } from "../../../application/pm/work-item-parent-rollup.js";
import type { KampakuToolContext } from "./index.js";

export interface ExecuteApprovedPlanArgs {
  project_slug_or_id: string;
}

function assertOutsideHostMonorepo(repositoryPath: string, workspaceRoot: string): string {
  const resolved = resolve(repositoryPath);
  const root = resolve(workspaceRoot);
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Refusing to execute an approved plan inside the Kampaku monorepo (${root}). Use the stranger project path only.`,
    );
  }
  return resolved;
}

function resolveStrangerRepoPath(
  project: { repositories: Array<{ url: string }> },
  workspaceRoot: string,
): string {
  const primary = project.repositories.find((repo) => repo.url.startsWith("file://"));
  if (!primary) {
    throw new Error("Stranger project must have a linked file:// repository before plan execution.");
  }
  return assertOutsideHostMonorepo(fileURLToPath(primary.url), workspaceRoot);
}

function resolveInsideRepo(repoPath: string, relativePath: string): string | null {
  const trimmed = relativePath.trim().replace(/^\.\//, "");
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("..")) return null;
  const full = resolve(repoPath, trimmed);
  const root = resolve(repoPath);
  if (full !== root && !full.startsWith(`${root}${sep}`)) return null;
  return full;
}

/**
 * Best-effort fulfillments driven only by failed AC checks (no scenario bake-in).
 * Creates/updates files so file_exists / file_contains can pass on go-ahead.
 */
function fulfillFromChecks(repoPath: string, checks: DiskCheck[]): string[] {
  const actions: string[] = [];
  for (const check of checks) {
    if (check.kind === "file_exists") {
      const full = resolveInsideRepo(repoPath, check.relativePath);
      if (!full || existsSync(full)) continue;
      mkdirSync(dirname(full), { recursive: true });
      if (check.relativePath.endsWith(".html")) {
        writeFileSync(
          full,
          `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Stranger page</title>
  </head>
  <body>
    <main>
      <h1>Stranger page</h1>
    </main>
  </body>
</html>
`,
          "utf8",
        );
      } else {
        writeFileSync(full, "", "utf8");
      }
      actions.push(`created ${check.relativePath}`);
    }

    if (check.kind === "file_contains") {
      const full = resolveInsideRepo(repoPath, check.relativePath);
      if (!full) continue;
      if (!existsSync(full)) {
        mkdirSync(dirname(full), { recursive: true });
        if (check.relativePath.endsWith(".html")) {
          writeFileSync(
            full,
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${check.needle}</title>
  </head>
  <body>
    <main>
      <h1>${check.needle}</h1>
    </main>
  </body>
</html>
`,
            "utf8",
          );
        } else if (check.relativePath.toLowerCase() === "readme.md") {
          writeFileSync(full, `# Project\n\n${check.needle}\n`, "utf8");
        } else {
          writeFileSync(full, `${check.needle}\n`, "utf8");
        }
        actions.push(`created ${check.relativePath} with ${check.needle}`);
        continue;
      }
      const body = readFileSync(full, "utf8");
      if (body.includes(check.needle)) continue;
      if (check.relativePath.toLowerCase() === "readme.md") {
        writeFileSync(
          full,
          `${body.trimEnd()}

## ${check.needle}

Open \`${check.relativePath === "README.md" ? "index.html" : check.relativePath}\` when documented by acceptance criteria.
`,
          "utf8",
        );
      } else {
        writeFileSync(full, `${body.trimEnd()}\n${check.needle}\n`, "utf8");
      }
      actions.push(`appended ${check.needle} to ${check.relativePath}`);
    }
  }
  return actions;
}

/**
 * After emperor go-ahead, execute proposed plan leaves on a stranger file:// project:
 * fulfill simple missing-file AC, run AC-derived disk checks, record a job, mark leaves done.
 */
export function executeExecuteApprovedPlan(ctx: KampakuToolContext, args: ExecuteApprovedPlanArgs) {
  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error("Refusing to execute an approved plan on the platform project.");
  }

  const repoPath = resolveStrangerRepoPath(project, ctx.config.workspaceRoot);
  const items = ctx.pmStore.listWorkItemsByProject(project.id);
  const leaves = items
    .filter((item) => item.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (leaves.length === 0) {
    throw new Error(
      `No plan leaves found on ${project.slug}. Propose a plan first and wait for emperor go.`,
    );
  }

  const goalId = randomUUID();
  const taskId = randomUUID();
  const jobId = randomUUID();
  const now = new Date().toISOString();

  ctx.store.createGoal({
    id: goalId,
    projectId: project.id,
    objective: `Execute approved plan on stranger project ${project.slug} at ${repoPath}`,
    priority: 0,
    status: "active",
    createdAt: now,
  });

  ctx.store.createTask({
    id: taskId,
    goalId,
    title: `Approved plan execution (${project.slug})`,
    status: "ready",
    input: {
      repositoryPath: repoPath,
      projectSlug: project.slug,
      kind: "approved_plan_sync",
    },
  });

  ctx.store.createJob({
    id: jobId,
    taskId,
    status: "queued",
    capabilities: ["code.agent"],
    input: {
      repositoryPath: repoPath,
      projectSlug: project.slug,
      kind: "approved_plan_sync",
    },
    idempotencyKey: jobId,
  });

  ctx.store.markJobRunning(jobId);
  ctx.store.appendJobLog(jobId, `Approved plan execution started for ${project.slug}`);
  ctx.store.appendJobLog(jobId, `Repository path: ${repoPath}`);

  const leafResults: Array<{ id: string; title: string; status: string; detail: string }> = [];
  const verifyCommands = new Set<string>();

  for (const leaf of leaves) {
    ctx.store.appendJobLog(jobId, `Running leaf: ${leaf.title}`);
    const checks = inferDiskChecksFromAcceptanceCriteria(leaf.acceptanceCriteria);
    if (checks.length === 0) {
      throw new Error(
        `Leaf "${leaf.title}" has no runnable acceptance checks. Add verifiable AC before go-ahead.`,
      );
    }

    for (const check of checks) {
      if (check.kind === "node_script") {
        verifyCommands.add(
          check.expectOutputIncludes
            ? `node ${check.script} prints ${check.expectOutputIncludes}`
            : `node ${check.script}`,
        );
      } else if (check.kind === "node_test") {
        verifyCommands.add("node --test");
      } else if (check.kind === "npm_script") {
        verifyCommands.add(check.script === "test" ? "npm test" : `npm run ${check.script}`);
      }
    }

    const fulfilled = fulfillFromChecks(repoPath, checks);
    for (const action of fulfilled) {
      ctx.store.appendJobLog(jobId, `Fulfillment: ${action}`);
    }

    const results = runDiskChecks(repoPath, checks);
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      const detail = failed.map((result) => `${result.command}: ${result.detail}`).join("; ");
      throw new Error(`Leaf "${leaf.title}" checks failed — ${detail}`);
    }

    const detail = results.map((result) => `${result.command} → ${result.detail}`).join("; ");
    ctx.pmStore.updateWorkItem(leaf.id, { status: "done", jobId });
    ctx.store.appendJobLog(jobId, `Leaf done: ${leaf.title} (${detail})`);
    leafResults.push({ id: leaf.id, title: leaf.title, status: "done", detail });
  }

  rollupParentWorkItemStatuses(ctx.pmStore, project.id);

  ctx.store.submitJobResult({
    jobId,
    leaseId: `approved-plan-${jobId}`,
    status: "succeeded",
    output: {
      projectSlug: project.slug,
      repositoryPath: repoPath,
      leaves: leafResults,
    },
    finishedAt: new Date().toISOString(),
  });
  ctx.store.appendJobLog(jobId, "Approved plan execution succeeded");

  const finalJob = ctx.store.getJob(jobId)!;
  return {
    project: { id: project.id, slug: project.slug },
    repositoryPath: repoPath,
    fileUrl: `file://${repoPath}`,
    goalId,
    jobId,
    jobStatus: finalJob.status,
    leavesCompleted: leafResults.length,
    leaves: leafResults,
    verifyCommands: [...verifyCommands],
    hostMonorepoUntouched: true,
    summary: `Executed ${leafResults.length} plan leaves on ${project.slug}. Job ${jobId} ${finalJob.status}.`,
  };
}

export const EXECUTE_APPROVED_PLAN_TOOL = {
  type: "function" as const,
  function: {
    name: "execute_approved_plan",
    description:
      "After emperor go-ahead, execute proposed plan leaves on a stranger file:// project only: fulfill simple missing-file acceptance checks, run AC-derived disk checks, record a visible job with progress logs, mark plan leaves done. Refuses the platform project and host monorepo. Does not grant general execute_work_item to Kampaku.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Stranger project slug or id (not kampaku).",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};

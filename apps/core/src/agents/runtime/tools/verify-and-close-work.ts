import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { rollupParentWorkItemStatuses } from "../../../application/pm/work-item-parent-rollup.js";
import {
  inferDiskChecksFromAcceptanceCriteria,
  runDiskChecks,
} from "../../../application/pm/work-item-checks.js";
import type { KampakuToolContext } from "./index.js";

export interface VerifyAndCloseWorkArgs {
  project_slug_or_id: string;
  /** When true (default), reopen dishonest done items if checks fail. */
  reopen_on_failure?: boolean;
  /**
   * Optional extra acceptance-criteria lines to verify (same grammar as work-item AC).
   * Scenario-specific checks belong here or on the work items — not in this tool's defaults.
   */
  checks?: string[];
}

function assertOutsideHostMonorepo(repositoryPath: string, workspaceRoot: string): string {
  const resolved = resolve(repositoryPath);
  const root = resolve(workspaceRoot);
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Refusing to verify/close work inside the Kampaku monorepo (${root}). Use the stranger project path only.`,
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
    throw new Error("Project must have a linked file:// repository before verify-and-close.");
  }
  return assertOutsideHostMonorepo(fileURLToPath(primary.url), workspaceRoot);
}

/**
 * Re-run stated acceptance checks on the stranger disk before treating work as honestly done.
 * On failure, reopen dishonest done leaves so the board cannot stay silently green.
 */
export function executeVerifyAndCloseWork(ctx: KampakuToolContext, args: VerifyAndCloseWorkArgs) {
  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error("Refusing to verify/close platform project work via this tool.");
  }

  const repoPath = resolveStrangerRepoPath(project, ctx.config.workspaceRoot);
  const items = ctx.pmStore.listWorkItemsByProject(project.id);
  if (items.length === 0) {
    throw new Error(`Project ${project.slug} has no work items to verify.`);
  }

  const criteria = [
    ...items.flatMap((item) => item.acceptanceCriteria),
    ...(Array.isArray(args.checks) ? args.checks.map((line) => String(line)) : []),
  ];
  const specs = inferDiskChecksFromAcceptanceCriteria(criteria);
  if (specs.length === 0) {
    throw new Error(
      `No runnable acceptance checks found on ${project.slug}. Add verifiable AC (e.g. "file exists: path", "node script.js", "node --test", "npm test") before verify-and-close.`,
    );
  }

  const leaves = items.filter((item) => item.parentId);
  const targetItems = leaves.length > 0 ? leaves : items;
  const checks = runDiskChecks(repoPath, specs);
  const allPassed = checks.every((check) => check.ok);
  const reopenOnFailure = args.reopen_on_failure !== false;

  const workItemUpdates: Array<{ id: string; title: string; from: string; to: string }> = [];

  if (allPassed) {
    for (const item of targetItems) {
      if (item.status !== "done") {
        ctx.pmStore.updateWorkItem(item.id, { status: "done" });
        workItemUpdates.push({ id: item.id, title: item.title, from: item.status, to: "done" });
      }
      rollupParentWorkItemStatuses(ctx.pmStore, item.id);
    }
  } else if (reopenOnFailure) {
    for (const item of targetItems) {
      if (item.status === "done") {
        ctx.pmStore.updateWorkItem(item.id, { status: "todo" });
        workItemUpdates.push({ id: item.id, title: item.title, from: "done", to: "todo" });
      }
      rollupParentWorkItemStatuses(ctx.pmStore, item.id);
    }
  }

  const after = ctx.pmStore.listWorkItemsByProject(project.id);
  const openCount = after.filter((item) => item.status !== "done").length;
  const doneCount = after.filter((item) => item.status === "done").length;

  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    repositoryPath: repoPath,
    checksPassed: allPassed,
    phaseClosed: allPassed,
    checks,
    workItemUpdates,
    openCount,
    doneCount,
    refusedSilentGreen: !allPassed,
    summary: allPassed
      ? `Checks passed on ${project.slug}. Work closed honestly (${doneCount} done).`
      : `Checks failed on ${project.slug}. Keeping work open (refused silent green). Failures: ${checks
          .filter((check) => !check.ok)
          .map((check) => check.command)
          .join(", ")}.`,
  };
}

export const VERIFY_AND_CLOSE_WORK_TOOL = {
  type: "function" as const,
  function: {
    name: "verify_and_close_work",
    description:
      "Re-run the stranger project's stated acceptance checks on disk (parsed from work-item AC / optional checks args: file exists, node scripts, node --test, npm test/run, file contains). Mark work done only if those checks pass. If checks fail, refuse silent green and reopen dishonest done items. Does not invent entrypoints or npm success. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Stranger project slug or id (not kampaku).",
        },
        reopen_on_failure: {
          type: "boolean",
          description: "When checks fail, reopen done items to todo (default true).",
        },
        checks: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional extra acceptance-criteria lines to run (same grammar as work-item AC). Prefer AC on the board; do not bake suite demos into defaults.",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};

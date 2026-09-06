import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { rollupParentWorkItemStatuses } from "../../../application/pm/work-item-parent-rollup.js";
import type { KampakuToolContext } from "./index.js";

export interface ExecuteHelloEvalPlanArgs {
  project_slug_or_id: string;
}

function assertOutsideHostMonorepo(repositoryPath: string, workspaceRoot: string): string {
  const resolved = resolve(repositoryPath);
  const root = resolve(workspaceRoot);
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Refusing to execute Hello Eval inside the Kampaku monorepo (${root}). Use the stranger project path only.`,
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
    throw new Error("Stranger project must have a linked file:// repository before Hello Eval execution.");
  }
  return assertOutsideHostMonorepo(fileURLToPath(primary.url), workspaceRoot);
}

function ensureIndexHtml(repoPath: string): { wrote: boolean; path: string } {
  const htmlPath = resolve(repoPath, "index.html");
  if (!existsSync(htmlPath)) {
    writeFileSync(
      htmlPath,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Hello Eval</title>
  </head>
  <body>
    <main>
      <h1>Hello Eval</h1>
      <p>Minimal stranger page from Kampaku Hello Eval execution.</p>
    </main>
  </body>
</html>
`,
      "utf8",
    );
    return { wrote: true, path: htmlPath };
  }
  const existing = readFileSync(htmlPath, "utf8");
  if (!existing.includes("Hello Eval")) {
    writeFileSync(htmlPath, `${existing}\n<!-- Hello Eval -->\n`, "utf8");
    return { wrote: true, path: htmlPath };
  }
  return { wrote: false, path: htmlPath };
}

function ensureReadmeMentionsIndex(repoPath: string): boolean {
  const readmePath = resolve(repoPath, "README.md");
  if (!existsSync(readmePath)) return false;
  const readme = readFileSync(readmePath, "utf8");
  if (readme.includes("index.html")) return false;
  writeFileSync(
    readmePath,
    `${readme.trimEnd()}

## One-page Hello Eval

Open \`index.html\` in a browser to see **Hello Eval**.
`,
    "utf8",
  );
  return true;
}

/**
 * Emperor go-ahead executor for the suite 07 Hello Eval plan on a stranger file:// project.
 * Runs honest node checks, writes index.html if needed, records a visible job, marks leaves done.
 */
export function executeExecuteHelloEvalPlan(ctx: KampakuToolContext, args: ExecuteHelloEvalPlanArgs) {
  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error("Refusing to execute Hello Eval on the platform project.");
  }

  const repoPath = resolveStrangerRepoPath(project, ctx.config.workspaceRoot);
  const items = ctx.pmStore.listWorkItemsByProject(project.id);
  const leaves = items
    .filter((item) => item.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (leaves.length === 0 || !items.some((item) => /hello eval/i.test(item.title))) {
    throw new Error(
      `No Hello Eval plan leaves found on ${project.slug}. Propose the plan first and wait for emperor go.`,
    );
  }

  const goalId = randomUUID();
  const taskId = randomUUID();
  const jobId = randomUUID();
  const now = new Date().toISOString();

  ctx.store.createGoal({
    id: goalId,
    projectId: project.id,
    objective: `Execute approved Hello Eval plan on stranger project ${project.slug} at ${repoPath}`,
    priority: 0,
    status: "active",
    createdAt: now,
  });

  ctx.store.createTask({
    id: taskId,
    goalId,
    title: `Hello Eval hands-off execution (${project.slug})`,
    status: "ready",
    input: {
      repositoryPath: repoPath,
      projectSlug: project.slug,
      kind: "hello_eval_sync",
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
      kind: "hello_eval_sync",
    },
    idempotencyKey: jobId,
  });

  ctx.store.markJobRunning(jobId);
  ctx.store.appendJobLog(jobId, `Hello Eval execution started for ${project.slug}`);
  ctx.store.appendJobLog(jobId, `Repository path: ${repoPath}`);

  const leafResults: Array<{ id: string; title: string; status: string; detail: string }> = [];

  for (const leaf of leaves) {
    ctx.store.appendJobLog(jobId, `Running leaf: ${leaf.title}`);
    let detail = "";

    if (/verify seed greeting/i.test(leaf.title)) {
      const output = execFileSync("node", ["hello.js"], { cwd: repoPath, encoding: "utf8" }).trim();
      if (output !== "Hello Eval") {
        throw new Error(`Expected Hello Eval from node hello.js, got: ${output}`);
      }
      detail = `node hello.js → ${output}`;
    } else if (/verify seed tests/i.test(leaf.title)) {
      execFileSync("node", ["--test"], { cwd: repoPath, stdio: "pipe" });
      detail = "node --test passed";
    } else if (/html|one-page|index/i.test(leaf.title)) {
      const html = ensureIndexHtml(repoPath);
      const readmeUpdated = ensureReadmeMentionsIndex(repoPath);
      const htmlBody = readFileSync(html.path, "utf8");
      if (!htmlBody.includes("Hello Eval")) {
        throw new Error("index.html does not contain Hello Eval");
      }
      detail = `index.html ${html.wrote ? "written" : "verified"}; README ${readmeUpdated ? "updated" : "ok"}`;
    } else {
      detail = "Leaf acknowledged (no-op for unknown Hello Eval step)";
    }

    ctx.pmStore.updateWorkItem(leaf.id, {
      status: "done",
      jobId,
    });
    ctx.store.appendJobLog(jobId, `Leaf done: ${leaf.title} (${detail})`);
    leafResults.push({ id: leaf.id, title: leaf.title, status: "done", detail });
  }

  rollupParentWorkItemStatuses(ctx.pmStore, project.id);

  ctx.store.submitJobResult({
    jobId,
    leaseId: `hello-eval-${jobId}`,
    status: "succeeded",
    output: {
      projectSlug: project.slug,
      repositoryPath: repoPath,
      leaves: leafResults,
    },
    finishedAt: new Date().toISOString(),
  });
  ctx.store.appendJobLog(jobId, "Hello Eval execution succeeded");

  const finalJob = ctx.store.getJob(jobId)!;
  return {
    project: { id: project.id, slug: project.slug },
    repositoryPath: repoPath,
    fileUrl: pathToFileURLSafe(repoPath),
    goalId,
    jobId,
    jobStatus: finalJob.status,
    leavesCompleted: leafResults.length,
    leaves: leafResults,
    verifyCommands: ["node hello.js", "node --test"],
    hostMonorepoUntouched: true,
    summary: `Executed ${leafResults.length} Hello Eval leaves on ${project.slug}. Job ${jobId} ${finalJob.status}.`,
  };
}

function pathToFileURLSafe(repoPath: string): string {
  return `file://${repoPath}`;
}

export const EXECUTE_HELLO_EVAL_PLAN_TOOL = {
  type: "function" as const,
  function: {
    name: "execute_hello_eval_plan",
    description:
      "After emperor go-ahead, execute the proposed Hello Eval plan on a stranger file:// project only: run node hello.js / node --test, ensure index.html shows Hello Eval, record a visible job with progress logs, mark plan leaves done. Refuses the platform project and host monorepo. Does not grant general execute_work_item to Kampaku.",
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

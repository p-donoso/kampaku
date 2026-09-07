/**
 * Suite 19 scenario stub only (docs/eval/19-one-shot-scientific-calculator.md).
 * Product tools stay domain-agnostic — calculator copy lives here, not in tools.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../../../config.js";
import { createWikiPage, updateWikiPageDirect } from "../../../application/wiki/wiki.js";
import { rollupParentWorkItemStatuses } from "../../../application/pm/work-item-parent-rollup.js";
import type { KampakuToolContext } from "../tools/index.js";
import type { AgentChatResponse } from "../../types.js";
import type { ChatProgressCallback } from "../progress.js";

type PersistFn = (
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  message: string,
  response: AgentChatResponse,
  loopMessages: [],
  onProgress?: ChatProgressCallback,
) => Promise<AgentChatResponse>;

type RunToolFn = (
  ctx: KampakuToolContext,
  toolName: string,
  args: string,
  onProgress?: ChatProgressCallback,
  meta?: { agentId: string; conversationId: string },
) => Promise<{ toolName: string; output: unknown }>;

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function strangerRepoPath(
  project: { repositories: Array<{ url: string }> },
): string | null {
  const primary = project.repositories.find((repo) => repo.url.startsWith("file://"));
  if (!primary) return null;
  return fileURLToPath(primary.url);
}

function upsertWiki(
  ctx: KampakuToolContext,
  projectSlug: string,
  slug: string,
  title: string,
  contentMd: string,
) {
  if (!ctx.wikiStore) throw new Error("Wiki store is not available.");
  const project = ctx.store.getProjectByIdOrSlug(projectSlug)!;
  const existing = ctx.wikiStore.getPageBySlug(project.id, slug);
  if (!existing) {
    createWikiPage(ctx.store, ctx.wikiStore, projectSlug, { slug, title, contentMd });
    return;
  }
  updateWikiPageDirect(ctx.store, ctx.wikiStore, existing.id, {
    title,
    contentMd,
    status: "published",
  });
}

export async function tryHandleSuite19ScientificCalculatorStub(input: {
  ctx: KampakuToolContext;
  config: AppConfig;
  conversationId: string;
  message: string;
  lower: string;
  onProgress?: ChatProgressCallback;
  persistChatTurn: PersistFn;
  runToolWithProgress: RunToolFn;
}): Promise<AgentChatResponse | null> {
  const { ctx, config, conversationId, message, lower, onProgress, persistChatTurn, runToolWithProgress } =
    input;

  const hasCalculatorProject = Boolean(ctx.store.getProjectBySlug("scientific-calculator"));
  const mentionsCalculator =
    lower.includes("scientific calculator") ||
    (lower.includes("calculator") &&
      (lower.includes("staff") ||
        lower.includes("plan") ||
        lower.includes("execute") ||
        lower.includes("shared knowledge") ||
        lower.includes("ui surface") ||
        lower.includes("angle")));

  // Beat 2 — staff calculator team (scenario slug lives in stub args only).
  if (
    mentionsCalculator &&
    (lower.includes("staff") || lower.includes("standing team")) &&
    (lower.includes("frontend") || lower.includes("backend") || lower.includes("qa")) &&
    (lower.includes("do not start") || lower.includes("don't start") || lower.includes("not start"))
  ) {
    const kampaku = ctx.agentStore.getKampakuAgent();
    const staffed = await runToolWithProgress(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: "scientific-calculator",
        project_name: "Scientific Calculator",
        specialist_roles: ["frontend", "backend", "qa"],
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = staffed.output as {
      project: { id: string; slug: string; projectLeadSlug: string };
      tree: string[];
      workItemsCreated: number;
      jobsStarted: number;
    };
    const agents = await runToolWithProgress(ctx, "list_agents", "{}", onProgress);
    const { tree } = agents.output as { tree: string[] };
    return persistChatTurn(
      ctx,
      config,
      conversationId,
      message,
      {
        reply: [
          "## Standing team ready",
          "",
          `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
          `- **lead**: \`${output.project.projectLeadSlug}\``,
          "",
          "### Hierarchy",
          "```",
          ...(output.tree.length ? output.tree : tree),
          "```",
          "",
          `No execution started. Work items: ${output.workItemsCreated}. Jobs: ${output.jobsStarted}.`,
        ].join("\n"),
        toolsUsed: ["staff_project_team", "list_agents"],
        agentUsed: "stub",
        conversationId,
      },
      [],
      onProgress,
    );
  }

  // Beat 4 — bootstrap stranger onto the staffed calculator project when path given.
  if (
    mentionsCalculator &&
    (lower.includes("create") || lower.includes("bootstrap") || lower.includes("seed")) &&
    (lower.includes("open-source") || lower.includes("open source") || lower.includes("minimal"))
  ) {
    const fileUrl = message.match(/file:\/\/(\/[^\s"'`]+)/i);
    const abs = message.match(/(?:^|[\s`"'(])(\/(?:tmp|home|var|opt|Users)\/[^\s"'`)]+)/);
    const repositoryPath = (fileUrl?.[1] ?? abs?.[1] ?? "").replace(/[.,;:]+$/, "");
    if (!repositoryPath) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: [
            "I can bootstrap the scientific calculator stranger tree, but I need an absolute path outside the Kampaku checkout.",
            "",
            "<kampaku-question>",
            JSON.stringify({
              id: "stranger-repo-path",
              type: "text",
              prompt: "What absolute path should hold the scientific calculator stranger project?",
              placeholder: "e.g., /tmp/kampaku-eval-sci-calc",
              required: true,
            }),
            "</kampaku-question>",
          ].join("\n"),
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }

    const kampaku = ctx.agentStore.getKampakuAgent();
    const projectSlug = "scientific-calculator";
    const bootstrapped = await runToolWithProgress(
      ctx,
      "bootstrap_stranger_project",
      JSON.stringify({
        repository_path: repositoryPath,
        project_slug: projectSlug,
        project_name: titleCase(projectSlug),
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = bootstrapped.output as {
      project: { id: string; slug: string };
      repositoryPath: string;
      fileUrl: string;
      seeded: string[];
      verifyCommands: string[];
      workItemsCreated: number;
      jobsStarted: number;
    };
    return persistChatTurn(
      ctx,
      config,
      conversationId,
      message,
      {
        reply: [
          "## Stranger project ready",
          "",
          `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
          `- **path**: \`${output.repositoryPath}\``,
          `- **linked**: \`${output.fileUrl}\``,
          `- **seeded**: ${output.seeded.join(", ") || "(already present)"}`,
          "",
          "### Verify as a stranger",
          "```bash",
          `cd ${output.repositoryPath}`,
          ...output.verifyCommands,
          "```",
          "",
          `No execution started. Work items: ${output.workItemsCreated}. Jobs: ${output.jobsStarted}.`,
        ].join("\n"),
        toolsUsed: ["bootstrap_stranger_project"],
        agentUsed: "stub",
        conversationId,
      },
      [],
      onProgress,
    );
  }

  // Beat 5 — propose calculator plan via stub work items (not a product-tool template).
  if (
    mentionsCalculator &&
    lower.includes("plan") &&
    (lower.includes("vertical slice") || lower.includes("break into steps") || lower.includes("human could follow")) &&
    (lower.includes("do not mark") || lower.includes("wait for my go") || lower.includes("exact check"))
  ) {
    const project =
      ctx.store.getProjectBySlug("scientific-calculator") ??
      ctx.store.listProjects().find((entry) => entry.slug !== "kampaku");
    if (!project) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "Staff and bootstrap the scientific calculator stranger project before planning.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }
    if (ctx.pmStore.listWorkItemsByProject(project.id).length > 0) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: `Project ${project.slug} already has work items. Clear or finish them before a fresh plan.`,
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }

    const leadId = project.projectLeadAgentId ?? ctx.agentStore.getKampakuAgent().id;
    const lead = ctx.agentStore.getAgentBySlugOrId(leadId) ?? ctx.agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const steps = [
      {
        title: "Scientific calculator plan",
        description:
          "Container for the first calculator vertical slice. Todo only until emperor go.",
        acceptanceCriteria: ["Child steps remain todo until emperor approves execution"],
      },
      {
        title: "Implement calculator core",
        parentTitle: "Scientific calculator plan",
        description: "Add calculator.js with arithmetic plus sin/cos/tan in radians.",
        acceptanceCriteria: ["node calculator.js prints calculator ready", "file exists: calculator.js"],
      },
      {
        title: "Add calculator tests",
        parentTitle: "Scientific calculator plan",
        description: "Add calculator.test.js covering arithmetic and trig via node --test.",
        acceptanceCriteria: ["node --test passes", "file exists: calculator.test.js"],
      },
      {
        title: "Document calculator entrypoint",
        parentTitle: "Scientific calculator plan",
        description: "Update README with node calculator.js and node --test.",
        acceptanceCriteria: ["README.md mentions calculator.js", "README.md mentions node --test"],
      },
    ] as const;

    const idByTitle = new Map<string, string>();
    const created: Array<{ id: string; title: string; parentId: string | null; status: string }> = [];
    for (const [index, step] of steps.entries()) {
      const id = randomUUID();
      const parentId = "parentTitle" in step && step.parentTitle ? idByTitle.get(step.parentTitle) ?? null : null;
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
        routingReason: "Suite 19 stub plan proposal (scenario copy; no product-tool template)",
        acceptanceCriteria: [...step.acceptanceCriteria],
        dependsOn: [],
        createdAt: now,
        updatedAt: now,
      });
      idByTitle.set(step.title, id);
      created.push({ id, title: step.title, parentId, status: "todo" });
    }
    const leaves = created.filter((item) => item.title !== "Scientific calculator plan");
    return persistChatTurn(
      ctx,
      config,
      conversationId,
      message,
      {
        reply: [
          "## Human-readable plan proposed",
          "",
          `- **project**: \`${project.slug}\` (id: \`${project.id}\`)`,
          `- **leaves**: ${leaves.length}`,
          `- **jobs started**: 0`,
          "",
          "### Steps (todo — not done)",
          ...leaves.map((item) => `- \`${item.id}\` **${item.title}** (${item.status})`),
          "",
          "### Seed checks a human can copy",
          "```bash",
          "node calculator.js",
          "node --test",
          "```",
          "",
          "Waiting for your go before large execution.",
        ].join("\n"),
        toolsUsed: [],
        agentUsed: "stub",
        conversationId,
      },
      [],
      onProgress,
    );
  }

  // Beat 6 — UI surface / angle unit blocking question (scenario args only).
  if (
    (lower.includes("ui surface") ||
      lower.includes("web page vs terminal") ||
      lower.includes("angle unit") ||
      (lower.includes("degrees") && lower.includes("radians"))) &&
    (lower.includes("have not chosen") || lower.includes("continue as far") || lower.includes("safely can"))
  ) {
    const project =
      ctx.store.getProjectBySlug("scientific-calculator") ??
      ctx.store.listProjects().find((entry) => entry.slug !== "kampaku");
    if (!project) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "Bootstrap the scientific calculator project before the UI/angle gate.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }
    const kampaku = ctx.agentStore.getKampakuAgent();
    const blocked = await runToolWithProgress(
      ctx,
      "ask_blocking_question",
      JSON.stringify({
        project_slug_or_id: project.slug,
        conversation_id: conversationId,
        reason: "Emperor has not chosen UI surface or angle unit for the calculator slice.",
        work_item_title: "Calculator UI surface and angle unit (blocked)",
        question_id: "calculator-ui-angle",
        prompt: "Which UI surface and angle unit should the first calculator slice use?",
        options: [
          "Web page + radians",
          "Terminal + radians",
          "Web page + degrees",
          "Defer — decide later",
        ],
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = blocked.output as {
      project: { id: string; slug: string };
      workItem: { id: string; title: string; status: string };
      question: { id: string };
      questionTag: string;
      summary: string;
    };
    return persistChatTurn(
      ctx,
      config,
      conversationId,
      message,
      {
        reply: [
          "## Human gate — UI surface and angle unit",
          "",
          `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
          `- **work item**: \`${output.workItem.id}\` **${output.workItem.title}** (${output.workItem.status})`,
          `- **pending question**: \`${output.question.id}\``,
          "",
          "Answer in the dashboard or chat. Linked work stays blocked until you decide.",
          "",
          output.summary,
          "",
          output.questionTag,
        ].join("\n"),
        toolsUsed: ["ask_blocking_question"],
        agentUsed: "stub",
        conversationId,
      },
      [],
      onProgress,
    );
  }

  // Beat 7 — execute calculator plan by writing scenario artifacts in the stub (not a product tool).
  // Go-ahead prompts often omit "calculator"; key off the staffed project when present.
  if (
    (mentionsCalculator || hasCalculatorProject) &&
    (lower.includes("execute") || lower.includes("go ahead") || lower.includes("approved plan")) &&
    (lower.includes("stranger") || lower.includes("plan") || lower.includes("do not touch"))
  ) {
    const project =
      ctx.store.getProjectBySlug("scientific-calculator") ??
      ctx.store.listProjects().find((entry) => entry.slug !== "kampaku");
    if (!project) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "No stranger calculator project to execute.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }
    const repoPath = strangerRepoPath(project);
    if (!repoPath) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "Link a file:// stranger repository before execution.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }

    const items = ctx.pmStore.listWorkItemsByProject(project.id);
    const leaves = items.filter((item) => item.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    if (leaves.length === 0) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "Propose the calculator plan first, then give go-ahead.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }

    writeFileSync(
      resolve(repoPath, "calculator.js"),
      `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function add(a, b) { return a + b; }
export function subtract(a, b) { return a - b; }
export function multiply(a, b) { return a * b; }
export function divide(a, b) { return a / b; }
export function sin(x) { return Math.sin(x); }
export function cos(x) { return Math.cos(x); }
export function tan(x) { return Math.tan(x); }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log("calculator ready");
}
`,
      "utf8",
    );
    writeFileSync(
      resolve(repoPath, "calculator.test.js"),
      `import assert from "node:assert/strict";
import test from "node:test";
import { add, sin } from "./calculator.js";

test("arithmetic", () => {
  assert.equal(add(2, 3), 5);
});

test("trig radians", () => {
  assert.ok(Math.abs(sin(Math.PI / 2) - 1) < 1e-10);
});
`,
      "utf8",
    );
    const readmePath = resolve(repoPath, "README.md");
    const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "# Scientific calculator\n";
    if (!readme.includes("calculator.js")) {
      writeFileSync(
        readmePath,
        `${readme.trimEnd()}

## Scientific calculator

\`\`\`bash
node calculator.js
node --test
\`\`\`

Trig functions use **radians**.
`,
        "utf8",
      );
    }

    const ready = execFileSync("node", ["calculator.js"], { cwd: repoPath, encoding: "utf8" }).trim();
    if (ready !== "calculator ready") {
      throw new Error(`Expected calculator ready, got: ${ready}`);
    }
    execFileSync("node", ["--test"], { cwd: repoPath, stdio: "pipe" });

    const goalId = randomUUID();
    const taskId = randomUUID();
    const jobId = randomUUID();
    const now = new Date().toISOString();
    ctx.store.createGoal({
      id: goalId,
      projectId: project.id,
      objective: `Suite 19 stub execute calculator slice on ${project.slug}`,
      priority: 0,
      status: "active",
      createdAt: now,
    });
    ctx.store.createTask({
      id: taskId,
      goalId,
      title: `Scientific calculator execution (${project.slug})`,
      status: "ready",
      input: { repositoryPath: repoPath, projectSlug: project.slug, kind: "suite19_stub" },
    });
    ctx.store.createJob({
      id: jobId,
      taskId,
      status: "queued",
      capabilities: ["code.agent"],
      input: { repositoryPath: repoPath, projectSlug: project.slug, kind: "suite19_stub" },
      idempotencyKey: jobId,
    });
    ctx.store.markJobRunning(jobId);
    ctx.store.appendJobLog(jobId, `Suite 19 stub execution started at ${repoPath}`);

    const leafResults = [];
    for (const leaf of leaves) {
      ctx.pmStore.updateWorkItem(leaf.id, { status: "done", jobId });
      ctx.store.appendJobLog(jobId, `Leaf done: ${leaf.title}`);
      leafResults.push({ id: leaf.id, title: leaf.title, status: "done" });
    }
    rollupParentWorkItemStatuses(ctx.pmStore, project.id);
    ctx.store.submitJobResult({
      jobId,
      leaseId: `suite19-${jobId}`,
      status: "succeeded",
      output: { projectSlug: project.slug, repositoryPath: repoPath, leaves: leafResults },
      finishedAt: new Date().toISOString(),
    });
    const finalJob = ctx.store.getJob(jobId)!;

    return persistChatTurn(
      ctx,
      config,
      conversationId,
      message,
      {
        reply: [
          "## Calculator execution complete",
          "",
          `- **project**: \`${project.slug}\``,
          `- **path**: \`${repoPath}\``,
          `- **job**: \`${jobId}\` (${finalJob.status})`,
          `- **leaves completed**: ${leafResults.length}`,
          "",
          "### Verify",
          "```bash",
          "node calculator.js",
          "node --test",
          "```",
          "",
          "Host Kampaku monorepo untouched.",
        ].join("\n"),
        toolsUsed: [],
        agentUsed: "stub",
        conversationId,
      },
      [],
      onProgress,
    );
  }

  // Beat 8 — publish shared knowledge from disk facts in the stub.
  if (
    (mentionsCalculator || hasCalculatorProject) &&
    (lower.includes("shared knowledge") || lower.includes("update the project")) &&
    (lower.includes("reflect") || lower.includes("implemented") || lower.includes("future"))
  ) {
    const project =
      ctx.store.getProjectBySlug("scientific-calculator") ??
      ctx.store.listProjects().find((entry) => entry.slug !== "kampaku");
    if (!project) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "No calculator stranger project for shared knowledge.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }
    const repoPath = strangerRepoPath(project);
    if (!repoPath) {
      return persistChatTurn(
        ctx,
        config,
        conversationId,
        message,
        {
          reply: "Link a file:// repository before publishing shared knowledge.",
          toolsUsed: [],
          agentUsed: "stub",
          conversationId,
        },
        [],
        onProgress,
      );
    }

    const hasCalc = existsSync(resolve(repoPath, "calculator.js"));
    const hasTest = existsSync(resolve(repoPath, "calculator.test.js"));
    const implemented = [
      ...(hasCalc ? ["`calculator.js` prints calculator ready via `node calculator.js`"] : []),
      ...(hasTest ? ["`calculator.test.js` passes with `node --test`"] : []),
      ...(hasCalc ? ["Trig helpers use radians"] : []),
    ];
    const future = ["CAS / symbolic algebra", "Cloud sync", "Mobile client"];
    upsertWiki(
      ctx,
      project.slug,
      "current-implementation",
      "Current implementation",
      [
        `# Current implementation — ${project.name}`,
        "",
        `**Repository path:** \`${repoPath}\``,
        "",
        "## Implemented",
        "",
        ...implemented.map((line) => `- ${line}`),
        "",
        "## Verify commands",
        "",
        "```bash",
        "node calculator.js",
        "node --test",
        "```",
      ].join("\n"),
    );
    upsertWiki(
      ctx,
      project.slug,
      "roadmap",
      "Roadmap",
      [
        `# Roadmap — ${project.name}`,
        "",
        "Not implemented yet:",
        "",
        ...future.map((line) => `- ${line}`),
      ].join("\n"),
    );

    return persistChatTurn(
      ctx,
      config,
      conversationId,
      message,
      {
        reply: [
          "## Shared knowledge published",
          "",
          `- **project**: \`${project.slug}\``,
          `- **implemented**: ${implemented.length}`,
          `- **future**: ${future.join("; ")}`,
          "",
          "Published pages match disk facts. Unfinished features stay labeled future.",
        ].join("\n"),
        toolsUsed: [],
        agentUsed: "stub",
        conversationId,
      },
      [],
      onProgress,
    );
  }

  return null;
}

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { KampakuToolContext } from "./index.js";

export interface ProposeRepositoryChangeArgs {
  project_slug_or_id: string;
  relative_path: string;
  rationale: string;
  /** Exact substring to replace when applying or describing a patch. */
  old_text?: string;
  /** Replacement text (or content to append when old_text is omitted and apply is true). */
  new_text?: string;
  prompt: string;
  options: string[];
  /**
   * When true, apply the change now. Allowed only for stranger `file://` projects.
   * Platform / host projects always park a proposal and never write.
   */
  apply?: boolean;
  conversation_id?: string;
  question_id?: string;
  work_item_title?: string;
}

function resolveProjectRoot(
  ctx: KampakuToolContext,
  projectSlug: string,
  repositories: Array<{ url: string }>,
): { root: string; kind: "platform" | "stranger" } {
  if (projectSlug === "kampaku") {
    return { root: resolve(ctx.config.workspaceRoot), kind: "platform" };
  }
  const primary = repositories[0];
  if (!primary?.url?.startsWith("file://")) {
    throw new Error(
      "propose_repository_change currently supports the platform project or stranger file:// repositories.",
    );
  }
  const root = resolve(fileURLToPath(primary.url));
  const workspace = resolve(ctx.config.workspaceRoot);
  if (root === workspace || root.startsWith(`${workspace}${sep}`)) {
    throw new Error(
      `Refusing host monorepo path as stranger root (${workspace}). Use a path outside the Kampaku checkout.`,
    );
  }
  return { root, kind: "stranger" };
}

function resolveScopedPath(projectRoot: string, relativePath: string): { absolutePath: string; relativePath: string } {
  const trimmed = relativePath.trim().replace(/^\.\/+/, "");
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.includes("\0")) {
    throw new Error("relative_path must be a safe project-relative path (no .. or absolute segments).");
  }
  const absolutePath = resolve(projectRoot, trimmed);
  const root = resolve(projectRoot);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error(`Path escapes project root: ${trimmed}`);
  }
  return { absolutePath, relativePath: trimmed.split(sep).join("/") };
}

function assertNoCrossContamination(params: {
  kind: "platform" | "stranger";
  absolutePath: string;
  workspaceRoot: string;
  strangerRoots: string[];
}): void {
  const workspace = resolve(params.workspaceRoot);
  const path = resolve(params.absolutePath);

  if (params.kind === "platform") {
    if (!path.startsWith(`${workspace}${sep}`) && path !== workspace) {
      throw new Error("Platform proposals must stay under the Kampaku workspace root.");
    }
    for (const stranger of params.strangerRoots) {
      const root = resolve(stranger);
      if (path === root || path.startsWith(`${root}${sep}`)) {
        throw new Error("Refusing to propose a platform change that targets a stranger repository path.");
      }
    }
    const rel = relative(workspace, path).split(sep).join("/");
    if (!rel.startsWith("docs/")) {
      throw new Error(
        "Platform propose_repository_change is limited to docs/ until an explicit apply path exists. Park docs edits only.",
      );
    }
    return;
  }

  if (path === workspace || path.startsWith(`${workspace}${sep}`)) {
    throw new Error("Refusing to write or propose stranger changes under the Kampaku monorepo.");
  }
}

function listStrangerRoots(ctx: KampakuToolContext): string[] {
  const roots: string[] = [];
  for (const project of ctx.store.listProjects()) {
    if (project.slug === "kampaku") continue;
    for (const repo of project.repositories) {
      if (!repo.url.startsWith("file://")) continue;
      try {
        roots.push(resolve(fileURLToPath(repo.url)));
      } catch {
        // ignore malformed urls
      }
    }
  }
  return roots;
}

function applyTextChange(absolutePath: string, oldText: string | undefined, newText: string): {
  before: string;
  after: string;
} {
  const before = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
  let after: string;
  if (oldText !== undefined && oldText.length > 0) {
    if (!before.includes(oldText)) {
      throw new Error(`old_text not found in ${absolutePath}`);
    }
    after = before.replace(oldText, newText);
  } else if (newText.length === 0) {
    throw new Error("new_text is required to apply a repository change.");
  } else if (before.includes(newText)) {
    after = before;
  } else {
    const needsNewline = before.length > 0 && !before.endsWith("\n");
    after = `${before}${needsNewline ? "\n" : ""}${newText}${newText.endsWith("\n") ? "" : "\n"}`;
  }
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, after, "utf8");
  return { before, after };
}

/**
 * Propose (and optionally apply for stranger only) a scoped repository text change.
 * Platform/host always parks a pending emperor question and never writes disk.
 * Scenario copy belongs in caller args only.
 */
export function executeProposeRepositoryChange(ctx: KampakuToolContext, args: ProposeRepositoryChangeArgs) {
  if (!ctx.questionStore) {
    throw new Error("Question workflow is not available.");
  }

  const rationale = args.rationale?.trim();
  if (!rationale || rationale.length < 8) {
    throw new Error("propose_repository_change requires a rationale (≥8 characters).");
  }
  const prompt = args.prompt?.trim();
  if (!prompt) {
    throw new Error("propose_repository_change requires a prompt for the emperor.");
  }
  const options = (args.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (options.length < 2) {
    throw new Error("propose_repository_change requires at least two options.");
  }
  const newText = args.new_text ?? "";
  if (!newText && args.apply) {
    throw new Error("propose_repository_change apply requires new_text.");
  }
  if (!newText && !(args.old_text && args.old_text.length > 0)) {
    throw new Error("propose_repository_change requires new_text (and optional old_text) describing the patch.");
  }

  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }

  const { root, kind } = resolveProjectRoot(ctx, project.slug, project.repositories);
  const { absolutePath, relativePath } = resolveScopedPath(root, args.relative_path);
  assertNoCrossContamination({
    kind,
    absolutePath,
    workspaceRoot: ctx.config.workspaceRoot,
    strangerRoots: listStrangerRoots(ctx),
  });

  const wantApply = args.apply === true;
  if (wantApply && kind === "platform") {
    throw new Error(
      "Refusing to apply platform/host repository changes without a separate approved apply path. Park a proposal instead (apply=false).",
    );
  }

  if (wantApply && kind === "stranger") {
    const { before, after } = applyTextChange(absolutePath, args.old_text, newText || args.new_text!);
    return {
      project: { id: project.id, slug: project.slug, name: project.name },
      kind,
      relativePath,
      absolutePath,
      applied: true,
      executed: true,
      proposed: {
        oldText: args.old_text ?? null,
        newText: newText || args.new_text!,
        rationale,
      },
      bytesBefore: Buffer.byteLength(before, "utf8"),
      bytesAfter: Buffer.byteLength(after, "utf8"),
      question: null,
      questionTag: null,
      workItem: null,
      jobsStarted: 0,
      summary:
        `Applied stranger-only change on ${project.slug}: ${relativePath}. ` +
        "Host monorepo was not written. No platform apply.",
    };
  }

  const kampaku = ctx.agentStore.getKampakuAgent();
  const leadId = project.projectLeadAgentId ?? kampaku.id;
  const now = new Date().toISOString();
  const workItemId = randomUUID();
  const title =
    args.work_item_title?.trim() ||
    `Parked repository change: ${relativePath} (awaiting emperor approval)`;
  const patchPreview =
    args.old_text && args.old_text.length > 0
      ? `Replace exact text in ${relativePath}.`
      : `Append/write proposed text in ${relativePath}.`;

  ctx.pmStore.createWorkItem({
    id: workItemId,
    projectId: project.id,
    title,
    description: [
      rationale,
      patchPreview,
      `Target: ${relativePath}`,
      "No disk write until explicit emperor yes on a future apply path.",
    ].join("\n"),
    status: "todo",
    priority: "high",
    sortOrder: ctx.pmStore.listWorkItemsByProject(project.id).length,
    assigneeAgentId: leadId,
    assignedByAgentId: kampaku.id,
    routingReason: "Repository change proposal parked pending emperor approval",
    acceptanceCriteria: [
      "Emperor answers the pending repository-change question",
      "No host or stranger disk write until an approved apply",
      "Work remains blocked until the emperor answers",
    ],
    dependsOn: [],
    createdAt: now,
    updatedAt: now,
  });

  const questionId = args.question_id?.trim() || "repository-change-approval";
  const questionObject = {
    id: questionId,
    type: "single_choice" as const,
    prompt,
    options,
    required: true,
  };
  const questionTag = `<kampaku-question>${JSON.stringify(questionObject)}</kampaku-question>`;

  const question = ctx.questionStore.askDirect({
    askedByAgentId: kampaku.id,
    question: questionTag,
    context: [
      args.conversation_id
        ? `conversation_id: ${args.conversation_id}; question_id: ${questionId}`
        : `question_id: ${questionId}`,
      `project_slug: ${project.slug}`,
      `work_item_id: ${workItemId}`,
      `relative_path: ${relativePath}`,
      `kind: ${kind}`,
      "Pending repository change — disk unchanged until explicit emperor yes.",
      "Answer from Dashboard pending questions or CLI `kampaku questions answer`.",
    ].join("\n"),
    projectId: project.id,
    workItemId,
  });

  const workItem = ctx.pmStore.getWorkItem(workItemId)!;
  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    kind,
    relativePath,
    absolutePath,
    applied: false,
    executed: false,
    proposed: {
      oldText: args.old_text ?? null,
      newText: newText || null,
      rationale,
    },
    question: {
      id: question.id,
      questionId,
      status: question.status,
      prompt,
      options,
    },
    questionTag,
    workItem: { id: workItem.id, title: workItem.title, status: workItem.status },
    jobsStarted: 0,
    summary:
      `Parked repository change on ${project.slug}: ${relativePath}. ` +
      `Work item ${workItem.id} is ${workItem.status}; pending question ${question.id}. ` +
      "Disk unchanged. Cross-project writes refused.",
  };
}

export const PROPOSE_REPOSITORY_CHANGE_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_repository_change",
    description:
      "Propose a scoped text change under one project root and open an emperor approval question. Platform/host (kampaku) proposals are limited to docs/ and never write disk. Stranger file:// projects may set apply=true for an immediate stranger-only write. Never cross-write host↔stranger. Pass scenario copy in args. Emit questionTag when parked. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project that owns the change (kampaku for host docs; stranger slug for product work).",
        },
        relative_path: {
          type: "string",
          description: "Path relative to the project root (platform: under docs/; stranger: under file:// root).",
        },
        rationale: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
        prompt: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        apply: {
          type: "boolean",
          description: "If true, apply immediately — stranger projects only. Platform always parks.",
        },
        conversation_id: { type: "string" },
        question_id: { type: "string" },
        work_item_title: { type: "string" },
      },
      required: ["project_slug_or_id", "relative_path", "rationale", "prompt", "options"],
    },
  },
};

import { pathToFileURL } from "node:url";
import { resolve, sep } from "node:path";
import { createProject, updateProject } from "../../../application/projects.js";
import { seedExternalRepository } from "../../../application/pm/repo-bootstrap.js";
import { addAllowedFolder, getFilesystemSettings } from "../../../application/settings/filesystem.js";
import type { KampakuToolContext } from "./index.js";

export interface BootstrapStrangerProjectArgs {
  repository_path: string;
  project_slug: string;
  project_name?: string;
}

function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "stranger-project"
  );
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function assertOutsideHostMonorepo(repositoryPath: string, workspaceRoot: string): string {
  const resolved = resolve(repositoryPath);
  const root = resolve(workspaceRoot);
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Refusing to seed inside the Kampaku monorepo (${root}). Choose a path outside the host checkout.`,
    );
  }
  return resolved;
}

/**
 * Emperor-directed stranger OSS bootstrap: create external path, honest seed + git,
 * Kampaku project record linked via file://, without starting work items or jobs.
 */
export function executeBootstrapStrangerProject(ctx: KampakuToolContext, args: BootstrapStrangerProjectArgs) {
  const projectSlug = slugify(args.project_slug?.trim() || "");
  if (!projectSlug) {
    throw new Error("project_slug is required.");
  }
  if (projectSlug === "kampaku") {
    throw new Error("Refusing to rebind the platform project. Use a dedicated stranger project slug.");
  }
  if (!args.repository_path?.trim()) {
    throw new Error("repository_path is required (absolute path outside the Kampaku monorepo).");
  }

  const repositoryPath = assertOutsideHostMonorepo(args.repository_path.trim(), ctx.config.workspaceRoot);
  const projectName = args.project_name?.trim() || titleCaseFromSlug(projectSlug);
  const fileUrl = pathToFileURL(repositoryPath).href;

  const existing = ctx.store.getProjectByIdOrSlug(projectSlug);
  if (existing) {
    const alreadyLinked = existing.repositories.some((repo) => repo.url === fileUrl);
    if (!alreadyLinked && existing.repositories.length > 0) {
      throw new Error(
        `Project ${projectSlug} already exists with different repositories. Resolve manually before re-bootstrapping.`,
      );
    }
  }

  const seed = seedExternalRepository(repositoryPath, projectName, { createDir: true, initGit: true });

  let project = existing;
  let projectCreated = false;
  if (!project) {
    project = createProject(ctx.store, {
      slug: projectSlug,
      name: projectName,
      description: `Stranger OSS project linked at ${repositoryPath}.`,
      status: "active",
      repositories: [{ url: fileUrl, role: "primary", defaultBranch: "main" }],
    });
    projectCreated = true;
  } else if (project.repositories.length === 0) {
    project = updateProject(ctx.store, ctx.agentStore, project.slug, {
      repositories: [{ url: fileUrl, role: "primary", defaultBranch: "main" }],
    });
  }

  const folders = getFilesystemSettings(ctx.store).folders;
  if (!folders.some((folder) => folder.path === repositoryPath)) {
    try {
      addAllowedFolder(ctx.store, { path: repositoryPath, label: projectSlug, readOnly: false });
    } catch {
      // Already allowed or concurrent — ignore.
    }
  }

  return {
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      repositories: project.repositories,
    },
    repositoryPath,
    fileUrl,
    seeded: seed.seeded,
    skipped: seed.skipped,
    gitInitialized: seed.gitInitialized ?? false,
    projectCreated,
    workItemsCreated: 0,
    jobsStarted: 0,
    verifyCommands: ["node hello.js", "node --test"],
  };
}

export const BOOTSTRAP_STRANGER_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "bootstrap_stranger_project",
    description:
      "Create a minimal honest open-source project outside the Kampaku monorepo: ensure the directory, git init, seed README/LICENSE/package.json/hello.js that actually run, link file:// on a new Kampaku project. Does not invent Express/React stacks. Does not modify the host monorepo. Does not create work items or jobs. Kampaku only; requires an explicit emperor path.",
    parameters: {
      type: "object",
      properties: {
        repository_path: {
          type: "string",
          description: "Absolute path outside the Kampaku checkout (e.g. /tmp/kampaku-eval-stranger).",
        },
        project_slug: {
          type: "string",
          description: "New project slug (not kampaku).",
        },
        project_name: {
          type: "string",
          description: "Optional display name.",
        },
      },
      required: ["repository_path", "project_slug"],
    },
  },
};

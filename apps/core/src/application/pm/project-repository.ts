import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepositoryRole } from "../../config.js";
import type { ProjectRecord } from "../../persistence/store.js";
import type { PlannedTask } from "../../planner/stub.js";

const KAMPAKU_REPO_DIRS: Record<RepositoryRole, string> = {
  core: "apps/core",
  worker: "apps/worker",
  contracts: "packages/contracts",
  docs: "docs",
  web: "apps/web",
};

export interface ProjectJobContext {
  projectId: string;
  projectSlug: string;
  projectName: string;
  workItemId?: string;
  repositories: ProjectRecord["repositories"];
  repositoryRole: RepositoryRole;
  repositoryPath?: string;
  workspaceDir: string;
  isExternal: boolean;
  stackHints: string[];
}

export function getRepositoryStackHints(repositoryPath: string): string[] {
  const hints: string[] = [];
  if (existsSync(join(repositoryPath, "AGENTS.md"))) {
    hints.push("Read AGENTS.md and follow repository conventions before editing.");
  }

  const packageJsonPath = join(repositoryPath, "package.json");
  if (!existsSync(packageJsonPath)) return hints;

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) {
      hints.push(
        "This is a Next.js project. Use App Router conventions and place API routes under app/api/<segment>/route.ts.",
      );
      hints.push("Do not add Express, standalone HTTP servers, or src/api router files unless they already exist.");
    }
  } catch {
    // Ignore invalid package.json; worker will discover stack at runtime.
  }

  return hints;
}

function mapRepositoryRole(role: string | undefined): RepositoryRole {
  if (role === "core" || role === "worker" || role === "contracts" || role === "docs" || role === "web") {
    return role;
  }
  return "web";
}

function resolveKampakuMonorepoRole(
  projectSlug: string,
  repositories: ProjectRecord["repositories"],
): RepositoryRole {
  if (projectSlug === "apps/web") return "web";
  const webRepo = repositories.find((repo) => repo.role === "web");
  if (webRepo) return "web";
  const coreRepo = repositories.find((repo) => repo.role === "core");
  if (coreRepo) return "core";
  return "core";
}

export function resolveProjectJobContext(project: ProjectRecord, workItemId?: string): ProjectJobContext {
  const primary = project.repositories[0];
  if (primary?.url.startsWith("file://")) {
    const repositoryPath = fileURLToPath(primary.url);
    const repositoryRole = mapRepositoryRole(primary.role);
    const normalized = repositoryPath.replace(/\\/g, "/");
    const isExternal = !normalized.includes("/kampaku/") && !normalized.endsWith("/kampaku");
    return {
      projectId: project.id,
      projectSlug: project.slug ?? project.id,
      projectName: project.name,
      workItemId,
      repositories: project.repositories,
      repositoryRole,
      repositoryPath: isExternal ? repositoryPath : undefined,
      workspaceDir: isExternal ? (project.slug ?? basename(repositoryPath)) : KAMPAKU_REPO_DIRS[repositoryRole],
      isExternal,
      stackHints: getRepositoryStackHints(repositoryPath),
    };
  }

  const repositoryRole = resolveKampakuMonorepoRole(project.slug ?? "", project.repositories);
  return {
    projectId: project.id,
    projectSlug: project.slug ?? project.id,
    projectName: project.name,
    workItemId,
    repositories: project.repositories,
    repositoryRole,
    workspaceDir: KAMPAKU_REPO_DIRS[repositoryRole],
    isExternal: false,
    stackHints: [],
  };
}

export function constrainPlanToProject(
  plan: PlannedTask,
  project: ProjectRecord,
  context: ProjectJobContext,
): PlannedTask {
  if (!context.isExternal) return plan;

  return {
    ...plan,
    repositoryRole: context.repositoryRole,
    acceptanceCriteria:
      plan.acceptanceCriteria.length > 0
        ? plan.acceptanceCriteria
        : ["Required files were created or updated in the repository", "Relevant checks pass when applicable"],
    prompt: [
      plan.prompt,
      "",
      `Project context: "${project.name}" (${context.projectSlug}).`,
      `All code changes must stay inside this project's repository checkout.`,
      context.repositoryPath ? `Repository path: ${context.repositoryPath}` : "",
      "Do not modify apps/core, apps/worker, packages/contracts, docs, or apps/web unless the task explicitly requires platform changes.",
      ...context.stackHints,
      "Before finishing: every required deliverable must exist on disk via write_file or replace_in_file.",
      "When acceptance criteria mention npm scripts by name, run each listed script via run_check and all must return ok:true before finishing.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export { KAMPAKU_REPO_DIRS };

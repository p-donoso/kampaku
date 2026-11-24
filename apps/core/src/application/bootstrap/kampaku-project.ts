import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../../config.js";
import type { Store } from "../../persistence/store.js";
import type { RepositoryReference } from "../../persistence/store.js";

/** One candidate the bootstrap looked for, and what it found. */
export interface SkippedRepository {
  url: string;
  role: string;
  reason: string;
}

/**
 * The branch a checkout is on, read from its own `.git` — or `undefined`, which is the honest answer.
 *
 * Read from `.git/HEAD` rather than by shelling out: `bootstrap` runs on a machine where git may not be installed, and
 * a branch claim that depends on a subprocess is a claim the bootstrap cannot make when the subprocess is missing.
 * A detached HEAD answers `undefined` as well: it is on no branch, and naming one would be a guess.
 */
export function branchOfCheckout(path: string): string | undefined {
  try {
    const head = readFileSync(join(path, ".git", "HEAD"), "utf8").trim();
    const match = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return match ? match[1].trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The platform's own repositories, as they are found on this machine.
 *
 * **A stored path that could have been measured is a claim** (BOARD F-028). Measured on suite 06: with
 * `KAMPAKU_WORKSPACE` pointed at an empty directory the bootstrap recorded four `file://` links and none of the four
 * paths existed — `test -d` answered no for all of them — because this function's predecessor wrote the project
 * through `store.createProject` directly and so never met `validateRepositories`, which refuses a `file://` path that
 * is not a directory. It also recorded `defaultBranch: "main"` for each, a branch nobody had read.
 *
 * So each candidate is **looked at**: a path that is not a directory there is reported as skipped, with the reason,
 * and is not recorded. The branch comes from the checkout when it can be read, and is absent when it cannot —
 * `repo-bootstrap.ts` seeds a checkout on `main`, and that is where `main` belongs, in the thing that creates the
 * branch rather than in the record of one that already exists.
 */
export function platformRepositories(config: AppConfig): {
  repositories: RepositoryReference[];
  skipped: SkippedRepository[];
} {
  const workspace = config.workspaceRoot;
  const candidates: Array<{ relative: string; role: string }> = [
    { relative: "apps/core", role: "core" },
    { relative: "apps/worker", role: "worker" },
    { relative: "packages/contracts", role: "contracts" },
    { relative: "docs", role: "docs" },
  ];

  const repositories: RepositoryReference[] = [];
  const skipped: SkippedRepository[] = [];
  for (const candidate of candidates) {
    const path = join(workspace, candidate.relative);
    const url = `file://${path}`;
    let isDirectory = false;
    try {
      isDirectory = existsSync(path) && statSync(path).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      skipped.push({
        url,
        role: candidate.role,
        reason: `${path} does not exist as a directory, so it was not recorded as a linked repository`,
      });
      continue;
    }
    repositories.push({
      url,
      role: candidate.role,
      ...(branchOfCheckout(path) ? { defaultBranch: branchOfCheckout(path) } : {}),
    });
  }

  return { repositories, skipped };
}

export function bootstrapKampakuProject(store: Store, config: AppConfig) {
  const existing = store.getBootstrapState<{ projectId: string }>("default_project");
  if (existing?.projectId) {
    const project = store.getProject(existing.projectId);
    if (project) return { project, created: false, skipped: [] as SkippedRepository[] };
  }

  const now = new Date().toISOString();
  const { repositories, skipped } = platformRepositories(config);
  const project = {
    id: uuidv4(),
    slug: "kampaku",
    name: "Kampaku",
    description: "Self-improvement project for the Kampaku platform repositories.",
    status: "active" as const,
    repositories,
    createdAt: now,
    updatedAt: now,
  };

  store.createProject(project);
  store.setBootstrapState("default_project", { projectId: project.id });

  return { project, created: true, skipped };
}

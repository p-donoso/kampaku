import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { bootstrapKampakuProject } from "./bootstrap/kampaku-project.js";
import { bootstrapKampakuAgent } from "./bootstrap/kampaku-agent.js";
import {
  migratePlatformTeamSlugs,
  bootstrapKampakuPlatformTeam,
  linkDefaultProjectToPlatformTeam,
  syncPlatformTeamProfiles,
  syncPlatformTeamSkills,
} from "./bootstrap/kampaku-platform-team.js";
import { bootstrapFilesystemSettings } from "./settings/filesystem.js";
import { AgentStore } from "../persistence/agent-store.js";
import type { Db } from "../persistence/db.js";
import {
  SkillStore,
  seedSkillsFromCatalog,
  syncDefaultSkills,
} from "../persistence/skill-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import {
  ProjectStoreError,
  type ProjectRecord,
  type ProjectStatus,
  type Store,
} from "../persistence/store.js";
import { seedExternalRepository, type RepoBootstrapResult } from "./pm/repo-bootstrap.js";

export { ProjectStoreError };

export interface CreateProjectInput {
  id?: string;
  slug?: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  repositories?: ProjectRecord["repositories"];
  createdAt?: string;
  updatedAt?: string;
  wikiSyncRequired?: boolean;
  wikiSyncPageSlug?: string;
  wikiSyncPhasePages?: Record<string, string>;
}

/**
 * Validates repository links before they are stored, for **every** entry point.
 *
 * This lives in the application layer on purpose. It was first written inside the `create_project`
 * tool, and that was insufficient: the agent created the container, then linked the repository through
 * `update_project`, which had no validation — so a project ended up holding a `file://` path that did
 * not exist on disk. Validation placed at one call site protects one call site; placed here it covers
 * the agent tools and the REST API alike.
 *
 * The escape hatch is explicit and per-call: linking a repository inside the Kampaku workspace is
 * refused unless the caller deliberately opts in.
 */
export interface RepositoryPolicy {
  allowWorkspaceRepository?: boolean;
  /** Defaults to `KAMPAKU_WORKSPACE`. */
  workspaceRoot?: string;
  /**
   * Allow a `file://` path that does not exist yet, for callers that create it as part of the work.
   *
   * This is deliberately explicit per call site rather than a default: `update_project` seeds an
   * external checkout, so it can accept a path that is about to be created; `create_project` does not
   * seed, so accepting a missing path there would only store a link that means nothing.
   */
  allowMissingPath?: boolean;
}

export function validateRepositories(
  repositories: ProjectRecord["repositories"],
  policy: RepositoryPolicy = {},
): ProjectRecord["repositories"] {
  const workspaceRoot = policy.workspaceRoot ?? process.env.KAMPAKU_WORKSPACE;

  return repositories.map((repo) => {
    const rawUrl = repo.url?.trim();
    if (!rawUrl) throw new ProjectStoreError("Repository URL is required.", "VALIDATION");

    if (rawUrl.startsWith("file://")) {
      const localPath = rawUrl.slice("file://".length);
      if (!isAbsolute(localPath)) {
        throw new ProjectStoreError(
          `Repository URL "${rawUrl}" must use an absolute path.`,
          "VALIDATION",
        );
      }
      if (!policy.allowMissingPath && (!existsSync(localPath) || !statSync(localPath).isDirectory())) {
        throw new ProjectStoreError(
          `Repository path "${localPath}" does not exist as a directory. Create the repository first, then link it — a project must not claim a repository it does not have.`,
          "VALIDATION",
        );
      }
      if (
        workspaceRoot &&
        !policy.allowWorkspaceRepository &&
        (localPath === workspaceRoot || localPath.startsWith(`${workspaceRoot}/`))
      ) {
        throw new ProjectStoreError(
          `Repository path "${localPath}" is inside the Kampaku workspace (${workspaceRoot}). A project for the emperor is a stranger project and must live outside it. Pass allow_workspace_repository: true only if the emperor explicitly asked for this.`,
          "VALIDATION",
        );
      }
    }

    return {
      url: rawUrl,
      role: repo.role ?? "web",
      // Never invent a branch. `main` was templated even when the checkout's real branch was
      // something else, so the project recorded a claim about a repository nobody had read
      // (BOARD F-004: "the branch claim is still recorded from a template"). When the caller
      // states one, it is used; otherwise it is reported as unknown rather than guessed.
      defaultBranch: repo.defaultBranch?.trim() || undefined,
    };
  });
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  );
}

export function bootstrapProject(store: Store, config: AppConfig, db?: Db) {
  const project = bootstrapKampakuProject(store, config);
  const agent = bootstrapKampakuAgent(store);
  const filesystem = bootstrapFilesystemSettings(store, config.workspaceRoot);

  let skillsSeeded = 0;
  let platformTeam = { created: [] as string[], existing: [] as string[] };
  let projectLeadLinked = false;
  if (db) {
    const skillStore = new SkillStore(db);
    const agentStore = new AgentStore(db);
    skillsSeeded = seedSkillsFromCatalog(skillStore, config.workspaceRoot);
    migratePlatformTeamSlugs(agentStore);
    platformTeam = bootstrapKampakuPlatformTeam(agentStore);
    syncPlatformTeamProfiles(agentStore);
    syncDefaultSkills(skillStore, agentStore);
    syncPlatformTeamSkills(skillStore, agentStore);
    projectLeadLinked = linkDefaultProjectToPlatformTeam(store, agentStore);
  }

  return { ...project, agent, filesystem, skillsSeeded, platformTeam, projectLeadLinked };
}

export function createProject(
  store: Store,
  input: CreateProjectInput,
  policy: RepositoryPolicy = {},
): ProjectRecord {
  const repositories = validateRepositories(input.repositories ?? [], policy);
  const now = input.createdAt ?? new Date().toISOString();
  const project: ProjectRecord = {
    id: input.id ?? uuidv4(),
    slug: input.slug ?? slugify(input.name),
    name: input.name,
    description: input.description,
    status: input.status ?? "planning",
    wikiSyncRequired: input.wikiSyncRequired ?? false,
    wikiSyncPageSlug: input.wikiSyncPageSlug,
    wikiSyncPhasePages: input.wikiSyncPhasePages,
    repositories,
    createdAt: now,
    updatedAt: input.updatedAt ?? now,
  };
  return store.createProject(project);
}

export function listProjects(store: Store): ProjectRecord[] {
  return store.listProjects();
}

export function getProjectByIdOrSlug(store: Store, idOrSlug: string): ProjectRecord | undefined {
  return store.getProjectByIdOrSlug(idOrSlug);
}

export function getDefaultProjectId(store: Store): string | undefined {
  return store.getBootstrapState<{ projectId: string }>("default_project")?.projectId;
}

export function getDefaultProject(store: Store): ProjectRecord | undefined {
  const projectId = getDefaultProjectId(store);
  if (!projectId) return undefined;
  return store.getProject(projectId);
}

export function updateProject(
  store: Store,
  agentStore: AgentStore,
  idOrSlug: string,
  input: {
    name?: string;
    description?: string;
    status?: ProjectStatus;
    project_lead_slug?: string | null;
    coherence_strategy?: string | null;
    repositories?: ProjectRecord["repositories"];
    wikiSyncRequired?: boolean;
    wikiSyncPageSlug?: string;
    wikiSyncPhasePages?: Record<string, string>;
  },
  policy: RepositoryPolicy = {},
): ProjectRecord & { repoBootstrap?: RepoBootstrapResult } {
  const project = getProjectByIdOrSlug(store, idOrSlug);
  if (!project) {
    throw new ProjectStoreError("Project not found.", "NOT_FOUND");
  }
  if (input.status === "completed" && !store.hasPassingObjectiveAudit(project.id)) {
    throw new ProjectStoreError("Project objective audit must pass before completion.", "FORBIDDEN");
  }

  const previousRepositories = project.repositories;
  let repoBootstrap: RepoBootstrapResult | undefined;

  if (
    input.name !== undefined ||
    input.description !== undefined ||
    input.status !== undefined ||
    input.repositories !== undefined ||
    input.wikiSyncRequired !== undefined ||
    input.wikiSyncPageSlug !== undefined
    || input.wikiSyncPhasePages !== undefined
  ) {
    store.updateProject(idOrSlug, {
      name: input.name,
      description: input.description,
      status: input.status,
    repositories: input.repositories
      ? validateRepositories(input.repositories, { ...policy, allowMissingPath: true })
      : undefined,
    wikiSyncRequired: input.wikiSyncRequired,
    wikiSyncPageSlug: input.wikiSyncPageSlug,
    wikiSyncPhasePages: input.wikiSyncPhasePages,
    });
  }

  const updatedAfterMeta = getProjectByIdOrSlug(store, idOrSlug);
  if (updatedAfterMeta && input.repositories !== undefined) {
    const primary = updatedAfterMeta.repositories[0];
    // Seeding runs whenever the primary repository is a local checkout, not only on the first time an
    // external link appears. The previous `!hadExternal` gate made it a silent skip: a project that
    // had ever held a `file://` link — including a wrong one, pointing at a path that did not exist —
    // could never be seeded afterwards, because the gate treated "has a local repository" as
    // "already seeded". Seeding is idempotent and never overwrites, so running it is safe and makes
    // this self-healing.
    void previousRepositories;
    if (primary?.url.startsWith("file://")) {
      // Seeding failures are reported, not swallowed. The previous `catch {}` here hid every kind of
      // failure behind "invalid file URL", so a repository could be recorded as linked while nothing
      // was ever written. A caller must not be told a link succeeded when the seeding did not run.
      let repoPath: string;
      try {
        repoPath = fileURLToPath(primary.url);
      } catch {
        throw new ProjectStoreError(
          `Repository URL "${primary.url}" is not a valid file:// URL.`,
          "VALIDATION",
        );
      }
      try {
        repoBootstrap = seedExternalRepository(repoPath, updatedAfterMeta.name);
      } catch (error) {
        throw new ProjectStoreError(
          `Repository "${primary.url}" was recorded but seeding it failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "VALIDATION",
        );
      }
    }
  }

  if (input.project_lead_slug !== undefined || input.coherence_strategy !== undefined) {
    let projectLeadAgentId: string | null | undefined;
    if (input.project_lead_slug !== undefined) {
      if (input.project_lead_slug === null || input.project_lead_slug.trim() === "") {
        projectLeadAgentId = null;
      } else {
        const lead = agentStore.getAgentBySlugOrId(input.project_lead_slug.trim().toLowerCase());
        if (!lead) {
          throw new ProjectStoreError(
            `Agent "${input.project_lead_slug}" not found.`,
            "NOT_FOUND",
          );
        }
        projectLeadAgentId = lead.id;
      }
    }

    store.updateProjectPlanning(project.id, {
      projectLeadAgentId,
      coherenceStrategy:
        input.coherence_strategy !== undefined ? input.coherence_strategy ?? null : undefined,
    });
  }

  const updated = getProjectByIdOrSlug(store, idOrSlug);
  if (!updated) {
    throw new ProjectStoreError("Project not found.", "NOT_FOUND");
  }
  return repoBootstrap ? { ...updated, repoBootstrap } : updated;
}

export function deleteProject(store: Store, pmStore: PmStore, idOrSlug: string): void {
  const defaultProjectId = getDefaultProjectId(store);
  const project = getProjectByIdOrSlug(store, idOrSlug);
  if (!project) {
    throw new ProjectStoreError("Project not found.", "NOT_FOUND");
  }

  pmStore.deleteProjectData(project.id);
  store.deleteProject(idOrSlug, { protectProjectId: defaultProjectId });
}

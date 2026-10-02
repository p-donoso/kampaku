import { existsSync, readdirSync, statSync } from "node:fs";
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
  /**
   * The accountable owner, by slug.
   *
   * Accepted here so **every** entry point can open an *owned* work order. Measured (BOARD F-036): the
   * UI could not, because `POST /api/v1/projects` took no lead and no REST route could create an agent,
   * so a project created the documented way rendered `Owner —`. The `create_project` tool was the only
   * path that could set one, which left the operator's non-chat surfaces unable to do what chat could.
   *
   * Validated **before** anything is persisted, for the same reason the tool validates there: a bad slug
   * must not leave an orphan container behind.
   */
  project_lead_slug?: string;
  /**
   * The stack the emperor named, when they named one ("the same project, but in Python").
   *
   * It reaches the seed because only the caller can know it: an empty directory declares no language,
   * and the seed inventing one is what a scaffold must never do. Measured 2026-09-25 taking suite 06:
   * asked for a second project "but in Python", the factory produced a checkout with no check in any
   * language, so the suite's toolchain-freedom box could not be met by anyone's plan (BOARD F-003).
   */
  stack?: string;
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
   * external checkout, so a caller that intends to create one opts in; `create_project` does not
   * seed, so accepting a missing path there would only store a link that means nothing.
   *
   * It used to be hardcoded `true` inside `updateProject`, on the reasoning that any repositories
   * update seeds. That made the existence check unreachable from every `updateProject` caller — REST
   * included — and a single unauthenticated `PATCH ... repositories: [file:///tmp/evil]` created the
   * directory, ran `git init` and wrote six files (BOARD F-042). A caller that means to seed a
   * checkout that does not exist yet now says so; nobody gets the escape hatch by default.
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

    // A **bare absolute path** is the same claim as `file://<path>`, so it gets the same checks.
    //
    // Measured: a bare path skipped this entire block — no absolute check, no **existence** check, no
    // workspace check — and was stored verbatim (BOARD F-033). A typo, or a path inside the platform
    // checkout, would have been recorded and reported as a linked repository. The defect F-004 exists to
    // prevent, through a door that was left open.
    const isFileUrl = rawUrl.startsWith("file://");
    const isBareAbsolutePath = isAbsolute(rawUrl);
    if (isFileUrl || isBareAbsolutePath) {
      const localPath = isFileUrl ? rawUrl.slice("file://".length) : rawUrl;
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
      // Normalised when it was a bare path, so the stored value is the documented form whichever way the
      // caller wrote it. Two spellings of one path in the store is the same defect as two names for one
      // setting.
      url: isBareAbsolutePath ? `file://${rawUrl}` : rawUrl,
      role: repo.role ?? "web",
      // Never invent a branch. `main` was templated even when the checkout's real branch was
      // something else, so the project recorded a claim about a repository nobody had read
      // (BOARD F-004: "the branch claim is still recorded from a template"). When the caller
      // states one, it is used; otherwise it is reported as unknown rather than guessed.
      defaultBranch: repo.defaultBranch?.trim() || undefined,
    };
  });
}

/**
 * Seeds a checkout that belongs to a **new** project, and never touches somebody else's.
 *
 * Why this lives here, in `createProject`, rather than only in `updateProject`:
 * `seedExternalRepository` was reachable from exactly one place, and that place is `update_project` — which
 * the front office is denied, so "open a work order for a new project at <PATH> and seed it" had no path
 * that could produce a file. Measured 2026-09-25 taking suite 06: the intake turn created the container, the
 * lead and two seats, read the (empty) checkout, and then reported that `git init`, a `README` and a
 * `LICENSE` remained to be written — with `<PATH>` still holding zero entries. The product promised to
 * stand a project up and could not, and the model did not invent the missing step, which is the honest half
 * of that behaviour.
 *
 * The rule is deliberately narrow, and it is the whole reason this is not simply "seed on create":
 *
 * - a **missing** path is still refused (a link to a directory nobody asked for, and F-042's `/tmp/evil`);
 * - a path **inside the workspace** is still refused;
 * - an **existing empty** directory is a new project, so it is initialized and given the hygiene files;
 * - an **existing directory with anything in it** is a stranger's checkout. It is linked exactly as it is
 *   and not one byte is written to it — brownfield respect is a factory invariant, and adding a `README.md`
 *   and a `.gitignore` to someone's repository because it happened to be missing them would be the factory
 *   reshaping a project to suit itself.
 */
function seedNewCheckout(
  repositories: ProjectRecord["repositories"],
  projectName: string,
  stack?: string,
): RepoBootstrapResult | undefined {
  const primary = repositories[0];
  if (!primary?.url.startsWith("file://")) return undefined;

  let repoPath: string;
  try {
    repoPath = fileURLToPath(primary.url);
  } catch {
    return undefined;
  }
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) return undefined;
  if (readdirSync(repoPath).length > 0) return undefined;

  return seedExternalRepository(repoPath, projectName, { stack });
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
  const filesystem = bootstrapFilesystemSettings(store, config.workspaceRoot, config.projectsDir);

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
  agentStore?: AgentStore,
): ProjectRecord & { repoBootstrap?: RepoBootstrapResult } {
  const repositories = validateRepositories(input.repositories ?? [], policy);
  const now = input.createdAt ?? new Date().toISOString();
  const slug = input.slug ?? slugify(input.name);

  // Checked here rather than left to the unique constraint, because the constraint's failure arrives as a
  // raw database throw that the route could not tell apart from a crash (BOARD F-035). A conflict is a
  // 409 with a message, and this is where that becomes possible.
  if (store.getProjectBySlug(slug)) {
    throw new ProjectStoreError(`Project "${slug}" already exists.`, "CONFLICT");
  }

  // Validated before the write, so a bad slug leaves nothing behind.
  const leadSlug = input.project_lead_slug?.trim();
  if (leadSlug && !agentStore) {
    // A lead was named but no agent store was supplied, which is a programming error rather than a user
    // one: accepting the slug and silently dropping it would produce an unowned container that reported
    // success, which is the exact defect F-005 removed.
    throw new ProjectStoreError(
      "A project_lead_slug was provided but no agent store was, so the lead cannot be linked.",
      "VALIDATION",
    );
  }
  if (leadSlug && !agentStore?.getAgentBySlugOrId(leadSlug)) {
    throw new ProjectStoreError(
      `Project lead agent "${leadSlug}" not found, so no container was created. ` +
        "Create the lead first, then retry with its exact slug.",
      "VALIDATION",
    );
  }

  const project: ProjectRecord = {
    id: input.id ?? uuidv4(),
    slug,
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
  const created = store.createProject(project);

  // Opening a work order for a new project *is* standing the checkout up: version control and the hygiene
  // files a stranger needs. Reported back rather than assumed, so the reply can say what was written.
  const repoBootstrap = seedNewCheckout(repositories, project.name, input.stack);

  // Linking goes through `updateProject` so the agent-store write path is the same one every other
  // surface uses, rather than a second implementation of "attach a lead".
  if (leadSlug && agentStore) {
    const linked = updateProject(store, agentStore, created.slug, { project_lead_slug: leadSlug });
    return repoBootstrap ? { ...linked, repoBootstrap } : linked;
  }

  return repoBootstrap ? { ...created, repoBootstrap } : created;
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
      ? validateRepositories(input.repositories, policy)
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

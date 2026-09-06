import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { bootstrapKampakuProject } from "../bootstrap/kampaku-project.js";
import { bootstrapKampakuAgent } from "../bootstrap/kampaku-agent.js";
import {
  migratePlatformTeamSlugs,
  bootstrapKampakuPlatformTeam,
  linkDefaultProjectToPlatformTeam,
  syncPlatformTeamProfiles,
  syncPlatformTeamSkills,
} from "../bootstrap/kampaku-platform-team.js";
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

export function createProject(store: Store, input: CreateProjectInput): ProjectRecord {
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
    repositories: input.repositories ?? [],
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
): ProjectRecord & { repoBootstrap?: RepoBootstrapResult } {
  const project = getProjectByIdOrSlug(store, idOrSlug);
  if (!project) {
    throw new ProjectStoreError("Project not found.", "NOT_FOUND");
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
    repositories: input.repositories,
    wikiSyncRequired: input.wikiSyncRequired,
    wikiSyncPageSlug: input.wikiSyncPageSlug,
    wikiSyncPhasePages: input.wikiSyncPhasePages,
    });
  }

  const updatedAfterMeta = getProjectByIdOrSlug(store, idOrSlug);
  if (updatedAfterMeta && input.repositories !== undefined) {
    const primary = updatedAfterMeta.repositories[0];
    const hadExternal = previousRepositories.some((r) => r.url.startsWith("file://"));
    if (primary?.url.startsWith("file://") && !hadExternal) {
      try {
        const repoPath = fileURLToPath(primary.url);
        repoBootstrap = seedExternalRepository(repoPath, updatedAfterMeta.name);
      } catch {
        // Invalid file URL — skip seeding.
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

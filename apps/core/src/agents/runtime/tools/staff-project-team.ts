import { createProject, updateProject } from "../../../application/projects.js";
import {
  assignProjectTeamSkills,
  createMissingAgentFromSlug,
} from "../../../bootstrap/kampaku-platform-team.js";
import type { KampakuToolContext } from "./index.js";

export interface StaffProjectTeamArgs {
  project_slug: string;
  project_name?: string;
  /** Defaults to frontend, backend, qa (quality). */
  specialist_roles?: string[];
}

const DEFAULT_SPECIALISTS = ["frontend", "backend", "qa"] as const;

function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  );
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Staff-only project team bootstrap: project + lead + nested specialists + lead link.
 * Does not create work items, jobs, or milestones.
 */
export function executeStaffProjectTeam(ctx: KampakuToolContext, args: StaffProjectTeamArgs) {
  const projectSlug = slugify(args.project_slug?.trim() || "");
  if (!projectSlug) {
    throw new Error("project_slug is required.");
  }
  if (projectSlug === "kampaku") {
    throw new Error(
      "Refusing to re-staff the platform project. Use a dedicated project slug for external standing teams.",
    );
  }

  const roles = (args.specialist_roles?.length ? args.specialist_roles : [...DEFAULT_SPECIALISTS])
    .map((role) => role.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean);
  if (roles.length === 0) {
    throw new Error("At least one specialist role is required.");
  }

  const leadSlug = `${projectSlug}-lead`;
  const specialistSlugs = roles.map((role) => `${projectSlug}-${role}`);

  let project = ctx.store.getProjectByIdOrSlug(projectSlug);
  let projectCreated = false;
  if (!project) {
    project = createProject(ctx.store, {
      slug: projectSlug,
      name: args.project_name?.trim() || titleCaseFromSlug(projectSlug),
      description: `Standing team project for ${projectSlug}.`,
      status: "active",
    });
    projectCreated = true;
  }

  const createdAgents: string[] = [];
  const existingAgents: string[] = [];

  const leadBefore = ctx.agentStore.getAgentBySlugOrId(leadSlug);
  if (!leadBefore) {
    const lead = createMissingAgentFromSlug(
      ctx.agentStore,
      leadSlug,
      `Accountable project lead for ${projectSlug}. Coordinate specialists and own project coherence.`,
      "kampaku",
      ctx.skillStore,
    );
    if (lead) createdAgents.push(lead.slug);
  } else {
    existingAgents.push(leadSlug);
    if (leadBefore.parentId) {
      const parent = ctx.agentStore.getAgentBySlugOrId(leadBefore.parentId);
      if (parent && parent.slug !== "kampaku") {
        throw new Error(
          `Lead ${leadSlug} exists under ${parent.slug}; expected parent kampaku. Resolve the hierarchy before staffing.`,
        );
      }
    }
  }

  for (const specialistSlug of specialistSlugs) {
    const existing = ctx.agentStore.getAgentBySlugOrId(specialistSlug);
    if (existing) {
      existingAgents.push(specialistSlug);
      const parent = existing.parentId
        ? ctx.agentStore.getAgentBySlugOrId(existing.parentId)
        : undefined;
      if (!parent || parent.slug !== leadSlug) {
        throw new Error(
          `Specialist ${specialistSlug} exists but is not nested under ${leadSlug} (parent: ${parent?.slug ?? "none"}).`,
        );
      }
      continue;
    }
    const created = createMissingAgentFromSlug(
      ctx.agentStore,
      specialistSlug,
      `Specialist for ${specialistSlug.replace(`${projectSlug}-`, "")} work on ${projectSlug}.`,
      leadSlug,
      ctx.skillStore,
    );
    if (created) {
      createdAgents.push(created.slug);
      assignProjectTeamSkills(ctx.skillStore, created.id, created.slug);
    }
  }

  const lead = ctx.agentStore.getAgentBySlugOrId(leadSlug);
  if (!lead) {
    throw new Error(`Failed to create or load project lead ${leadSlug}.`);
  }

  if (project.projectLeadAgentId && project.projectLeadAgentId !== lead.id) {
    const currentLead = ctx.agentStore.getAgentBySlugOrId(project.projectLeadAgentId);
    throw new Error(
      `Project ${projectSlug} already has lead ${currentLead?.slug ?? project.projectLeadAgentId}. Refusing to create a conflicting lead.`,
    );
  }

  if (project.projectLeadAgentId !== lead.id) {
    project = updateProject(ctx.store, ctx.agentStore, project.slug, {
      project_lead_slug: lead.slug,
    });
  }

  const tree = [
    `kampaku`,
    `└── ${leadSlug}`,
    ...specialistSlugs.map((slug, index) => {
      const prefix = index === specialistSlugs.length - 1 ? "    └──" : "    ├──";
      return `${prefix} ${slug}`;
    }),
  ];

  return {
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      projectLeadSlug: lead.slug,
      projectLeadAgentId: lead.id,
    },
    leadSlug: lead.slug,
    specialistSlugs,
    created: { project: projectCreated, agents: createdAgents },
    existing: { agents: existingAgents },
    tree,
    workItemsCreated: 0,
    jobsStarted: 0,
  };
}

export const STAFF_PROJECT_TEAM_TOOL = {
  type: "function" as const,
  function: {
    name: "staff_project_team",
    description:
      "Create or verify a standing project team without starting work: ensure the project exists, create {project}-lead under kampaku, nest specialists under the lead, and link project_lead_slug. Does not create work items or jobs. Use when the emperor asks for a team for named project work and forbids coding/execution. Idempotent when the hierarchy already matches.",
    parameters: {
      type: "object",
      properties: {
        project_slug: {
          type: "string",
          description: "Project slug, e.g. eval-team-demo.",
        },
        project_name: {
          type: "string",
          description: "Optional display name when creating the project.",
        },
        specialist_roles: {
          type: "array",
          items: { type: "string" },
          description: "Role suffixes under the lead (default: frontend, backend, qa).",
        },
      },
      required: ["project_slug"],
    },
  },
};

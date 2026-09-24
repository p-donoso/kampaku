import type { Command } from "commander";
import type { ProjectOverview } from "../../persistence/pm-store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, green, red, yellow } from "../ansi.js";
import { CoreClientError } from "../../client/core-client.js";

function printProjectOverview(overview: ProjectOverview & {
  workItems: Array<{ item: WorkItemRecord & { assigneeSlug?: string }; children: unknown[] }>;
}) {
  const { project, documents, milestones, workItems } = overview;

  console.log(`${cyan(project.name)} (${project.slug}) — ${project.status}`);
  if (project.description) {
    console.log(dim(project.description));
  }
  // The repository paths, as paths. Suite 02: "The repository path is shown as a path string on every
  // surface that shows project metadata — not replaced by a count that cannot be verified against disk."
  // `projects list` gained them first and this is the detail view, which is where an operator looks when
  // they want to check one against disk.
  if (project.repositories?.length) {
    console.log("");
    console.log(cyan("Repositories"));
    for (const repo of project.repositories) {
      const path = repo.url.replace(/^file:\/\//, "");
      console.log(`  ${path}${repo.role ? dim(` (${repo.role})`) : ""}`);
    }
  }
  console.log("");

  if (project.coherenceStrategy) {
    console.log(dim(`Coherence: ${project.coherenceStrategy}`));
  }
  console.log("");

  if (documents.length) {
    console.log(cyan("Documents"));
    for (const doc of documents) {
      console.log(`  - ${doc.title} (${doc.slug})`);
    }
    console.log("");
  }

  if (milestones.length) {
    console.log(cyan("Roadmap (AI-executed)"));
    for (const milestone of milestones) {
      console.log(`  - [${milestone.status}] ${milestone.title} (${milestone.executedBy})`);
      if (milestone.successCriteria.length) {
        for (const c of milestone.successCriteria) {
          console.log(`      ${dim("✓")} ${c}`);
        }
      }
    }
    console.log("");
  }

  type EnrichedNode = {
    item: WorkItemRecord & { assigneeSlug?: string };
    children: EnrichedNode[];
  };

  const printWorkItems = (nodes: EnrichedNode[], indent = "  ") => {
    for (const node of nodes) {
      const assignee = node.item.assigneeSlug ? ` → ${node.item.assigneeSlug}` : "";
      console.log(`${indent}- [${node.item.status}] ${node.item.title}${assignee}`);
      if (node.item.routingReason) {
        console.log(`${indent}  ${dim(node.item.routingReason)}`);
      }
      if (node.item.acceptanceCriteria.length) {
        for (const c of node.item.acceptanceCriteria) {
          console.log(`${indent}  ${dim("AC:")} ${c}`);
        }
      }
      printWorkItems(node.children, `${indent}  `);
    }
  };

  if (workItems.length) {
    console.log(cyan("Tasks"));
    printWorkItems(workItems);
  }
}

export function registerProjectsCommand(program: Command) {
  const projects = program
    .command("projects")
    .description("Inspect managed projects");

  projects
    .command("list")
    .description("List projects")
    .action(async () => {
      const client = createCoreClient(createAppContext().config);
      try {
        const { projects: items } = await client.listProjects();
        if (!items.length) {
          console.log("No projects found.");
          return;
        }
        for (const project of items) {
          console.log(`${project.slug}\t${project.name}\t[${project.status}]`);
          // The paths, indented under the project. Suite 02's oracle requires the repository path as a
          // path string on every surface that shows project metadata, and the CLI is the one where an
          // operator can check it against disk — which is the point of showing it rather than a count.
          const repositories = (project as { repositories?: Array<{ url: string; role?: string }> })
            .repositories;
          for (const repo of repositories ?? []) {
            const path = repo.url.replace(/^file:\/\//, "");
            console.log(`  ${path}${repo.role ? ` (${repo.role})` : ""}`);
          }
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("show")
    .description("Show project overview")
    .argument("<slug-or-id>", "Project slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const overview = await client.getProjectOverview(slugOrId);
        printProjectOverview(overview);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("update")
    .description("Update project metadata or assign a project lead")
    .argument("<slug-or-id>", "Project slug or ID")
    .option("--name <name>", "New display name")
    .option("--description <text>", "New description")
    .option("--status <status>", "New status (planning, active, on_hold, completed, archived)")
    .option("--lead <slug>", "Agent slug to set as project lead")
    .option("--clear-lead", "Remove the project lead assignment")
    .option("--coherence <text>", "Coherence strategy for the project lead")
    .option("--wiki-sync", "Require wiki synchronization before sensitive closure")
    .option("--wiki-page <slug>", "Default wiki page required for synchronization")
    .option("--wiki-phase <mapping>", "Phase mapping in phase-1=page-slug form; repeatable comma-separated")
    .option("--repo <url>", "Repository URL to link, replacing the current set; repeatable", (value: string, previous: string[]) => [...previous, value], [] as string[])
    .option("--repo-role <role>", "Role for the linked repositories", "web")
    .option("--allow-workspace-repo", "Allow linking a repository inside the Kampaku workspace (deliberate opt-in)")
    .action(async (slugOrId: string, options: {
      name?: string;
      description?: string;
      status?: string;
      lead?: string;
      repo: string[];
      repoRole: string;
      allowWorkspaceRepo?: boolean;
      clearLead?: boolean;
      coherence?: string;
      wikiSync?: boolean;
      wikiPage?: string;
      wikiPhase?: string;
    }) => {
      const client = createCoreClient(createAppContext().config);
      const input: {
        name?: string;
        description?: string;
        status?: ProjectOverview["project"]["status"];
        project_lead_slug?: string | null;
        coherence_strategy?: string;
        wikiSyncRequired?: boolean;
        wikiSyncPageSlug?: string;
        wikiSyncPhasePages?: Record<string, string>;
        repositories?: Array<{ url: string; role?: string; defaultBranch?: string }>;
        allow_workspace_repository?: boolean;
      } = {};

      if (options.name) input.name = options.name;
      if (options.description) input.description = options.description;
      if (options.status) input.status = options.status as ProjectOverview["project"]["status"];
      if (options.clearLead) input.project_lead_slug = null;
      else if (options.lead) input.project_lead_slug = options.lead;
      if (options.coherence) input.coherence_strategy = options.coherence;
      if (options.wikiSync) input.wikiSyncRequired = true;
      if (options.wikiPage) input.wikiSyncPageSlug = options.wikiPage;
      if (options.wikiPhase) input.wikiSyncPhasePages = Object.fromEntries(options.wikiPhase.split(",").map((pair) => pair.split("=")).filter(([key, value]) => key && value));
      // The API accepts repositories; the CLI must too, or the same change needs a raw REST call.
      if (options.repo.length > 0) {
        input.repositories = options.repo.map((url) => ({ url, role: options.repoRole }));
        if (options.allowWorkspaceRepo) input.allow_workspace_repository = true;
      }

      if (!Object.keys(input).length) {
        console.error(red("Provide at least one field to update."));
        process.exit(1);
      }

      try {
        const project = await client.updateProject(slugOrId, input);
        console.log(green(`Updated project "${project.slug}".`));
        if (project.projectLeadAgentId) {
          console.log(dim(`Project lead agent id: ${project.projectLeadAgentId}`));
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("create")
    .description("Create a project")
    .requiredOption("--name <name>", "Project display name")
    .option("--slug <slug>", "Stable slug (defaults to a slug derived from the name)")
    .option("--description <text>", "One-sentence purpose")
    .option("--lead <slug>", "Agent slug to set as project lead")
    .option("--repo <url>", "Repository URL to link; repeatable", (value: string, previous: string[]) => [...previous, value], [] as string[])
    .option("--repo-role <role>", "Role for the linked repositories", "web")
    .action(async (options: {
      name: string;
      slug?: string;
      description?: string;
      lead?: string;
      repo: string[];
      repoRole: string;
    }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const project = await client.createProject({
          name: options.name,
          slug: options.slug,
          description: options.description,
          repositories: options.repo.map((url) => ({ url, role: options.repoRole })),
        });
        console.log(green(`Created project "${project.slug}" (${project.id})`));
        if (options.lead) {
          const linked = await client.updateProject(project.slug, { project_lead_slug: options.lead });
          console.log(dim(`Project lead: ${linked.projectLeadAgentId ?? options.lead}`));
        }
        for (const repo of project.repositories) {
          console.log(dim(`Repo: ${repo.url} [${repo.role ?? "-"}]`));
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("play")
    .description("Start auto-execution from the next pending task")
    .argument("<slug-or-id>", "Project slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const result = await client.playProject(slugOrId);
        console.log(green("Auto-execution enabled."));
        if (result.started) {
          console.log(
            `${cyan("Started task")} goal=${result.started.goalId} job=${result.started.jobId}`,
          );
          console.log(dim(result.started.objective.split("\n")[0] ?? ""));
        } else if (result.gated && result.gate?.detail) {
          console.log(yellow(`Auto-execution waiting: ${result.gate.detail}`));
        } else {
          console.log(yellow("No pending task to start right now."));
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          if (error.body) console.error(dim(error.body));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("pause")
    .description("Pause auto-execution before the next task")
    .argument("<slug-or-id>", "Project slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        await client.pauseProject(slugOrId);
        console.log(yellow("Auto-execution paused. Current task keeps running."));
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          if (error.body) console.error(dim(error.body));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("step")
    .description("Run the next task in the current root-level track only (does not enable auto-execute)")
    .argument("<slug-or-id>", "Project slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const result = await client.stepProject(slugOrId);
        console.log(dim("auto-execute: off (step mode)"));
        if (result.activeTrackTitle) {
          console.log(`${cyan("Track")} ${result.activeTrackTitle}`);
        }
        if (result.started) {
          console.log(
            `${cyan("Started task")} goal=${result.started.goalId} job=${result.started.jobId}`,
          );
          console.log(dim(result.started.objective.split("\n")[0] ?? ""));
        } else if (result.gated && result.gate?.detail) {
          console.log(yellow(`Waiting: ${result.gate.detail}`));
        } else {
          console.log(yellow("No step available in the current track."));
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          if (error.body) console.error(dim(error.body));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("execution")
    .description("Show project auto-execution state")
    .argument("<slug-or-id>", "Project slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const state = await client.getProjectExecution(slugOrId);
        if (state.autoExecute) {
          console.log(green("auto-execute: on"));
        } else {
          console.log(dim("auto-execute: off"));
        }
        if (state.gated && state.gate.detail) {
          console.log(yellow(`waiting: ${state.gate.detail}`));
        }
        if (state.nextStep?.trackTitle) {
          console.log(`${cyan("next track")} ${state.nextStep.trackTitle}`);
        }
        if (state.nextStep?.workItemTitle) {
          console.log(`${cyan("next step")} ${state.nextStep.workItemTitle}`);
        }
        if (state.nextStep?.blockedReason) {
          console.log(yellow(`step blocked: ${state.nextStep.blockedReason}`));
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });
}

export function registerAgentDashboardCommand(program: Command) {
  program
    .command("dashboard")
    .description("Show work item dashboard for an agent and subordinates")
    .argument("[slug]", "Agent slug", "kampaku")
    .option("--no-subordinates", "Exclude sub-agents")
    .action(async (slug: string, options: { subordinates: boolean }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const dashboard = await client.getAgentDashboard(slug, {
          includeSubordinates: options.subordinates,
        });

        console.log(`${cyan(dashboard.agentName)} (${dashboard.agentSlug}) — ${dashboard.total} item(s)`);
        console.log("");

        for (const [status, items] of Object.entries(dashboard.byStatus)) {
          console.log(cyan(status));
          for (const item of items) {
            console.log(`  - ${item.title} [${item.projectSlug}] → ${item.assigneeSlug}`);
          }
          console.log("");
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });
}

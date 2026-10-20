import type { Command } from "commander";
import type { ProjectOverview } from "../../persistence/pm-store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, green, red, yellow } from "../ansi.js";
import { CoreClientError, isDestructiveChallenge } from "../../client/core-client.js";

export function printProjectOverview(overview: ProjectOverview & {
  workItems: Array<{ item: WorkItemRecord & { assigneeSlug?: string }; children: unknown[] }>;
}) {
  const { project, documents, milestones, workItems } = overview;

  console.log(`${cyan(project.name)} (${project.slug}) — ${project.status}`);
  // The **id**, next to the header rather than with the metadata: it is the container's identity, not a
  // property of it. Suite 01's oracle requires the container to be discoverable by "a stable slug/id" from
  // chat, the CLI and REST; chat and REST carried the id and neither CLI read printed it (BOARD F-109).
  console.log(dim(`id ${project.id}`));
  // The **owner slug**, beside the id and for the same reason (BOARD F-109). The container stores an agent
  // id and this command printed no owner at all, while chat, the web UI and the durable-state block all name
  // the slug; suite 01's oracle asks the surfaces to agree on the owner slug, and "absent here" is not
  // agreement. It is resolved by the server (`getEnrichedProjectOverview`) and only rendered here, so this
  // surface cannot disagree with the web UI about which name the owner has.
  const leadSlug = (project as { projectLeadSlug?: string | null }).projectLeadSlug;
  if (leadSlug) {
    console.log(dim(`lead ${leadSlug}`));
  }
  if (project.description) {
    console.log(dim(project.description));
  }
  // The repository **url the container holds**, verbatim, with its role — not a re-spelled bare path.
  // Suite 02: "The repository path is shown as a path string on every surface that shows project
  // metadata — not replaced by a count that cannot be verified against disk." The store, REST,
  // `get_project` and chat all answer `file:///…`; this command stripped the scheme, so the one surface
  // an operator checks against disk reported a different string from the one they had just read
  // elsewhere (BOARD F-109). Two surfaces cannot be compared field by field while one of them
  // re-spells the value.
  if (project.repositories?.length) {
    console.log("");
    console.log(cyan("Repositories"));
    for (const repo of project.repositories) {
      console.log(`  ${repo.url}${repo.role ? dim(` (${repo.role})`) : ""}`);
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
      // **The step's own id, on the line that names it.** Suite 07's cold reader read this command's
      // output as the artifact and answered *"the leaves have titles but no ids. So answer: no step ids are
      // carried"* — while the store held seven — on the one surface `docs/eval/00-protocol.md` calls the
      // canonical record. Every command the plan's own text gives the operator takes an id
      // (`kampaku projects release <id>`, `closure <id>`), and no command here could supply one.
      console.log(`${indent}- [${node.item.status}] ${node.item.id} ${node.item.title}${assignee}`);
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
          // The id is a column of the list, not a second line: an operator comparing this against
          // `GET /api/v1/projects` or a chat reply has to be able to see the same identifier here
          // (BOARD F-109).
          console.log(`${project.slug}\t${project.name}\t[${project.status}]\t${project.id}`);
          // The urls, indented under the project, as the container holds them. Suite 02's oracle requires
          // the repository path as a string on every surface that shows project metadata, and the CLI is
          // the one where an operator can check it against disk — which is the point of showing it rather
          // than a count. It is the same string REST and `get_project` return, so a reader comparing two
          // surfaces compares one value.
          const repositories = (project as { repositories?: Array<{ url: string; role?: string }> })
            .repositories;
          for (const repo of repositories ?? []) {
            console.log(`  ${repo.url}${repo.role ? ` (${repo.role})` : ""}`);
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
    .option("--allow-missing-repo", "Allow linking a local path that does not exist yet, creating and seeding it (deliberate opt-in)")
    .option("-y, --yes", "Confirm a destructive governance change (lead reassignment or repository rewrite)")
    .action(async (slugOrId: string, options: {
      name?: string;
      description?: string;
      status?: string;
      lead?: string;
      repo: string[];
      repoRole: string;
      allowWorkspaceRepo?: boolean;
      allowMissingRepo?: boolean;
      yes?: boolean;
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
        allow_missing_path?: boolean;
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
        if (options.allowMissingRepo) input.allow_missing_path = true;
      }

      if (!Object.keys(input).length) {
        console.error(red("Provide at least one field to update."));
        process.exit(1);
      }

      try {
        const result = await client.updateProject(slugOrId, input);
        if (isDestructiveChallenge(result)) {
          // Governance changes are gated: the first call has no effect and states the consequence. `--yes`
          // presents the confirmation; without it the change is not made.
          console.log(yellow(result.consequence));
          if (!options.yes) {
            console.log(dim("Re-run with --yes to confirm this change."));
            return;
          }
          const confirmed = await client.updateProject(slugOrId, {
            ...input,
            confirmation_reference: result.reference,
            confirmation_token: result.confirmationToken,
            confirmed_by: "cli",
          });
          if (isDestructiveChallenge(confirmed)) {
            console.error(red("Confirmation was refused."));
            process.exit(1);
          }
          console.log(green(`Updated project "${confirmed.slug}".`));
          if (confirmed.projectLeadAgentId) {
            console.log(dim(`Project lead agent id: ${confirmed.projectLeadAgentId}`));
          }
          return;
        }
        console.log(green(`Updated project "${result.slug}".`));
        if (result.projectLeadAgentId) {
          console.log(dim(`Project lead agent id: ${result.projectLeadAgentId}`));
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
          // The lead is passed on create, not linked with a second governance PATCH: the application
          // layer validates it before anything is persisted (F-005/F-036), and the create route carries
          // it, so an owned work order is one call rather than a create plus a gated reassignment.
          project_lead_slug: options.lead,
          repositories: options.repo.map((url) => ({ url, role: options.repoRole })),
        });
        console.log(green(`Created project "${project.slug}" (${project.id})`));
        if (options.lead) {
          console.log(dim(`Project lead: ${project.projectLeadAgentId ?? options.lead}`));
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
    .command("delete")
    .description("Delete a project and all of its history")
    .argument("<slug-or-id>", "Project slug or ID")
    .option("-y, --yes", "Confirm deletion")
    .action(async (slugOrId: string, options: { yes?: boolean }) => {
      const client = createCoreClient(createAppContext().config);

      if (!options.yes) {
        console.log(dim(`Use --yes to delete project "${slugOrId}".`));
        return;
      }

      try {
        // Gated the same way as an agent: the first call states the consequence and deletes nothing.
        const challenge = await client.deleteProject(slugOrId);
        if (challenge) {
          console.log(yellow(challenge.consequence));
          await client.deleteProject(slugOrId, {
            reference: challenge.reference,
            confirmationToken: challenge.confirmationToken,
            confirmedBy: "cli",
          });
        }
        console.log(green(`Deleted project "${slugOrId}".`));
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
    .command("blocked")
    .description("Show every blocked work item of a project: the rule that refused it and the command that clears it")
    .argument("<slug-or-id>", "Project slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const blocks = await client.listBlockedWorkItems(slugOrId);
        if (!blocks.length) {
          console.log(dim("No blocked work items in this project."));
          return;
        }
        for (const block of blocks) {
          console.log(`${cyan(block.workItemId)}  ${block.title}`);
          if (block.refusal) {
            console.log(
              `  ${red(`${block.refusal.field} (${block.refusal.code})`)}: ${block.refusal.reason}`,
            );
            console.log(`  ${dim(`clear it with: ${block.refusal.clearWith}`)}`);
          } else {
            console.log(`  ${block.detail}`);
          }
        }
        console.log(
          dim(
            "\nReading is not clearing: `kampaku projects closure <work-item-id>` re-decides, " +
              "`… --peer --accept` and `… --criterion <ac-N> --accept` take the decision the rule asked for, " +
              "and `kampaku projects retry <work-item-id>` re-runs the work.",
          ),
        );
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("closure")
    .description(
      "Clear a work item's closure refusal: re-decide it, or take the decision the rule asked for. " +
        "Reports the status the tree reads back, which for a container is its children's",
    )
    .argument("<work-item-id>", "Work item UUID (print it with: kampaku projects blocked <project>)")
    .option("--peer", "Record the peer review the refusal asked for")
    .option("--criterion <id>", "Decide one acceptance criterion, e.g. ac-3")
    .option("--accept", "The decision is that it is met (default)")
    .option("--reject", "The decision is that it is not met")
    .option("--by <who>", "Who takes the decision (required for --peer or --criterion, not for a re-decision)")
    .option("--notes <text>", "What was checked, or why it passes: the decision's substance")
    .action(async (workItemId: string, options: {
      peer?: boolean;
      criterion?: string;
      accept?: boolean;
      reject?: boolean;
      by?: string;
      notes?: string;
    }) => {
      const client = createCoreClient(createAppContext().config);
      const decision = options.peer ? "peer_review" : options.criterion ? "criterion" : "decide";
      // A re-decision takes no decision, so it needs neither an author nor a note; both are required the
      // moment the command records a human decision.
      if (decision !== "decide" && !options.notes) {
        console.error(
          red("A decision needs its substance: --notes \"<what was checked, or why it passes>\"."),
        );
        process.exit(1);
      }
      if (decision !== "decide" && !options.by) {
        console.error(red("Name who takes the decision: --by <who>."));
        process.exit(1);
      }
      try {
        const result = await client.dischargeClosure(workItemId, {
          decision,
          criterion_id: options.criterion,
          outcome: options.reject ? "reject" : "accept",
          by: options.by,
          notes: options.notes,
        });
        if (result.recorded !== "none") {
          console.log(green(`Recorded: ${result.recorded}`));
        } else {
          console.log(dim("No decision recorded: re-deciding the closure against the job already on record."));
        }
        // The read-back, not the decision: a container whose own settled job satisfies every rule still
        // reads whatever its children say, and printing *"is done"* over that is a closure the tree
        // contradicts (measured 2026-10-02 on suite 08's third run, BOARD F-089).
        if (result.status === "done") {
          console.log(green(`"${result.workItemTitle}" is done. No new job was spent.`));
          return;
        }
        console.log(red(`"${result.workItemTitle}" still reads ${result.status}.`));
        if (result.detail) {
          console.log(`  ${result.detail}`);
        }
        if (result.waitingOn) {
          console.log(
            dim(
              `  Read it back: kampaku projects blocked <project> ` +
                `(it is waiting on "${result.waitingOn.title}", ${result.waitingOn.workItemId}).`,
            ),
          );
        }
        if (result.refusal) {
          console.log(`  ${result.refusal.code} · ${result.refusal.field}: ${result.refusal.reason}`);
          console.log(`  ${dim(`clear it with: ${result.refusal.clearWith}`)}`);
        } else if (result.reason && !result.detail) {
          console.log(`  ${result.reason}`);
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
    .command("release")
    .description(
      "Release a blocked work item whose block no closure rule and no pending escalation accounts for",
    )
    .argument("<work-item-id>", "Work item UUID (print it with: kampaku projects blocked <project>)")
    .requiredOption("--by <who>", "Who takes the decision")
    .requiredOption("--notes <text>", "What was checked, in the operator's own words")
    .action(async (workItemId: string, options: { by: string; notes: string }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const result = await client.releaseWorkItem(workItemId, options.by, options.notes);
        console.log(
          green(`"${result.workItemTitle}" reads ${result.status} (was ${result.statusBefore}).`),
        );
        console.log(dim(`  ${result.recorded}`));
        console.log(dim(`  Read it back: kampaku projects show <project>`));
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  projects
    .command("retry")
    .description("Re-run a blocked work item's job, after fixing what its refusal was about")
    .argument("<work-item-id>", "Work item UUID (print it with: kampaku projects blocked <project>)")
    .action(async (workItemId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const result = await client.retryWorkItem(workItemId);
        console.log(green(`Re-queued "${result.workItemId}" as job ${result.jobId}.`));
        console.log(dim(`Watch it with: kampaku jobs watch ${result.jobId ?? "<job-id>"}`));
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
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

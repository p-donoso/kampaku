import type { Command } from "commander";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { bootstrapProject } from "../../application/projects.js";
import { ensureProjectsDir } from "../../application/workspace.js";
import { createStoreContext } from "../context.js";

export function registerBootstrapCommand(program: Command) {
  program
    .command("bootstrap")
    .description("Initialize local data directory and register the Kampaku project")
    .action(() => {
      const { config, store, db } = createStoreContext();
      mkdirSync(dirname(config.dbPath), { recursive: true });
      // Before `bootstrapProject`, so the folder is in the allowed list it writes: the bootstrapper only
      // grants folders that exist, and this is the operator's setup path.
      const projects = ensureProjectsDir(config.projectsDir);
      const result = bootstrapProject(store, config, db);
      console.log(
        result.created
          ? `Created project "${result.project.name}" (${result.project.id})`
          : `Project already exists (${result.project.id})`,
      );
      console.log(
        result.agent.created
          ? `Registered agent "${result.agent.slug}" (${result.agent.agentId})`
          : `Agent already registered (${result.agent.slug})`,
      );
      console.log(
        result.filesystem.created
          ? `Allowed folder: ${result.filesystem.settings.folders[0]?.path}`
          : `Filesystem settings already configured (${result.filesystem.settings.folders.length} folder(s))`,
      );
      if (result.skillsSeeded > 0) {
        console.log(`Seeded ${result.skillsSeeded} skill(s)`);
      }
      if (result.platformTeam.created.length > 0) {
        console.log(`Created platform team: ${result.platformTeam.created.join(", ")}`);
      }
      if (result.projectLeadLinked) {
        console.log("Linked default project to kampaku-manager");
      }
      console.log(
        projects.created
          ? `Created projects folder: ${projects.path}`
          : `Projects folder: ${projects.path}`,
      );
    });
}

import type { Command } from "commander";
import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "../../api/app.js";
import { seedSkillsFromCatalog, syncDefaultSkills } from "../../persistence/skill-store.js";
import {
  migratePlatformTeamSlugs,
  bootstrapKampakuPlatformTeam,
  linkDefaultProjectToPlatformTeam,
  syncPlatformTeamProfiles,
  syncPlatformTeamSkills,
} from "../../application/bootstrap/kampaku-platform-team.js";
import { ensureProjectsDir } from "../../application/workspace.js";
import { recoverAbandonedJobsOnBoot } from "../../application/jobs/job-recovery.js";
import { createStoreContext } from "../context.js";

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("Start the control plane HTTP server")
    .option("-p, --port <port>", "Port to listen on")
    .action((options: { port?: string }) => {
      const { config, store, agentStore, pmStore, conversationStore, skillStore, questionStore, blockageStore, journalStore, wikiStore, memoryStore, postActionStore, refusalStore, scopeRequestStore, db } =
        createStoreContext();
      mkdirSync(dirname(config.dbPath), { recursive: true });
      // The other half of the operator's startup path. `serve` is what `./scripts/kampaku dev` runs, so an
      // operator who never ran `bootstrap` still gets the folder the agents are told about.
      ensureProjectsDir(config.projectsDir);
      seedSkillsFromCatalog(skillStore, config.workspaceRoot);
      migratePlatformTeamSlugs(agentStore);
      bootstrapKampakuPlatformTeam(agentStore);
      syncPlatformTeamProfiles(agentStore);
      syncDefaultSkills(skillStore, agentStore);
      syncPlatformTeamSkills(skillStore, agentStore);
      linkDefaultProjectToPlatformTeam(store, agentStore);
      // A lease is held by a living process; a lease this process finds on the books was held by a dead one.
      // Measured 2026-10-23 on suite 13's run `s13r1`: a job `kill -9`ed mid-flight still read `running` after
      // the relaunch, and because it was still "active" under its worker id, the replacement job for the same
      // leaf could not be leased for the whole 30-minute lease (BOARD F-126).
      const recovery = recoverAbandonedJobsOnBoot({
        store,
        pmStore,
        journalStore,
        memoryStore,
        completionCtx: { agentStore, store, wikiStore },
      });
      if (recovery.recoveredJobs.length > 0) {
        console.log(
          `Recovered ${recovery.recoveredJobs.length} job(s) abandoned by a previous process: ` +
            `${recovery.recoveredJobs.join(", ")} — reported lost (expired), not as running.`,
        );
      }
      const port = options.port ? Number(options.port) : config.corePort;
      const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore, questionStore, memoryStore, blockageStore, journalStore, wikiStore, db, postActionStore, refusalStore, scopeRequestStore);

      const server = serve({ fetch: app.fetch, port, hostname: config.coreHost }, () => {
        console.log(`Kampaku Core listening on http://${config.coreHost}:${port}`);
      });

      server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          console.error(
            `Port ${port} is already in use. Stop the other Core process or run: ./scripts/stop.sh`,
          );
          process.exit(1);
        }

        throw error;
      });
    });
}

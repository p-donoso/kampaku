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
import { createStoreContext } from "../context.js";

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("Start the control plane HTTP server")
    .option("-p, --port <port>", "Port to listen on")
    .action((options: { port?: string }) => {
      const { config, store, agentStore, pmStore, conversationStore, skillStore, questionStore, blockageStore, journalStore, wikiStore, memoryStore, postActionStore, refusalStore, db } =
        createStoreContext();
      mkdirSync(dirname(config.dbPath), { recursive: true });
      seedSkillsFromCatalog(skillStore, config.workspaceRoot);
      migratePlatformTeamSlugs(agentStore);
      bootstrapKampakuPlatformTeam(agentStore);
      syncPlatformTeamProfiles(agentStore);
      syncDefaultSkills(skillStore, agentStore);
      syncPlatformTeamSkills(skillStore, agentStore);
      linkDefaultProjectToPlatformTeam(store, agentStore);
      const port = options.port ? Number(options.port) : config.corePort;
      const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore, questionStore, memoryStore, blockageStore, journalStore, wikiStore, db, postActionStore, refusalStore);

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

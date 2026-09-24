import { Command } from "commander";
import { registerBootstrapCommand } from "./commands/bootstrap.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerIntentCommand } from "./commands/intent.js";
import {
  registerAgentDashboardCommand,
  registerProjectsCommand,
} from "./commands/projects.js";
import { registerDevCommand } from "./commands/dev.js";
import { registerRunCommand } from "./commands/run.js";
import { registerJobsCommand } from "./commands/jobs.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerSettingsCommand } from "./commands/settings.js";
import { registerQuestionsCommand } from "./commands/questions.js";
import { registerRefusalCommands } from "./commands/refusals.js";
import { registerSkillsCommand } from "./commands/skills.js";
import { registerWikiCommand } from "./commands/wiki.js";
import { registerPlansCommand } from "./commands/plans.js";
import { runInteractiveSession } from "./repl.js";

const program = new Command();

program.name("kampaku").description("Kampaku control plane CLI").version("0.1.0");

registerBootstrapCommand(program);
registerServeCommand(program);
registerRunCommand(program);
registerJobsCommand(program);
registerStatusCommand(program);
registerDevCommand(program);
registerChatCommand(program);
registerAgentsCommand(program);
registerIntentCommand(program);
registerProjectsCommand(program);
registerSettingsCommand(program);
registerQuestionsCommand(program);
registerRefusalCommands(program);
registerSkillsCommand(program);
registerWikiCommand(program);
registerPlansCommand(program);

const agentsCmd = program.commands.find((cmd) => cmd.name() === "agents");
if (agentsCmd) {
  registerAgentDashboardCommand(agentsCmd);
}

program
  .command("welcome", { isDefault: true, hidden: true })
  .description("Show welcome screen")
  .action(async () => {
    await runInteractiveSession();
  });

program.parse();

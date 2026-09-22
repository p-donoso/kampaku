import type { Command } from "commander";
import type { RepositoryRole } from "../../config.js";
import { runChatSession } from "../repl.js";

interface ChatOptions {
  repo: string;
  projectId?: string;
  message?: string;
  conversationId?: string;
  continue?: boolean;
}

export function registerChatCommand(program: Command) {
  program
    .command("chat")
    .description("Chat with Kampaku, the main orchestration agent")
    .option("--repo <role>", "Default repository role (for kampaku run compatibility)", "core")
    .option("--project-id <id>", "Project ID")
    .option("-m, --message <text>", "Send a single message and exit")
    .option("--conversation-id <id>", "Continue an existing conversation")
    .option("-c, --continue", "Continue the most recent conversation")
    .action(async (options: ChatOptions) => {
      await runChatSession({
        repo: options.repo as RepositoryRole,
        projectId: options.projectId,
        skipWelcome: true,
        message: options.message,
        conversationId: options.conversationId,
        continueLatestFor: options.continue ? "kampaku" : undefined,
      });
    });
}

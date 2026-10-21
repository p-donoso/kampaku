import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { RepositoryRole } from "../config.js";
import type { CoreClient } from "../client/core-client.js";
import { createAppContext, createCoreClient } from "./context.js";
import { runAgentsCommand, sendKampakuMessage } from "./agents-output.js";
import { runSkillsCommand } from "./skills-output.js";
import { showLatestStatus } from "./goals.js";
import { printWelcome } from "./welcome.js";
import { cyan, clearScreen, dim, red } from "./ansi.js";
import { answerOutcomeFor } from "./questions-output.js";

export interface ChatSessionOptions {
  repo?: RepositoryRole;
  projectId?: string;
  /** Continue an existing conversation instead of starting a new one. */
  conversationId?: string;
  /** Continue the most recent conversation for this agent slug. */
  continueLatestFor?: string;
  skipWelcome?: boolean;
  message?: string;
}

export type ReplInput =
  | { kind: "empty" }
  | { kind: "command"; name: string; args: string[] }
  | { kind: "message"; text: string };

export function parseReplInput(line: string): ReplInput {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "empty" };

  if (!trimmed.startsWith("/")) {
    return { kind: "message", text: trimmed };
  }

  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const name = parts[0]?.toLowerCase() ?? "";

  return { kind: "command", name, args: parts.slice(1) };
}

export async function ensureChatPreflight(): Promise<boolean> {
  const { config } = createAppContext();
  const client = createCoreClient(config);

  try {
    const healthy = await client.health();
    if (!healthy) {
      console.error(red("Core is not running. Start with: kampaku dev"));
      return false;
    }
  } catch {
    console.error(red("Core is not running. Start with: kampaku dev"));
    return false;
  }

  try {
    const project = await client.getDefaultProject();
    if (!project) {
      console.error(red("No project found. Run `kampaku bootstrap` first."));
      return false;
    }
  } catch {
    console.error(red("Core is not reachable. Start with: kampaku dev"));
    return false;
  }

  return true;
}

function printReplHelp() {
  console.log("");
  console.log(dim("Type a message to chat with Kampaku, or use:"));
  console.log(`  ${cyan("/agents tree")}       Show agent hierarchy`);
  console.log(`  ${cyan("/agents show <slug>")}  Show agent details`);
  console.log(`  ${cyan("/agents update <slug>")}  Update agent fields`);
  console.log(`  ${cyan("/agents delete <slug> -y")}  Delete a leaf agent`);
  console.log(`  ${cyan("/skills list")}          List all skills`);
  console.log(`  ${cyan("/skills show <slug>")}     Show skill details`);
  console.log(`  ${cyan("/skills create ...")}      Create a skill`);
  console.log(`  ${cyan("/skills update <slug>")}   Update a skill`);
  console.log(`  ${cyan("/skills delete <slug> -y")}  Delete a skill`);
  console.log(`  ${cyan("/status")}            Show latest goal audit`);
  console.log(`  ${cyan("/questions")}         Show pending agent questions`);
  console.log(`  ${cyan("/new")}               Start a new conversation`);
  console.log(`  ${cyan("/clear")}             Clear the screen`);
  console.log(`  ${cyan("/help")}              Show this help`);
  console.log(`  ${cyan("/exit")}              Exit`);
  console.log("");
}

async function handleReplCommand(
  parsed: Extract<ReplInput, { kind: "command" }>,
  client: ReturnType<typeof createCoreClient>,
): Promise<"continue" | "exit" | "new"> {
  switch (parsed.name) {
    case "status":
      try {
        await showLatestStatus(client);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(red(message));
      }
      return "continue";
    case "agents":
      try {
        await runAgentsCommand(client, parsed.args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(red(message));
      }
      return "continue";
    case "skills":
      try {
        await runSkillsCommand(client, parsed.args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(red(message));
      }
      return "continue";
    case "questions":
      try {
        const questions = await client.listQuestions();
        if (!questions.length) console.log(dim("No pending questions."));
        for (const item of questions) console.log(`${cyan(item.id)} ${item.askedByAgentSlug ?? item.askedByAgentId}: ${item.question}`);
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
      }
      return "continue";
    case "help":
      printReplHelp();
      return "continue";
    case "clear":
      clearScreen();
      return "continue";
    case "new":
      return "new";
    case "exit":
    case "quit":
      return "exit";
    default:
      console.log(dim(`Unknown command: /${parsed.name}. Type /help.`));
      return "continue";
  }
}

/**
 * Resolves which conversation a single-message chat turn belongs to.
 *
 * Explicit `--conversation-id` wins. `--continue` resumes the most recent conversation for
 * the agent, which is what an operator driving a multi-turn arc wants. When neither is
 * given, or the requested conversation cannot be resolved, a new conversation is created
 * (the previous behaviour) and the reason is printed so the operator is never guessing.
 */
export async function resolveConversationId(
  client: CoreClient,
  options: ChatSessionOptions,
): Promise<string | undefined> {
  if (options.conversationId) return options.conversationId;
  if (!options.continueLatestFor) return undefined;

  try {
    const { conversations } = await client.listConversations({
      agentSlug: options.continueLatestFor,
      limit: 1,
    });
    const latest = conversations[0];
    if (latest) {
      console.log(dim(`Continuing conversation ${latest.id}`));
      return latest.id;
    }
    console.log(dim("No previous conversation found; starting a new one."));
    return undefined;
  } catch (error) {
    console.error(
      red(
        `Could not load the previous conversation (${
          error instanceof Error ? error.message : String(error)
        }); starting a new one.`,
      ),
    );
    return undefined;
  }
}

async function runRepl(projectId?: string): Promise<void> {
  const { config } = createAppContext();
  const client = createCoreClient(config);
  const rl = readline.createInterface({ input, output });
  let conversationId: string | undefined;
  const presentedQuestionIds = new Set<string>();

  printReplHelp();

  try {
    while (true) {
      try {
        const pending = (await client.listQuestions()).filter(
          (item) => item.recipientAgentSlug === "kampaku" && !presentedQuestionIds.has(item.id),
        );
        for (const item of pending) {
          presentedQuestionIds.add(item.id);
          console.log("");
          console.log(cyan(`Question from ${item.askedByAgentSlug ?? item.askedByAgentId}`));
          console.log(item.question);
          if (item.context) console.log(dim(item.context));
          const answer = (await rl.question(`${cyan("answer")}${dim("> ")}`)).trim();
          if (answer) {
            // What the answer did, in the platform's words rather than a constant. See questions-output.ts.
            const answered = await client.answerQuestion(item.id, answer);
            console.log(dim(answerOutcomeFor(answered)));
          } else {
            presentedQuestionIds.delete(item.id);
            console.log(dim("Question still pending; it will be shown again."));
          }
        }
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
      }
      const line = await rl.question(`${cyan("kampaku")}${dim(">")} `);
      const parsed = parseReplInput(line);

      if (parsed.kind === "empty") continue;

      if (parsed.kind === "message") {
        try {
          conversationId = await sendKampakuMessage(client, parsed.text, {
            conversationId,
            projectId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(red(message));
        }
        continue;
      }

      const result = await handleReplCommand(parsed, client);
      if (result === "exit") return;
      if (result === "new") {
        conversationId = undefined;
        console.log(dim("Started a new conversation."));
      }
    }
  } finally {
    rl.close();
  }
}

export function isReplAvailable(): boolean {
  return input.isTTY === true;
}

export async function runInteractiveSession(): Promise<void> {
  await printWelcome();

  if (!isReplAvailable()) return;

  if (!(await ensureChatPreflight())) {
    process.exit(1);
  }

  await runRepl();
}

export async function runChatSession(options: ChatSessionOptions = {}): Promise<void> {
  if (!(await ensureChatPreflight())) {
    process.exit(1);
  }

  const { config } = createAppContext();
  const client = createCoreClient(config);

  if (options.message) {
    // A single message still belongs to a conversation. Without this, every
    // `kampaku chat -m` created a brand-new conversation and the agent started from
    // an empty history, so a multi-turn arc re-asked for what it had just been told.
    const conversationId = await resolveConversationId(client, options);
    // `--project-id` travels with the turn. It used to stop here, so the conversation was created
    // unscoped and the block said so; see `sendKampakuMessage`.
    await sendKampakuMessage(client, options.message, {
      conversationId,
      projectId: options.projectId,
    });
    return;
  }
  if (!options.skipWelcome) {
    await printWelcome();
    if (!input.isTTY) return;
  }

  if (!input.isTTY) {
    console.error(red("Interactive chat requires a TTY."));
    process.exit(1);
  }

  // The interactive REPL carries the same scoping the single-message path does, so a session opened
  // with `--project-id` stays scoped for every turn in it rather than only the first.
  await runRepl(options.projectId);
}

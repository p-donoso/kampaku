import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, red } from "../ansi.js";

/** The conversation as the read surfaces carry it. */
export interface ConversationSummary {
  id: string;
  agentSlug: string;
  projectId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

/** The exact command that resumes this conversation, so the answer is usable without a second lookup. */
export function resumeCommandFor(id: string): string {
  return `kampaku chat --conversation-id ${id}`;
}

/**
 * One conversation as a line, with the command that continues it.
 *
 * The id is printed **with** the resume command rather than on its own line: a list of ids whose next step the operator
 * has to look up in the documentation is the same as no list (BOARD F-010).
 */
export function formatConversation(conversation: ConversationSummary, messages?: number): string[] {
  const title = conversation.title?.trim() || "(untitled)";
  const scope = conversation.projectId ? `project ${conversation.projectId}` : "no project";
  const lines = [
    `${cyan(conversation.id)}  ${conversation.agentSlug}  ${scope}  ${dim(conversation.updatedAt)}`,
    `  ${title}`,
  ];
  if (messages !== undefined) lines.push(`  ${dim(`${messages} message(s)`)}`);
  lines.push(`  ${dim(`resume with: ${resumeCommandFor(conversation.id)}`)}`);
  return lines;
}

/** One conversation in full: its header, then every message with its role and time. */
export function formatConversationDetail(
  conversation: ConversationSummary,
  messages: ConversationMessage[],
): string[] {
  const lines = formatConversation(conversation, messages.length);
  if (messages.length === 0) {
    lines.push(dim("  no messages recorded"));
    return lines;
  }
  for (const message of messages) {
    lines.push("");
    lines.push(`${dim(message.createdAt)}  ${message.role}`);
    for (const line of message.content.split("\n")) lines.push(`  ${line}`);
  }
  return lines;
}

/**
 * `kampaku conversations` — the list and the transcript, so neither needs the REST API.
 *
 * Measured on suite 16 (BOARD F-010): listing and resuming a conversation required `GET /api/v1/conversations` by hand,
 * while `kampaku chat` already had `--conversation-id` and `--continue`. Web/CLI parity is a stated golden rule of this
 * product, and the read the web UI offers on every conversation is this one.
 *
 * The client is a parameter with a live default, so the command can be driven in a test against a stub: a CLI surface
 * nobody can execute in a test is a surface nobody has locked.
 */
export function registerConversationCommands(
  program: Command,
  clientFactory: () => {
    listConversations(options: { agentSlug?: string; limit?: number }): Promise<{ conversations: ConversationSummary[] }>;
    getConversation(id: string): Promise<{ conversation: ConversationSummary; messages: ConversationMessage[] }>;
  } = () => createCoreClient(createAppContext().config),
): void {
  const conversations = program
    .command("conversations")
    .description("List conversations and read their transcripts");

  conversations
    .command("list")
    .description("List conversations, newest first, with the command that resumes each")
    .option("--agent <slug>", "Only the conversations of one agent")
    .option("--limit <count>", "How many to list", "50")
    .action(async (options: { agent?: string; limit?: string }) => {
      try {
        const limit = Number(options.limit ?? "50");
        const result = await clientFactory().listConversations({
          agentSlug: options.agent,
          limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
        });
        if (result.conversations.length === 0) {
          console.log(dim(options.agent ? "No conversations for this agent." : "No conversations recorded."));
          return;
        }
        for (const conversation of result.conversations) {
          for (const line of formatConversation(conversation)) console.log(line);
        }
        console.log(dim(`\n${result.conversations.length} conversation(s).`));
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  conversations
    .command("show")
    .description("Read one conversation's transcript")
    .argument("<id>", "Conversation id")
    .action(async (id: string) => {
      try {
        const result = await clientFactory().getConversation(id);
        for (const line of formatConversationDetail(result.conversation, result.messages)) console.log(line);
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}

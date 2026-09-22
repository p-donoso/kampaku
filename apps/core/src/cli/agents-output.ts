import { CoreClient, CoreClientError } from "../client/core-client.js";
import type { AgentRecord } from "../agents/types.js";
import { cyan, dim, red } from "./ansi.js";

export async function sendKampakuMessage(
  client: CoreClient,
  message: string,
  options: { conversationId?: string } = {},
): Promise<string> {
  console.log(dim("Thinking…"));
  const response = await client.chatWithKampaku(message, {
    conversationId: options.conversationId,
  });
  console.log("");
  console.log(`${cyan("kampaku")}: ${response.reply}`);
  const meta: string[] = [];
  if (response.agentUsed) meta.push(`mode: ${response.agentUsed}`);
  if (response.model) meta.push(`model: ${response.model}`);
  if (response.toolsUsed?.length) meta.push(`tools: ${response.toolsUsed.join(", ")}`);
  // Printed so a single-message turn is continuable: pass this back with
  // `--conversation-id`, or use `--continue` to resume the most recent conversation.
  if (response.conversationId) meta.push(`conversation: ${response.conversationId}`);
  if (meta.length) {
    console.log(dim(meta.join(" · ")));
  }
  console.log("");
  return response.conversationId;
}

export function printAgentTree(
  nodes: Array<{ agent: { slug: string; name: string; source: string; responsibilities: string }; children: unknown[] }>,
  prefix = "",
): void {
  for (const [index, node] of nodes.entries()) {
    const isLast = index === nodes.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const { agent } = node;
    console.log(
      `${prefix}${branch}${agent.slug} (${agent.source}) — ${agent.responsibilities || agent.name}`,
    );
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    printAgentTree(
      node.children as Array<{
        agent: { slug: string; name: string; source: string; responsibilities: string };
        children: unknown[];
      }>,
      childPrefix,
    );
  }
}

export function printAgentDetails(agent: AgentRecord, parentSlug?: string | null): void {
  console.log(`Slug:             ${agent.slug}`);
  console.log(`Name:             ${agent.name}`);
  console.log(`Source:           ${agent.source}`);
  console.log(`Status:           ${agent.status}`);
  console.log(`Parent:           ${parentSlug ?? agent.parentId ?? "(root)"}`);
  console.log(`Responsibilities: ${agent.responsibilities}`);
  console.log("");
  console.log("System prompt:");
  console.log(agent.systemPrompt);
}

export async function runAgentsCommand(client: CoreClient, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase() ?? "tree";

  if (sub === "show") {
    const slug = args[1];
    if (!slug) {
      console.log(dim("Usage: /agents show <slug>"));
      return;
    }
    const agent = await client.getAgent(slug);
    printAgentDetails(agent);
    return;
  }

  if (sub === "delete") {
    const slug = args[1];
    if (!slug) {
      console.log(dim("Usage: /agents delete <slug> [-y]"));
      return;
    }
    const confirmed = args.includes("-y") || args.includes("--yes");
    if (!confirmed) {
      console.log(dim(`Use -y to delete agent "${slug}".`));
      return;
    }
    try {
      await client.deleteAgent(slug);
      console.log(`Deleted agent "${slug}".`);
    } catch (error) {
      if (error instanceof CoreClientError) {
        console.error(red(error.message));
        return;
      }
      throw error;
    }
    return;
  }

  if (sub === "update") {
    const slug = args[1];
    if (!slug) {
      console.log(dim("Usage: /agents update <slug> [--name <name>] [--responsibilities <text>] [--parent <slug>]"));
      return;
    }
    const input: {
      name?: string;
      responsibilities?: string;
      system_prompt?: string;
      parent_slug?: string;
    } = {};
    for (let index = 2; index < args.length; index += 1) {
      const flag = args[index];
      const value = args[index + 1];
      if (!value) break;
      if (flag === "--name") input.name = value;
      if (flag === "--responsibilities") input.responsibilities = value;
      if (flag === "--parent") input.parent_slug = value;
      if (flag === "--system-prompt") input.system_prompt = value;
      index += 1;
    }
    if (!input.name && !input.responsibilities && !input.parent_slug && !input.system_prompt) {
      console.log(dim("Provide at least one of --name, --responsibilities, --parent, --system-prompt"));
      return;
    }
    try {
      const agent = await client.updateAgent(slug, input);
      console.log(`Updated agent "${agent.slug}".`);
    } catch (error) {
      if (error instanceof CoreClientError) {
        console.error(red(error.message));
        return;
      }
      throw error;
    }
    return;
  }

  if (sub === "tree" || sub === undefined) {
    const { tree } = await client.listAgents({ tree: true });
    if (!tree?.length) {
      console.log("No agents found.");
      return;
    }
    console.log("");
    printAgentTree(tree);
    console.log("");
    return;
  }

  console.log(dim(`Unknown agents subcommand: ${sub}. Use tree, show, update, or delete.`));
}

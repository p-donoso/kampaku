import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim } from "../ansi.js";

export function registerWikiCommand(program: Command) {
  const wiki = program.command("wiki").description("Browse and manage project wikis");

  wiki
    .command("tree")
    .description("Show wiki page tree for a project")
    .requiredOption("-p, --project <slug>", "Project slug")
    .action(async (options: { project: string }) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);
      const data = await client.getWikiTree(options.project);
      console.log(cyan(`${data.projectSlug} wiki`) + dim(` (${data.pendingCount} pending)`));
      printTree(data.tree as WikiTreeNode[], "  ");
    });

  wiki
    .command("show")
    .description("Show a wiki page")
    .requiredOption("-p, --project <slug>", "Project slug")
    .requiredOption("-s, --page <slug>", "Page slug")
    .action(async (options: { project: string; page: string }) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);
      const detail = await client.getWikiPage(options.project, options.page);
      console.log(cyan(detail.page.title) + dim(` (${detail.page.slug})`));
      if (detail.pendingEdit) {
        console.log(dim("\n[pending edit]\n"));
        console.log(detail.pendingEdit.contentMd);
        console.log("");
      }
      console.log(detail.page.contentMd);
      if (detail.comments.length) {
        console.log(dim("\n--- messageboard ---"));
        for (const node of detail.comments) {
          printComment(node, 0);
        }
      }
    });
}

type WikiTreeNode = {
  page: { title: string; slug: string; status: string };
  children: WikiTreeNode[];
};

function printTree(nodes: WikiTreeNode[], indent: string) {
  for (const node of nodes) {
    const pending = node.page.status === "pending_approval" ? dim(" [pending]") : "";
    console.log(`${indent}- ${node.page.title} (${node.page.slug})${pending}`);
    printTree(node.children, `${indent}  `);
  }
}

function printComment(
  node: { comment: { authorSlug?: string; authorName?: string; content: string }; children: unknown[] },
  depth: number,
) {
  const author = node.comment.authorSlug ?? node.comment.authorName ?? "anonymous";
  console.log(`${"  ".repeat(depth)}${author}: ${node.comment.content}`);
  for (const child of node.children as typeof node[]) {
    printComment(child, depth + 1);
  }
}

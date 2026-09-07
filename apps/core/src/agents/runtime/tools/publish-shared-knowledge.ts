import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createWikiPage, updateWikiPageDirect } from "../../../application/wiki/wiki.js";
import type { KampakuToolContext } from "./index.js";

export interface PublishSharedKnowledgeArgs {
  project_slug_or_id: string;
}

function assertOutsideHostMonorepo(repositoryPath: string, workspaceRoot: string): string {
  const resolved = resolve(repositoryPath);
  const root = resolve(workspaceRoot);
  if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Refusing to publish shared knowledge for a repo inside the Kampaku monorepo (${root}).`,
    );
  }
  return resolved;
}

function resolveStrangerRepoPath(
  project: { repositories: Array<{ url: string }> },
  workspaceRoot: string,
): string {
  const primary = project.repositories.find((repo) => repo.url.startsWith("file://"));
  if (!primary) {
    throw new Error("Project must have a linked file:// repository before publishing shared knowledge.");
  }
  return assertOutsideHostMonorepo(fileURLToPath(primary.url), workspaceRoot);
}

function detectJsEntrypoints(files: Set<string>): string[] {
  return [...files]
    .filter((name) => /\.(js|mjs|cjs)$/i.test(name) && !/\.test\./i.test(name))
    .sort((a, b) => {
      const preferred = ["hello.js", "index.js", "main.js"];
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
}

function inspectDisk(repoPath: string) {
  const files = new Set(readdirSync(repoPath));
  const entrypoints = detectJsEntrypoints(files);
  const testFiles = [...files].filter((name) => /\.test\.(js|mjs|cjs)$/i.test(name));
  const hasIndexHtml = files.has("index.html");
  const hasReadme = files.has("README.md");
  const hasPackageJson = files.has("package.json");

  const entryOutputs: Array<{ script: string; expected: string | null }> = [];
  for (const script of entrypoints) {
    try {
      const source = readFileSync(resolve(repoPath, script), "utf8");
      const logMatch = source.match(/console\.log\(\s*["'`]([^"'`]+)["'`]\s*\)/);
      const returnMatch = source.match(/return\s+["'`]([^"'`]+)["'`]/);
      entryOutputs.push({ script, expected: logMatch?.[1] ?? returnMatch?.[1] ?? null });
    } catch {
      entryOutputs.push({ script, expected: null });
    }
  }

  let indexSnippet: string | null = null;
  if (hasIndexHtml) {
    const html = readFileSync(resolve(repoPath, "index.html"), "utf8");
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    indexSnippet = h1?.[1]?.trim() ?? (html.trim() ? "present" : null);
  }

  let readme = "";
  let readmeMentionsNode = false;
  let readmeMentionsNpmFiction = false;
  if (hasReadme) {
    readme = readFileSync(resolve(repoPath, "README.md"), "utf8");
    readmeMentionsNode = /node\s+[\w./-]+\.js|node --test/.test(readme);
    readmeMentionsNpmFiction = /npm run build|Express|React/.test(readme);
  }

  return {
    entryOutputs,
    testFiles,
    hasIndexHtml,
    indexSnippet,
    hasReadme,
    hasPackageJson,
    readmeMentionsNode,
    readmeMentionsNpmFiction,
    topLevelFiles: [...files].sort(),
  };
}

function upsertPublishedPage(
  ctx: KampakuToolContext,
  projectIdOrSlug: string,
  slug: string,
  title: string,
  contentMd: string,
): { slug: string; title: string; status: string; action: "created" | "updated" } {
  const wikiStore = ctx.wikiStore!;
  const project = ctx.store.getProjectByIdOrSlug(projectIdOrSlug)!;
  const existing = wikiStore.getPageBySlug(project.id, slug);
  if (!existing) {
    createWikiPage(ctx.store, wikiStore, projectIdOrSlug, { slug, title, contentMd });
    return { slug, title, status: "published", action: "created" };
  }
  updateWikiPageDirect(ctx.store, wikiStore, existing.id, {
    title,
    contentMd,
    status: "published",
  });
  return { slug, title, status: "published", action: "updated" };
}

/**
 * Publish English shared-knowledge wiki pages from stranger disk facts only.
 */
export function executePublishSharedKnowledge(ctx: KampakuToolContext, args: PublishSharedKnowledgeArgs) {
  if (!ctx.wikiStore) {
    throw new Error("Wiki store is not available.");
  }

  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error("Refusing to overwrite platform project shared knowledge from this tool.");
  }

  const repoPath = resolveStrangerRepoPath(project, ctx.config.workspaceRoot);
  const disk = inspectDisk(repoPath);

  const implemented: string[] = [];
  const future: string[] = [];

  if (disk.entryOutputs.length === 0) {
    future.push("Add a runnable JS entrypoint documented in README");
  } else {
    for (const entry of disk.entryOutputs) {
      if (entry.expected) {
        implemented.push(`\`${entry.script}\` prints **${entry.expected}** via \`node ${entry.script}\``);
      } else {
        implemented.push(`\`${entry.script}\` exists (verify with \`node ${entry.script}\`)`);
      }
    }
  }

  if (disk.testFiles.length > 0) {
    for (const testFile of disk.testFiles) {
      implemented.push(`\`${testFile}\` present; verify with \`node --test\``);
    }
  } else {
    future.push("Add a \`*.test.js\` file and document \`node --test\`");
  }

  if (disk.hasIndexHtml && disk.indexSnippet) {
    implemented.push(
      disk.indexSnippet === "present"
        ? "`index.html` exists"
        : `\`index.html\` shows **${disk.indexSnippet}** in the browser`,
    );
  } else if (disk.hasIndexHtml) {
    implemented.push("`index.html` exists");
  } else {
    future.push("Add a one-page `index.html` when a browser surface is in scope");
  }

  if (disk.hasReadme && disk.readmeMentionsNode) {
    implemented.push("`README.md` documents node run/test commands that match disk");
  } else if (disk.hasReadme) {
    implemented.push("`README.md` exists");
    if (disk.readmeMentionsNpmFiction) {
      future.push("Replace invented npm/Express README claims with commands that match disk");
    }
  } else {
    future.push("Add README with install/run/test that match disk");
  }

  if (!disk.hasPackageJson) {
    future.push("Optional: add package.json only if real npm scripts exist on disk");
  }

  const verifyLines = [
    ...disk.entryOutputs.map((entry) => `node ${entry.script}`),
    ...(disk.testFiles.length > 0 ? ["node --test"] : []),
  ];

  const implementationMd = [
    `# Current implementation — ${project.name}`,
    "",
    "Published shared knowledge for what is **actually on disk** in the linked stranger repository.",
    "",
    `**Repository path:** \`${repoPath}\``,
    "",
    "## Implemented",
    "",
    ...(implemented.length ? implemented.map((line) => `- ${line}`) : ["- _Nothing verified on disk yet._"]),
    "",
    "## Verify commands",
    "",
    "```bash",
    `cd ${repoPath}`,
    ...verifyLines,
    "```",
    "",
    "## Top-level files observed",
    "",
    ...disk.topLevelFiles.map((name) => `- \`${name}\``),
    "",
    "Do not invent endpoints, frameworks, or libraries that are not listed above.",
    "",
  ].join("\n");

  const primary = disk.entryOutputs[0];
  const setupMd = [
    `# Development setup — ${project.name}`,
    "",
    "Commands below match the stranger tree. There is **no** Express/React stack unless those files appear on disk.",
    "",
    "## Run",
    "",
    "```bash",
    primary ? `node ${primary.script}` : "# No JS entrypoint observed on disk",
    "```",
    "",
    primary?.expected ? `Expected output when seeded: \`${primary.expected}\`` : "",
    "",
    "## Test",
    "",
    "```bash",
    disk.testFiles.length > 0 ? "node --test" : "# No test files observed on disk",
    "```",
    "",
    disk.hasIndexHtml
      ? `## One-page UI\n\nOpen \`index.html\` in a browser${disk.indexSnippet && disk.indexSnippet !== "present" ? ` to see **${disk.indexSnippet}**` : ""}.\n`
      : "## One-page UI\n\n**Roadmap:** add `index.html` when a browser surface is in scope.\n",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const roadmapMd = [
    `# Roadmap — ${project.name}`,
    "",
    "Items below are **not implemented** (or not verified) on disk. Treat them as future work — not present tense.",
    "",
    ...(future.length ? future.map((line) => `- ${line}`) : ["- _No open future items detected from disk inspection._"]),
    "",
  ].join("\n");

  const pages = [
    upsertPublishedPage(ctx, project.slug, "current-implementation", "Current implementation", implementationMd),
    upsertPublishedPage(ctx, project.slug, "dev-setup", "Development setup", setupMd),
    upsertPublishedPage(ctx, project.slug, "roadmap", "Roadmap", roadmapMd),
  ];

  const pending = ctx.wikiStore
    .listPagesByProject(project.id)
    .filter((page) => page.status === "pending_approval")
    .map((page) => ({ slug: page.slug, status: page.status }));

  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    repositoryPath: repoPath,
    publishedPages: pages,
    pendingPages: pending,
    implementedCount: implemented.length,
    futureCount: future.length,
    emperorReadOrder: pages.map((page) => page.slug),
    summary:
      `Published ${pages.length} shared-knowledge page(s) for ${project.slug} from disk facts ` +
      `(${implemented.length} implemented, ${future.length} future). Pending proposals left unpublished: ${pending.length}.`,
  };
}

export const PUBLISH_SHARED_KNOWLEDGE_TOOL = {
  type: "function" as const,
  function: {
    name: "publish_shared_knowledge",
    description:
      "Publish English project wiki pages that match the linked stranger file:// tree (current implementation, honest setup commands, roadmap for unfinished work). Inspects disk generically. Does not invent npm/Express stacks. Refuses the platform project and host monorepo. Kampaku only. Use when the emperor asks to update shared knowledge to reflect what is actually implemented.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Stranger project slug or id (not kampaku).",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};

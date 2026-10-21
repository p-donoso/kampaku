import { resolveDeclaredCheckCommands } from "../pm/declared-checks.js";
import type { WikiStore } from "../../persistence/wiki-store.js";

/**
 * The pages a project starts with, and the commands they are allowed to name.
 *
 * The `dev-setup` page used to carry `npm install` / `npm test` / `npm run build` as literal text, handed to
 * **every** project whatever its stack. Measured as a defect three times over: the seeded README documented npm
 * in a checkout with no `package.json` (BOARD F-003), suite 06's plan named `npm` in a Python repository
 * (F-054), and this file was recorded as the second instance of the first defect. On suite 09 it is worse than
 * wrong: a *published page* is exactly what the suite checks against the tree, and a page whose first four
 * commands fail is a published falsehood.
 *
 * So the page is **derived** now, from the checkout the project is linked to, by the same discovery the plan and
 * the worker use (`resolveDeclaredCheckCommands`, evidence-or-nothing). Three outcomes, all stated rather than
 * guessed:
 *
 * - the checkout declares checks → the page lists them with the file and key that justify each one;
 * - the checkout declares none → the page says so and says what would change that;
 * - nothing local is linked → the page says the commands are not known yet, and why.
 *
 * What it never does is name a command nobody declared, which is the only rule that makes a published page
 * about running a project true.
 */

function localPathOf(repositories: Array<{ url?: string }> | undefined): string | undefined {
  for (const repository of repositories ?? []) {
    const url = repository.url?.trim();
    if (!url) continue;
    if (url.startsWith("file://")) return url.slice("file://".length);
  }
  return undefined;
}

function devSetupMarkdown(repositories: Array<{ url?: string; role?: string }> | undefined): string {
  const localPath = localPathOf(repositories);
  const lines: string[] = ["# Development setup", ""];

  if (!localPath) {
    lines.push(
      "This project has no local checkout linked yet, so its build and test commands are **not known**.",
      "Nothing is listed here rather than a guess: link the repository this project lives in and this page can",
      "state the commands that checkout declares.",
      "",
    );
    return lines.join("\n");
  }

  const commands = resolveDeclaredCheckCommands(localPath);
  if (commands.length === 0) {
    lines.push(
      `The linked checkout (\`${localPath}\`) declares no check this platform could read — no target in a`,
      "`Makefile` or `justfile`, no test script in a manifest, no test suite it could identify. **No command is",
      "listed here, because this project has not declared one.**",
      "",
      "To change that, declare the command the project actually runs — a `Makefile` target, a manifest script, or",
      "a test suite the discovery can see — and this page will state it with the file that justifies it.",
      "",
    );
    return lines.join("\n");
  }

  lines.push(
    `Every command below is declared by the linked checkout (\`${localPath}\`), quoted with the declaration that`,
    "justifies it. No output is recorded on this page: run the command and read its own result.",
    "",
    "| Check | Command | Declared by |",
    "|-------|---------|-------------|",
  );
  for (const command of commands) {
    lines.push(`| ${command.name} | \`${command.command}\` | ${command.evidence} |`);
  }
  lines.push(
    "",
    "A check this page does not list is a check this checkout does not declare. Run the commands from the",
    "repository root.",
    "",
  );
  return lines.join("\n");
}

export function ensureDefaultWikiPages(
  wikiStore: WikiStore,
  projectId: string,
  projectName: string,
  repositories?: Array<{ url?: string; role?: string }>,
): string[] {
  const pages: Array<{ slug: string; title: string; contentMd: string }> = [
    {
      slug: "project-vision",
      title: "Project vision",
      contentMd: `# Project vision — ${projectName}\n\n_Describe product goals and scope._\n`,
    },
    {
      slug: "architecture-overview",
      title: "Architecture overview",
      contentMd:
        "# Architecture overview\n\n_Document the stack, the directory layout, and the service wiring that exist today._\n\n" +
        "Anything described here must be readable in the checkout. A feature that is planned and not built belongs " +
        "in a proposal, marked as planned, not in this page.\n",
    },
    {
      slug: "dev-setup",
      title: "Development setup",
      contentMd: devSetupMarkdown(repositories),
    },
  ];

  const created: string[] = [];
  for (const page of pages) {
    if (wikiStore.getPageBySlug(projectId, page.slug)) continue;
    wikiStore.createPage({
      projectId,
      slug: page.slug,
      title: page.title,
      contentMd: page.contentMd,
      status: "published",
      maturity: "shipped",
    });
    created.push(page.slug);
  }
  return created;
}

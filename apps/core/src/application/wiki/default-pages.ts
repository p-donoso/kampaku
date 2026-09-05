import type { WikiStore } from "../../persistence/wiki-store.js";

const DEFAULT_PAGES: Array<{ slug: string; title: string; contentMd: string }> = [
  {
    slug: "project-vision",
    title: "Project vision",
    contentMd: "# Project vision\n\n_Describe product goals and scope. Sync from requirements or PM documents._\n",
  },
  {
    slug: "architecture-overview",
    title: "Architecture overview",
    contentMd: "# Architecture overview\n\n_Document stack, directory layout, and service wiring. Sync from docs/system-architecture.md in the linked repo._\n",
  },
  {
    slug: "dev-setup",
    title: "Development setup",
    contentMd: "# Development setup\n\n## Install\n\n```bash\nnpm install\n```\n\n## Test\n\n```bash\nnpm test\nnpm run build\n```\n",
  },
];

export function ensureDefaultWikiPages(
  wikiStore: WikiStore,
  projectId: string,
  projectName: string,
): string[] {
  const created: string[] = [];
  for (const page of DEFAULT_PAGES) {
    if (wikiStore.getPageBySlug(projectId, page.slug)) continue;
    const contentMd =
      page.slug === "project-vision"
        ? `# Project vision — ${projectName}\n\n_Describe product goals and scope._\n`
        : page.contentMd;
    wikiStore.createPage({
      projectId,
      slug: page.slug,
      title: page.title,
      contentMd,
      status: "published",
    });
    created.push(page.slug);
  }
  return created;
}

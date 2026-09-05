import type { PmStore, RoadmapMilestoneRecord } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import type { WikiPageRecord, WikiStore } from "../../persistence/wiki-store.js";

export const ROADMAP_WIKI_SLUG = "roadmap";

function milestoneStatusLabel(status: RoadmapMilestoneRecord["status"]): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "in_progress":
      return "In progress";
    case "reached":
      return "Reached";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function buildRoadmapWikiMarkdown(
  coherenceStrategy: string | undefined,
  milestones: RoadmapMilestoneRecord[],
): string {
  const sections: string[] = [
    "# Roadmap",
    "",
    "Project milestones and coherence strategy. This page is synced from the control plane.",
    "",
  ];

  if (coherenceStrategy?.trim()) {
    sections.push("## Coherence strategy", "", coherenceStrategy.trim(), "");
  }

  if (milestones.length === 0) {
    sections.push("_No milestones defined yet._");
    return sections.join("\n");
  }

  sections.push("## Milestones", "");
  for (const [index, milestone] of milestones.entries()) {
    sections.push(`### ${index + 1}. ${milestone.title}`);
    sections.push("");
    sections.push(`- **Status:** ${milestoneStatusLabel(milestone.status)}`);
    sections.push(`- **Executed by:** ${milestone.executedBy === "human" ? "Human" : "AI agents"}`);
    if (milestone.targetDate) {
      sections.push(`- **Target date:** ${milestone.targetDate}`);
    }
    if (milestone.description?.trim()) {
      sections.push("", milestone.description.trim());
    }
    if (milestone.successCriteria.length > 0) {
      sections.push("", "**Success criteria:**");
      for (const criterion of milestone.successCriteria) {
        sections.push(`- ${criterion}`);
      }
    }
    sections.push("");
  }

  return sections.join("\n").trimEnd();
}

export function syncRoadmapWikiPage(
  store: Store,
  pmStore: PmStore,
  wikiStore: WikiStore,
  projectId: string,
): WikiPageRecord | undefined {
  const project = store.getProject(projectId);
  if (!project) return undefined;

  const milestones = pmStore.listMilestonesByProject(projectId);
  if (milestones.length === 0 && !project.coherenceStrategy?.trim()) {
    return undefined;
  }

  const contentMd = buildRoadmapWikiMarkdown(project.coherenceStrategy, milestones);
  const existing = wikiStore.getPageBySlug(projectId, ROADMAP_WIKI_SLUG);

  if (existing) {
    if (existing.contentMd === contentMd && existing.title === "Roadmap") {
      return existing;
    }
    return wikiStore.updatePageDirect(existing.id, {
      title: "Roadmap",
      contentMd,
    });
  }

  return wikiStore.createPage({
    projectId,
    slug: ROADMAP_WIKI_SLUG,
    title: "Roadmap",
    contentMd,
    sortOrder: 0,
  });
}

function countWikiPages(tree: Array<{ children: unknown[] }>): number {
  let count = 0;
  for (const node of tree) {
    count += 1;
    count += countWikiPages(node.children as typeof tree);
  }
  return count;
}

export { countWikiPages };

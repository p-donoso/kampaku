/**
 * @module application/pm/plan-supersession
 *
 * What happens to a project's **previous** plan when a new one is applied.
 *
 * Measured 2026-10-20 on suite 07's run `s07r22` and recorded as BOARD F-119: a plan of eight work items was
 * applied, a gate was answered, a second plan was applied over it, the first eight items went `cancelled` — and
 * the first plan's documents, its milestone and the pages it wrote **stayed published as current**. A cold reader
 * given only the surface spent its answer deciding *which* of the two trees was the plan, and quoted the
 * contradiction in the product's own words: *"Milestone 1 still demands exactly the excluded behaviour … while
 * applied leaf `34174f77` requires `[project.scripts]`. The control plane contradicts the plan"* and *"Two plan
 * pages and `cli-output-and-error-contract` are superseded designs still sitting in the wiki"*.
 *
 * Suite [09](../../../../../docs/eval/09-shared-truth.md) is the suite that asks whether published knowledge
 * matches the tree, and "two plans published as current" fails it directly: the knowledge is not the truth, it is
 * two truths.
 *
 * The rule this module implements is deliberately narrow and stateable in one sentence: **a re-plan replaces its
 * own previous output and nothing else.** So:
 *
 * - documents and pages the platform's plan machinery wrote (`origin: "plan"`) are **archived**, with the plan
 *   that superseded them named in place of their body — a reader who lands on one is told, not left to compare
 *   trees;
 * - milestones with no counterpart in the new plan are marked **cancelled**;
 * - the project's **knowledge** pages are untouched, however old or however stale, because they are not this
 *   plan's output and superseding somebody else's knowledge is a decision the product does not get to make.
 */

import type { PmStore, RoadmapMilestoneRecord } from "../../persistence/pm-store.js";
import type { ProjectRecord, Store } from "../../persistence/store.js";
import type { WikiStore } from "../../persistence/wiki-store.js";

export interface SupersessionResult {
  /** Plan documents archived this time, by slug. */
  archivedDocuments: string[];
  /** Milestones marked cancelled, by title. */
  cancelledMilestones: string[];
  /** Set when the caller asked why nothing was superseded. */
  reason?: string;
}

function normalise(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Supersedes the project's previous plan output, before the new plan's own records are written.
 *
 * Called **before** the new documents and milestones are created, so "the previous plan" is unambiguous and no
 * freshly written row can be archived by its own apply.
 */
export function supersedePriorPlan(
  store: Store,
  pmStore: PmStore,
  wikiStore: WikiStore | undefined,
  project: ProjectRecord,
  incoming: { documentTitles: string[]; milestoneTitles: string[] },
): SupersessionResult {
  const result: SupersessionResult = { archivedDocuments: [], cancelledMilestones: [] };

  const incomingDocuments = new Set(incoming.documentTitles.map(normalise));
  const incomingMilestones = new Set(incoming.milestoneTitles.map(normalise));

  // 1. Documents the plan machinery wrote, that this plan does not carry forward.
  const planDocuments = pmStore
    .listDocumentsByProject(project.id)
    .filter((document) => document.origin === "plan" && document.status !== "archived");
  for (const document of planDocuments) {
    if (incomingDocuments.has(normalise(document.title))) continue;
    const archiveBody =
      `> **Superseded.** This page was written by a previous plan for this project and has been replaced by a ` +
      `later plan. It is kept for its history and is **not** a description of the project as it stands.\n\n` +
      `## Superseded content\n\n${document.contentMd}`;
    pmStore.updateDocument(document.id, {
      status: "archived",
      contentMd: archiveBody,
    });
    if (wikiStore) {
      // The same row, read through the wiki's own path, so the wiki tree's `archived` filter applies to it too.
      const page = wikiStore.getPageBySlug(project.id, document.slug);
      if (page) {
        wikiStore.updatePageDirect(page.id, { status: "archived", contentMd: archiveBody });
      }
    }
    result.archivedDocuments.push(document.slug);
  }

  // 2. Milestones the new plan does not restate.
  const milestones: RoadmapMilestoneRecord[] = pmStore.listMilestonesByProject(project.id);
  for (const milestone of milestones) {
    if (milestone.status === "reached" || milestone.status === "cancelled") continue;
    if (incomingMilestones.has(normalise(milestone.title))) continue;
    pmStore.setMilestoneStatus(milestone.id, "cancelled");
    result.cancelledMilestones.push(milestone.title);
  }

  if (result.archivedDocuments.length === 0 && result.cancelledMilestones.length === 0) {
    result.reason =
      "No previous plan output to supersede: this project had no plan documents left and no open milestone that " +
      "the new plan drops.";
  }

  return result;
}

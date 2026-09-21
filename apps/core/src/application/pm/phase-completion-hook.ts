import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import type { WikiStore } from "../../persistence/wiki-store.js";
import { recordPhaseGateJournal, recordDeliverableAuditJournal } from "./journal-events.js";
import { buildPostActionRuntime, recordPostActionLifecycle } from "./post-action/index.js";
import { resolveProjectJobContext } from "./project-repository.js";
import { ensureDefaultWikiPages } from "../wiki/default-pages.js";

const REPO_DOC_MAPPINGS: Array<{ repoPath: string; wikiSlug: string; title: string }> = [
  { repoPath: "docs/system-architecture.md", wikiSlug: "architecture-overview", title: "Architecture overview" },
  { repoPath: "docs/architecture/system-architecture.md", wikiSlug: "architecture-overview", title: "Architecture overview" },
  { repoPath: "openapi.yaml", wikiSlug: "api-reference", title: "API reference" },
  { repoPath: "docs/api/openapi.yaml", wikiSlug: "api-reference", title: "API reference" },
  { repoPath: "README.md", wikiSlug: "dev-setup", title: "Development setup" },
];

function isPhaseContainer(item: WorkItemRecord, pmStore: PmStore): boolean {
  const children = pmStore
    .listWorkItemsByProject(item.projectId)
    .filter((child) => child.parentId === item.id);
  return children.length > 0;
}

function findNewlyDonePhaseParents(pmStore: PmStore, leafId: string): WorkItemRecord[] {
  const doneParents: WorkItemRecord[] = [];
  let current = pmStore.getWorkItem(leafId);
  while (current?.parentId) {
    const parent = pmStore.getWorkItem(current.parentId);
    if (!parent) break;
    if (parent.status === "done" && isPhaseContainer(parent, pmStore)) {
      doneParents.push(parent);
    }
    current = parent;
  }
  return doneParents;
}

function proposeWikiFromRepoFile(
  wikiStore: WikiStore,
  projectId: string,
  wikiSlug: string,
  title: string,
  filePath: string,
  proposedByAgentId: string,
): void {
  const existing = wikiStore.getPageBySlug(projectId, wikiSlug);
  const content = readFileSync(filePath, "utf8");
  if (existing?.contentMd.trim() === content.trim()) return;

  if (existing) {
    wikiStore.proposeEdit(existing.id, { title, contentMd: content, proposedByAgentId });
  } else {
    wikiStore.createPage({
      projectId,
      slug: wikiSlug,
      title,
      contentMd: content,
      status: "pending_approval",
    });
  }
}

export function runPhaseCompletionHooks(
  pmStore: PmStore,
  store: Store,
  journalStore: JournalStore | undefined,
  wikiStore: WikiStore | undefined,
  agentStore: AgentStore | undefined,
  completedLeafId: string,
  postActionStore?: import("../../persistence/post-action-store.js").PostActionReviewStore,
  memoryStore?: import("../../persistence/memory-store.js").MemoryStore,
): void {
  if (!journalStore) return;

  const leaf = pmStore.getWorkItem(completedLeafId);
  if (!leaf) return;

  const project = store.getProject(leaf.projectId);
  if (!project) return;

  if (wikiStore) {
    ensureDefaultWikiPages(wikiStore, project.id, project.name);
  }

  const phaseParents = findNewlyDonePhaseParents(pmStore, completedLeafId);
  if (phaseParents.length === 0) return;

  const context = resolveProjectJobContext(project, completedLeafId);
  const repoPath = context.repositoryPath;
  const proposerId =
    project.projectLeadAgentId ??
    agentStore?.getKampakuAgent()?.id ??
    agentStore?.listAllAgents()[0]?.id ??
    "";

  if (wikiStore && repoPath && context.isExternal && proposerId) {
    for (const mapping of REPO_DOC_MAPPINGS) {
      const fullPath = join(repoPath, mapping.repoPath);
      if (!existsSync(fullPath)) continue;
      try {
        proposeWikiFromRepoFile(
          wikiStore,
          project.id,
          mapping.wikiSlug,
          mapping.title,
          fullPath,
          proposerId,
        );
      } catch {
        // Best-effort wiki sync; lead can approve pending edits.
      }
    }
  }

  for (const phase of phaseParents) {
    if (agentStore) {
      recordPostActionLifecycle(
        buildPostActionRuntime({
          pmStore,
          agentStore,
          reviewStore: postActionStore,
          store,
          journalStore,
          memoryStore,
          wikiStore,
        }),
        {
          event: "phase_completed",
          projectId: phase.projectId,
          workItemId: phase.id,
          referenceId: `${phase.id}:${phase.updatedAt}`,
          summary: `Phase "${phase.title}" reached done rollup. Run the phase gate audit before advancing.`,
          followUps: ["Run audit-phase-gate before advancing to the next phase."],
          wikiSyncRequired: project.wikiSyncRequired === true,
        },
      );
    }

  recordPhaseGateJournal(journalStore, pmStore, {
      projectId: project.id,
      phaseWorkItemId: phase.id,
      phaseTitle: phase.title,
      repositoryPath: repoPath,
    });

    const auditor = agentStore
      ? agentStore.listAllAgents().find((a) => a.slug.endsWith("-auditor") || a.slug === "kampaku-auditor")
      : undefined;

    if (auditor) {
      recordDeliverableAuditJournal(journalStore, pmStore, {
        projectId: project.id,
        anchorWorkItemId: phase.id,
        fromAgentId: auditor.id,
        title: `Phase gate: ${phase.title}`,
        body: [
          `Phase container "${phase.title}" rolled to done.`,
          repoPath ? `Repository: ${repoPath}` : "No external repository linked.",
          "Action: run audit-phase-gate checklist before the next projects step.",
          "Verify journals include file paths and check results.",
        ].join("\n"),
        severity: "medium",
        metadata: { phaseId: phase.id, hook: "phase_completion" },
      });
    }
  }
}

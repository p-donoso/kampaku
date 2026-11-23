/**
 * @module application/pm/baseline-checks
 *
 * **What was already red before this job ran.**
 *
 * A repair leaf is judged on two things: the checks it was told to make pass, and that it made nothing worse. The
 * second half needs a before, and without one the only rule available is *no red record at all* — which forbids a plan
 * with two independent defects from starting at all: the first repair records the aggregate runner red because the
 * other defect remains, so it cannot close, so nothing ever dispatches the second. Measured 2026-11-09 on suite 19 run
 * `s19r17`: L2 wrote the correct two-line fix, `checks/test_parse.py` went green, and the aggregate stayed red on
 * `checks/test_totals.py` — L3's defect — and L2 was refused `evidence_failed: test`. L3 was behind L2.
 *
 * So the baseline is the newest check record **already in the project's journal** when this job started, and a red
 * that was red then is not this item's doing. The platform does not invent it: if no job has recorded results, there is
 * no baseline and every red counts, exactly as before (`eval 14/24`, whose fixture records no baseline).
 *
 * The limitation, stated rather than hidden: two leaves dispatched concurrently would share a baseline and could
 * attribute a regression to the wrong one. The work-item ordering runs one leaf at a time.
 */

import type { JournalStore } from "../../persistence/journal-store.js";
import type { Store } from "../../persistence/store.js";

/**
 * The recorded check results of the newest job in this project **other than** `currentJobId`.
 *
 * Ordered by the journal's own timestamps and read newest-first, so the answer is the last observation of the
 * repository before this job's, which is what "before" means in a project that dispatches one leaf at a time.
 */
export interface BaselineObservation {
  /** The check records of the last job before this one, when it wrote any. */
  checkResults?: Record<string, unknown>;
  /** The subjects that were already **red** in that job's evidence. */
  failedSubjects: ReadonlySet<string>;
}

/** The last job in this project other than `currentJobId`, as the before-picture of the repository. */
export function baselineBefore(
  ctx: { store: Store; journalStore?: JournalStore },
  projectId: string,
  currentJobId: string,
): BaselineObservation | undefined {
  const journalStore = ctx.journalStore;
  if (!journalStore) return undefined;

  const entries = journalStore.listByProject(projectId, {
    kinds: ["completion_report"],
    limit: 50,
  });
  for (const entry of entries) {
    if (entry.refType !== "job" || !entry.refId || entry.refId === currentJobId) continue;
    const output = ctx.store.getJobResult(entry.refId)?.output;
    if (!output || typeof output !== "object") continue;
    const shaped = output as Record<string, unknown>;
    const recorded = shaped.checkResults;
    const evidence = shaped.evidence;
    const failedSubjects = new Set<string>();
    if (Array.isArray(evidence)) {
      for (const record of evidence as Array<Record<string, unknown>>) {
        if (record?.passed === false && typeof record.subject === "string") failedSubjects.add(record.subject);
      }
    }
    const hasChecks = recorded && typeof recorded === "object";
    if (!hasChecks && failedSubjects.size === 0) continue;
    return {
      ...(hasChecks ? { checkResults: recorded as Record<string, unknown> } : {}),
      failedSubjects,
    };
  }
  return undefined;
}

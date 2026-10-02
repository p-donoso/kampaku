# Kickoff — F-088, a leaf that succeeded twice and cannot close, with no surface saying why

Kampaku eval lab. A **blocking** product defect, measured on suite 08's re-run `s08r9`. You do the work; I do not.

Read the measurement first — it is the whole brief:

`.kampaku/runs/s08r9/logs/s08r9-f088-measurement.md`
`.kampaku/runs/s08r9/logs/s08r9-runlog.md` (§ The wall, § What the run also measured)

Supporting, in this order:

1. `docs/eval/results/BOARD.md` — read [F-084] (the nearest resolved row: *a gate the operator can stop on must
   be a gate the operator can read and discharge*) and [F-082] (whose closure claim this run contradicts).
2. `docs/eval/08-hands-off-execution.md` § *What run `s08r7` still does not do*.
3. `docs/eval/NEXT-SESSION.md` — how this lab's work is done: a row is closed by live measurement and never by
   argument, one reviewable commit per piece on `develop`, every row gets a lock.

## The defect, in one line

A work item reads `blocked` while its job `succeeded`, its checks are green, its evidence is recorded, its
completion report is in the journal, its manual-evidence gates were answered by the operator — and the only
surface that reports the block names **three possible causes, all of which are absent**:

```text
GET /api/v1/projects/textstats/execution →
  gate.reason            "blocked_task"
  gate.detail            "Document the CLI in README.md"
  nextStep.blockedReason "Task is blocked by an error, pending question, or blocker."

GET /api/v1/questions?status=pending → 0
GET /api/v1/blockers                 → {"blockers": []}
```

`kampaku projects step textstats` — the operator surface the front office itself named — re-ran the leaf and
changed nothing. Two succeeded jobs (13 and 9 iterations) and two operator decisions were spent on it.

## Where the pieces are

- The refusal itself: `apps/core/src/application/pm/project-execution-gate.ts` (`blocked_task`) and the
  `blockedReason` string in `apps/core/src/application/pm/execute-project.ts` (or wherever
  `getProjectExecutionState` builds `nextStep`).
- The closure path: `syncWorkItemFromJobResult` in `apps/core/src/application/pm/execute-work-item.ts`, called
  from `PUT /api/v1/jobs/:jobId/result` in `apps/core/src/api/app.ts`.
- The manual-evidence path: `applyAnsweredManualEvidence` and the `evidence_review_resolved` journal kind — this
  run is the measurement that answers do **not** re-evaluate closure into a close (a second job was needed).
- The live specimen: `.kampaku/runs/s08r9/data`, project `textstats`, leaf
  `5b240606-ddfc-48a4-aabf-b052d2380cd6`, jobs `336c608a-b2a1-4cfb-8f74-5a572bda2522` and
  `c3548b81-f4ff-46da-ad1e-99693ef41b61`. Start Core over a **copy** of that data dir and read it; do not
  start a fresh one.

## Done means

- **The reason is legible.** When a work item reads `blocked` and no question and no blocker is pending, the
  surface says *what* blocks it — the item, the field, and the rule that refused — instead of a sentence listing
  three causes the operator has to disprove one by one.
- **The discharge exists.** Whatever the blocking condition is, there is a documented operator path that clears
  it, beside `kampaku risks …` and `kampaku projects play|step|pause`. A block the operator cannot read or clear
  is a hands-off stop, which is the property this suite scores.
- **An answered manual-evidence gate closes the leaf it was raised for**, without spending a second job — either
  it does, and [F-082]'s claim is true, or the claim is corrected in the row and the reason the answer did not
  take effect is named. Do not leave both readings standing.
- Measured on the live instance over the copy of the `s08r9` data dir, and the row is patched with **what was
  measured**. One reviewable commit on `develop`, conventional commit with a scope. `docs/eval/results/BOARD.md`
  gets the row, `docs/eval/results/LEARNINGS.md` the lesson, `docs/eval/08-hands-off-execution.md` the sentence
  it changes. The tree may carry untracked `docs/eval/prompts/` and another session's edits — **leave alone what
  you did not touch**.

## Out of scope

- Re-running suite 08 and its verdict — that happens on a fresh data dir after this lands.
- [F-085] (a reply denying a check that ran), [F-078] (no public job list) and [F-087] (the criterion router
  reading words inside a path). Each is its own row.
- `submit_intent` answering `Maximum call stack size exceeded`. The product reported it again in this run (the
  lead could not persist a phase-gate leaf, twice); it was not reproduced by the run's own instruments. If you
  hit it while fixing this, record it as its own row with the reproduction — do not fold it in.

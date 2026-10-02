# Kickoff — F-089, a container that reads blocked and no operator action clears it

Kampaku eval lab. A **blocking** product defect, measured on suite 08's third re-run `s08r10` (fresh data dir,
git `c6e062d`, eleven driven turns). You do the work; I do not.

Read the measurements first — they are the whole brief:

- `.kampaku/runs/s08r10/logs/s08r10-p6-release.out`, `…-p7-release.out`, `…-p8-release.out`,
  `…-p10-release.out`, `…-p11-files.out` — the five turns that hit the wall, verbatim.
- `.kampaku/runs/s08r10/logs/s08r10-p*-watch.log` — 15-second samples of every turn, including the
  `runningJobs 0 → 1 → 0` and the job ids read back by id.
- `.kampaku/runs/s08r10/logs/s08r10-f089-refusal-attribution.md` — the **smallest leg of this row is already
  fixed** (see below). Read it before you start, so you do not re-do it.

Supporting, in this order:

1. `docs/eval/08-hands-off-execution.md` § *The third re-run, and the deadlock it measured* — what this run
   measured, box by box, and the 7/10 it scored.
2. `docs/eval/results/BOARD.md` — **[F-089]** (this row), **[F-088]** (the nearest resolved row: *a gate the
   operator can stop on must be a gate the operator can read and discharge* — this row is that fix reporting a
   closure every read contradicts), and **[F-090]** (the split that is *not* this chat's work).
3. `docs/eval/NEXT-SESSION.md` — how this lab's work is done: a row is closed by live measurement and never by
   argument, one reviewable commit per piece on `develop`, every row gets a lock verified red without it.

## The defect, in one line

A phase container that reads `blocked` **cannot be closed by any operator action, and refuses every item under
it** — while the one action the product prints as its discharge reports a closure that every read-back
contradicts.

```text
$ kampaku projects blocked textstats
c04462e4-fdf5-46f1-835a-b36cd53e4d29  CLI surface and packaging
  "CLI surface and packaging" (c04462e4) is blocked and no closure decision naming
  the rule is on record for it.

$ kampaku projects closure c04462e4-fdf5-46f1-835a-b36cd53e4d29
"CLI surface and packaging" is done. No new job was spent.        ← the discharge says it closed

$ kampaku projects show textstats
    - [blocked] CLI surface and packaging → textstats-lead          ← every read-back disagrees
$ curl -s /api/v1/projects/textstats | …                            → blocked / failed
$ sqlite journal for c04462e4                                       → no entry written at all

$ execute_work_item(447e4e2b)
{"ok":false,"error":"Parent \"CLI surface and packaging\" (c04462e4) is blocked: …"}
                                                                    ← naming a parent that reads `done`
$ kampaku projects retry 56d76ca8-99ba-467d-8ed6-d207b1410109
400 — "Parent … (b7421984) is blocked"                              ← then, once that parent's criteria are
400 — "Only blocked tasks can be retried."                              decided: a different refusal
```

And the product's own documented escape hatch — *triage, split and phase-gate items are releasable even under
a blocked ancestor* — was **tested and falsified by the front office, in its own words**:

> *"The gate follows the parent chain, not the item kind, so 'releasable under a blocked ancestor' does not
> hold here."*

Of the items under `8419cdbd`, **none** released: `4bdfc9f9`, `447e4e2b`, `593b665a`, `2edbed14` all stayed
put, and a delegated prerequisite (`71c6522e`) was refused too. The three items that *did* release
(`590ed5ad`, `4641119b`, `56ebe716`'s split) are all **project-top-level**. Net state after eleven turns:
**4 jobs, all `succeeded`**, four leaves and the first phase container closed, and **seven items blocked**.

## The mechanism, as far as the run got

- **A derived status overrides the stored one on read, and the actions read the stored one.**
  `apps/core/src/application/pm/work-item-status-rollup.ts` — `applyWorkItemStatusRollup` /
  `rollupWorkItemTreeWithExecution` **derive** a parent's status from its children
  (`deriveParentWorkItemStatus` → `blocked` if any child reads blocked) and overwrite the stored column in the
  returned tree; `apps/core/src/persistence/pm-store.ts` still holds what was written. So `projects show` and
  `GET /api/v1/projects/:slug` (rollup) and `projects retry` / the release gate (column) disagree **about the
  same item** — measured both ways on one id.
- **The discharge reports a closure that nothing else confirms.** `kampaku projects closure <id>` writes the
  column and prints success; `apps/core/src/cli/commands/projects.ts:492`; the journal write and the read-back
  are what is missing.
- **The release gate follows the parent chain, not the item kind.**
  `apps/core/src/application/pm/work-item-order.ts` (`checkRelease`): the `blockedAncestor` arm runs for every
  leaf, and the `isBlockerTriageWorkItem / isLeafSplitWorkItem` escape is checked **after** the
  `leaf.status === "blocked"` arm — so an item born inside a blocked container is refused by the container.
- **A container's closure rule is not its children's.** `decideWorkItemClosure` in
  `apps/core/src/application/pm/execute-work-item.ts` decides a container against **its own** settled job (the
  container does have one, from its delegation), which is why it reads `done` while the tree reads `blocked`.
  This is the same specimen the already-fixed leg exposed: on a copy of the run's data dir the container
  reports *"its settled job satisfies every closure rule that now stands. Re-decide it, without spending a
  job"* — you re-decide it, and it still reads blocked.

## The live specimen (do not start a fresh data dir for this)

`.kampaku/runs/s08r10/data`, git `c6e062d`, project **`textstats`**, fixture
`file:///home/pdonoso/projects/eval-seed-py`. The stack for this run is **up** on the run's own ports
(`KAMPAKU_CORE_PORT=28080`, web `28002`); drive it through `.kampaku/runs/s08r10/logs/s08x10.sh <cmd>`, which
sources the run's env (`KAMPAKU_DOTENV_OVERRIDE=0` matters — the repository `.env` otherwise wins).

- Container `c04462e4-fdf5-46f1-835a-b36cd53e4d29` ("CLI surface and packaging") — **stored `done`** today,
  because this session ran its discharge over it and the tree still reads `blocked`; the item the row is about.
- Its parent `8419cdbd-2f80-4140-b53d-14ac16e099fa` ("textstats CLI slice") — `blocked`, seven items under it.
- Refused releases: `447e4e2b-2640-4315-acf4-edba7d8420bf` (smoke test + README), `593b665a-ec04-4265-8f03-6478a637ffd6`
  (independent verification), `2edbed14-0797-434b-aae7-80d67d71b236` (phase audit).
- The slice that closed with its parent's deliverable missing: `56d76ca8-99ba-467d-8ed6-d207b1410109`.
- Four succeeded jobs on the run's leaves; read any of them back with
  `GET /api/v1/jobs/<jobId>` (`0ffd33d8`'s job: `e99664c6…`).
- One question is **still pending** in this run (`81d0e84f-d8f9-4428-af3d-a80b1b920bc7`, "How do you want the
  `8419cdbd` container gate resolved?"). Answer it through the browser when your fix changes what the right
  answer is; the run's gates are answered with `.kampaku/runs/s08r10/logs/s08-gates.mjs`.

## Done means

- **Closing an item and reading its status are the same fact.** If a status is derived (rollup, pending
  escalation, blocked child), the derivation is on **every** surface that acts on it, or the actions act on the
  derivation. A surface that prints *"is done"* and a surface that prints `[blocked]` for the same id, in the
  same second, is the defect.
- **A block any item can be stopped by is a block the operator can clear.** Including a **container**: name the
  rule, name what it is waiting on, and give a command that actually changes the state — with the read-back
  shown, not asserted.
- **An item born inside a blocked container is releasable where its kind says it is.** Triage, split and
  phase-gate items exist to clear what their container is blocked on; a gate that refuses them because of the
  container they were created under is a deadlock, not a rule. Either the gate honours the item kind, or the
  product stops claiming that it does — do not leave both readings standing.
- **Patched with what was measured.** `docs/eval/results/BOARD.md` gets the row (status, the mechanism, the
  reproduction, the lock), `docs/eval/08-hands-off-execution.md` the sentences it changes, and the run dir the
  transcript. One reviewable commit on `develop`, conventional commit with a scope. A lock in
  `apps/core/tests/eval/` (or `tests/pm/`) verified **red without the fix**. The tree may carry untracked
  `docs/eval/prompts/` and another session's edits — **leave alone what you did not touch**.

## Out of scope (each is its own row — do not fold them in)

- **[F-090]** (the auto-split writing a file its parent criterion freezes, and dropping the parent's
  deliverable): measured on the same run, own row, own chat.
- **[F-078]** (no public job list — `GET /api/v1/jobs` → 404, `kampaku jobs` only `show`/`watch` by id),
  **[F-085]**, **[F-087]**, and `submit_intent` answering `Maximum call stack size exceeded`.
- **Re-running suite 08 for its verdict** — that happens on a fresh data dir after this lands.

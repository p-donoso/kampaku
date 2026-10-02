# Kickoff — F-086, the auto-split that writes npm criteria into a Python repository

Kampaku eval lab. A **blocking** product defect, measured on suite 08's re-run `s08r8`. You do the work; I do not.

Read the measurement first — it is the whole brief, with the reproductions:

`.kampaku/runs/s08r8/logs/s08r8-f086-split-measurement.md`

Supporting, in this order:

1. `docs/eval/results/BOARD.md` — [F-083](../results/BOARD.md) is the nearest resolved row:
   a criterion quoting a command was routed to a verifier that cannot run it. This is the same family one
   layer earlier, where the criterion is **written**.
2. `docs/eval/08-hands-off-execution.md` § *What run `s08r7` still does not do*, and [F-085](../results/BOARD.md).
3. `docs/eval/NEXT-SESSION.md` — how this lab's work is done: a row is closed by live measurement and never by
   argument, one reviewable commit per piece on `develop`, a row gets a lock.

## The defect, in one line

`execute_work_item` on a leaf whose description and criteria mention more than three file paths runs
`applyDeterministicLeafSplit`, which **replaces the leaf's repository-specific acceptance criteria with a
hardcoded npm template** — in a Python checkout with no `package.json`. The template's own text then matches
the npm-script detector, so a second split turns `npm test succeeds when package.json defines a test script`
into `npm run test succeeds`, and an unordered extension alternation turns `package.json` into `package.js`,
which the child then requires to exist.

Measured on the live instance, all three:

```text
extractImpliedFilePaths("npm test succeeds when package.json defines a test script")  → ['package.js']
extractImpliedNpmScripts("npm test succeeds when package.json defines a test script") → ['test']
extractImpliedNpmScripts("npm run test succeeds")                                     → ['test']
```

## Where the pieces are

- `apps/core/src/application/pm/leaf-splitter.ts` — `isOverweightLeaf`, `applyDeterministicLeafSplit`,
  `ensureLeafSplitWorkItem`.
- `apps/core/src/delegator/plan-validation.ts` — `extractImpliedFilePaths`, `extractImpliedNpmScripts`,
  `SCRIPT_PATTERNS`, `FILE_PATH_PATTERN`.
- `apps/core/src/application/pm/work-item-checks.ts` and `apps/worker/src/tools/worker-verification.ts` — the
  script vocabulary the worker actually runs, which is where a stack-neutral answer already exists.
- The live specimen: `.kampaku/runs/s08r8/data`, project `textstats`, leaf
  `e811808c-6c03-4481-bdc6-b380d317a742` and its children `d1d794ea`, `9ec…`/`ec8ca48b`, `9b8ff7e6`.
  Read it through `GET /api/v1/projects/textstats` — do **not** start a fresh data dir; the specimen is there.

## Done means

- A leaf is only "overweight" for a reason that survives a non-Node repository: the paths a criterion merely
  **mentions** and the text a previous split **wrote** must not by themselves make it overweight.
- A split's acceptance criteria come from the **project's own toolchain** — derived from the checkout the
  project is linked to, the same vocabulary `work-item-checks.ts` uses — never from an npm-shaped template.
  A Python checkout's children must be checkable with `make check`; a Node checkout's with its own scripts.
- `package.json` does not parse as `package.js`, and no criterion names a file that cannot exist.
- A tool-decidable criterion is never replaced by one no tool can decide.
- The behaviour is measured on the live instance (the specimen above is ideal: split that leaf's tree or a copy
  of it and show the children's criteria), and the row is patched with **what was measured**, not what was
  intended. `docs/eval/results/BOARD.md` gets the row, `docs/eval/results/LEARNINGS.md` the lesson if there is
  one, and `docs/eval/08-hands-off-execution.md` the sentence it changes.
- One reviewable commit on `develop`, conventional commit with a scope. The tree may carry untracked
  `docs/eval/prompts/` from an earlier session — leave alone what you did not touch.

## Out of scope

- Re-running suite 08 and its verdict — I do that after this lands, on a fresh data dir.
- [F-085](../results/BOARD.md), the reply denying a check that ran. This run reproduced it
  sharply (the item that carried the green check was cancelled by the split path, so the block every turn
  carries lost the fact) but it is its own row and its own session.
- `submit_intent` answering `Maximum call stack size exceeded`. The product reported it; this run did not
  reproduce it. If you hit it while fixing this, record it as its own row with the reproduction — do not fold
  it into this fix.

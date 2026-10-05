# Kickoff — F-078, no public job list, so a job exists only by an id you already have

Kampaku eval lab. An **open, non-blocking** product defect — it is one of the two oracle bullets that no box in
suite 08 carries, and it has now been re-measured on three separate runs. You do the work; I do not.

Read the measurements first — they are the whole brief:

- `docs/eval/results/BOARD.md` — **[F-078]** (this row).
- `docs/eval/08-hands-off-execution.md` § *Oracle*: *"The execution surface (job list, per-job progress or logs)
  is reachable by a public route; a job that exists only by id is a finding."* — this row **is** that finding.
- `.kampaku/runs/s08r12/logs/s08r12-p2-progress.out` — the answer to *"What is happening right now, and which
  job is doing it?"*, asked while the beat ran.

## The defect, in one line

A job is readable **by id** and there is **no way to enumerate jobs** — so the only route to the execution plane
is an id you already have from somewhere else, and the product's own status surface reports counts with no way
to resolve them into the things being counted.

```text
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:28082/api/v1/jobs
404                                              ← re-measured today, on s08r12
$ curl -s http://127.0.0.1:28082/api/v1/runtime/status
{"workersOnline":1,"workersKnown":1,"queuedJobs":0,"runningJobs":0,"zombieJobs":0}
                                                 ← counts, and no way to ask "which"
$ kampaku jobs --help
Commands:
  watch <jobId>   Poll an existing job until it reaches a terminal status
  show <jobId>    Show the current status of a job
```

The workaround the lab has been living with is visible in suite 08's own instrumentation: `s08-snapshot.sh` and
`s08-watch.sh` walk the **project tree** to harvest `jobId` off each work item and then read each job one at a
time. That is a client reconstructing an index the server already holds — and it only works while every job is
attached to an item you can enumerate, which is exactly what a **failed or orphaned** job is not. This run is the
demonstration: 3 jobs, all reachable, but only because all three were attached to leaves somebody could walk.

## The live specimen (do not start a fresh data dir for this)

`.kampaku/runs/s08r12/data`, git `1fad3f1`, project **`textstats`**, fixture
`file:///home/pdonoso/projects/eval-seed-py`. The stack is **up** on the run's own ports
(`KAMPAKU_CORE_PORT=28082`, web `28004`); source `.kampaku/runs/s08r12/run.env` —
`KAMPAKU_DOTENV_OVERRIDE=0` matters.

- Three jobs with three different shapes: `52d2a06b` (8 iterations, `lint`/`check`/`test`, two files),
  `be0ac35f` (7), `0c3ea6ec` (12, one required check). All `succeeded`; the run also has the **cancelled** slices
  `f0324fc6` and `36e590ac` in the tree with no job under them, which is the other half of the argument.
- The lab's own client-side index, for comparison: `.kampaku/runs/s08r12/logs/s08-snapshot.sh` and
  `s08-items.py`.
- The run logs sampled every 15 s while jobs ran: `.kampaku/runs/s08r12/logs/s08r12-p*-watch.log`.

## Done means

- **A job can be enumerated without an id.** Whatever the surface is — `GET /api/v1/jobs`, a filter on the
  runtime status route, `kampaku jobs list` — an operator can get from *"`runningJobs: 1`"* to *the job that is
  running* in one call, and the CLI and the route agree about what exists.
- **A job no longer reachable from any work item is still reachable.** An orphan is precisely the case where the
  client-side index fails, and precisely the case an operator is looking for a job list to find. If your
  implementation filters by project, say how an unattached job is found and assert it.
- **The list says what the ids are for.** At minimum: id, status, the work item or goal it belongs to, and the
  times. A list of bare ids repeats the defect one level up.
- **Patched with what was measured.** The BOARD row gets the fix, its lock, and the live re-measurement (a run
  in flight, read from the list alone); `docs/eval/08-hands-off-execution.md` gets its oracle bullet re-read —
  **this row is what that bullet fails on today**, and if the fix closes it, the suite's checklist entry moves
  with it. **One reviewable commit on `develop`**, conventional commit with a scope. A lock in
  `apps/core/tests/api/` (or `tests/eval/`) verified **red without the fix**. The tree may carry untracked
  `docs/eval/prompts/` and another session's edits — **leave alone what you did not touch**.

## Out of scope (each is its own row — do not fold them in)

- **[F-053]** (the landed file ledger exists and no front-office tool reaches it) — genuinely adjacent: a job list
  is a plausible place for that read to live, and **it is still a separate row**. If you fix both, two commits,
  and say in the second which row it closes.
- **[F-101]**, **[F-102]**, **[F-096]** — open, and not this chat's work.
- **Re-running suite 08 for its verdict** — its score is held down by F-053's boxes, not by this bullet.

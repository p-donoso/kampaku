# Kickoff — F-053, the file ledger exists and no front-office tool reaches it

Kampaku eval lab. This chat **refines an existing row** with a measurement that changes its shape, so read the
row before the brief: [F-053](../results/BOARD.md) was opened as *a reply that states a command result nothing
obtained*. `s08r12` re-measured it and found something narrower and more fixable: **the result is obtained, it
is durable, it is correct on every job — and the seat that is asked for it does not hold the tool that reads
it.**

Read the measurements first — they are the whole brief:

- `.kampaku/runs/s08r12/logs/s08r12-p3-files.out` — the answer to suite 08's prompt 3, *"Which files did you
  create or change, and which check proves each one?"*, verbatim. The whole defect is in it.
- `.kampaku/runs/s08r12/logs/s08r12-final.json` — the durable state the same turn was standing on.
- `docs/eval/08-hands-off-execution.md` § *The fifth re-run, and the freeze that held*, and the checklist
  re-read above it: **this is the box that keeps suite 08's score from moving**
  (`P1` and the *reply-claims-against-the-filesystem-diff* box).
- `docs/eval/results/BOARD.md` — **[F-053]** (this row), **[F-080]** (**resolved**: *the completion report's
  `filesChanged` is `null` on all three jobs* — that fix landed, and this row is what its fix now cannot reach),
  **[F-097]** (resolved, and its lock is the one you will want to imitate).

## The defect, in one line

Every job carries a correct, durable `filesChanged`; the front office holds `get_project`,
`get_agent_dashboard` and `get_project_journal`, and **none of the three can read a job** — so the one question
suite 08 asks about traceability is answered from *declarations*, in a reply that says so itself.

```text
GET /api/v1/jobs/52d2a06b-bc60-49d1-a236-219734082760
  output.filesChanged: ["src/textstats/cli.py", "src/textstats/__main__.py"]     ← durable, correct
  GET /api/v1/jobs/be0ac35f-…  → ["tests/fixtures/sample.txt", "tests/test_cli.py"]
  GET /api/v1/jobs/0c3ea6ec-…  → ["README.md", "AGENTS.md"]

and the answer the emperor got, from .kampaku/runs/s08r12/logs/s08r12-p3-files.out:

  "I created no files and changed none. I hold no tool that writes to a repository and none that runs a
   command, so there is no file list to give you, and no check I can point to as one I ran."
  "The paths are declarations, not a landed-file list. I have not read a list of files changed on the
   checkout."

tools on that turn: get_project, get_agent_dashboard, get_project_journal
```

The filesystem agreed with the jobs to the byte (`src/textstats/cli.py`, `__main__.py`,
`tests/test_cli.py`, `tests/fixtures/sample.txt`, plus edits to `README.md` and `AGENTS.md`), so the reply was
not wrong about its own capability — it was **right about it, and that is the defect**. A product whose front
office cannot answer *what changed* except by asking someone else to look is a product that cannot close its own
loop, and the honest-answer shape of the failure is the only reason it reads as a limitation instead of a lie.

## The live specimen (do not start a fresh data dir for this)

`.kampaku/runs/s08r12/data`, git `1fad3f1`, project **`textstats`**, fixture
`file:///home/pdonoso/projects/eval-seed-py` (the beat's artifacts are still on disk, uncommitted — this is what
"landed" looks like). The stack is **up** on the run's own ports (`KAMPAKU_CORE_PORT=28082`, web `28004`);
source `.kampaku/runs/s08r12/run.env` — `KAMPAKU_DOTENV_OVERRIDE=0` matters.

- The three jobs above, each readable by id through `GET /api/v1/jobs/<id>`; `output.filesChanged` is the ledger.
- The project tree with `jobId` on every item — the one hop a front-office tool *can* currently make:
  `GET /api/v1/projects/textstats`.
- The claim-versus-disk question this row is measured against, both directions: **claimed but missing** was
  [F-097], **present but unclaimed** was [F-090] and this run's earlier direction. Neither holds here; the
  ledger is simply unreachable.

## Done means

- **The seat that is asked *what changed* can read what changed.** Somewhere in the front office's toolset there
  is a read that returns a job's landed file list and its check results — by job id, or per project, or on the
  project read itself. The choice is yours; the assertion is a test that drives the tool and compares it to the
  disk.
- **The answer is checked against the filesystem, not against the declaration.** A tool that returns
  `filesChanged` unchanged would still let the product answer a question it cannot verify — `s08r12`'s four
  named files were on disk, and a reply built on declarations would have been right by luck. The direction both
  earlier runs failed in (**claimed but missing**, **present but unclaimed**) is one test each, and both must be
  in the lock, or the commit says which one cannot be asserted and why.
- **An answer that cannot be produced says so, and names what it would need.** This run's reply already does the
  first half — keep that property, it is the only reason the row is diagnosable. The second half is what turns a
  limitation into a task.
- **Patched with what was measured.** The BOARD row is **updated, not duplicated** — its title's claim (*a reply
  that states a command result nothing obtained*) no longer describes the specimen, and leaving it standing tells
  the next session to fix something that is already fixed. It gets the refinement, the fix, its lock, and the
  live re-measurement (prompt 3 asked again, answered from the filesystem).
  `docs/eval/08-hands-off-execution.md` gets the sentences it changes and its two boxes re-read.
  **One reviewable commit on `develop`**, conventional commit with a scope. A lock in
  `apps/core/tests/api/` or `tests/pm/` verified **red without the fix**. The tree may carry untracked
  `docs/eval/prompts/` and another session's edits — **leave alone what you did not touch**.

## Out of scope (each is its own row — do not fold them in)

- **[F-101]** (a route that answers 201 to a field it does not read) and **[F-102]** (a plan approved with one
  roster and applied with another) — this run's two new rows, own chats.
- **[F-078]** (no public job list) — **adjacent and deliberately separate**: F-078 is the *enumeration* route, a
  job remains readable by id today, and this row is about the read the front office does not have. A fix that
  does both is two fixes in one commit; say so if you decide otherwise.
- **Prompt 3's per-file *check* trace** — the other half of the same oracle bullet, and not this row: no station
  in a project line holds a shell, so a file cannot be mapped to a check command it cannot run.

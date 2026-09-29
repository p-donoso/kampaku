# Next session — take suite 08

Kampaku eval lab, suite **08 — hands-off execution**.

Read these first, in this order:

1. `docs/eval/README.md` — how the lab runs, what a score means, what the protocol demands.
2. `docs/roadmap/README.md` § **Resume here** — where the work stands. Its `Next action` names what is left.
3. `docs/eval/08-hands-off-execution.md` — the suite itself: promise, prompts, oracle, gates, how to measure.
4. `docs/eval/07-plan-a-human-can-run.md` — the previous suite's run log is the shape to follow: prereqs, fixture,
   prompts with their tool calls, oracle state before and after each prompt, result, evidence, honest gaps. It
   ended at **10/10** on run 20 and its § Blocker says what it left open.
5. `docs/eval/00-protocol.md` — the run protocol, including what a fresh data dir means.
6. `docs/eval/results/BOARD.md` — the rows. **[F-072](results/BOARD.md) is `open` and does not block this suite.**
   If a row does block it, fix it in the moment and record it, and if this suite finds a new one, add a row with
   the measurement that produced it.

Suites 01–07 have run: 04 is closed at 10/10, 05 at 8/10, 06 at 6/10, **07 at 10/10**, and 01–03 hold earlier
verdicts.

## How this work is done

- **You do the work; I do not.** Run the factory, drive it, and report. Bring me a question only when the product
  asks for a decision a human must make, and answer through a real human gate when one exists.
- **If a gap blocks progress, fix it now** and keep going. Record the fix as a board row with its own lock, and
  re-measure the suite's affected box on the live instance — never close a row by argument.
- **CLI is the canonical record:** `node apps/core/dist/cli.js` (`chat -m`, `projects`, `jobs`, `questions`,
  `agents`, `plans`). Use the web UI for human gates and for the browser gates the suite names.
- **Instrumentation lives outside the repo** (`~/.kampaku-eval-01/{run.env,oracle.py}`), and the run log inside the
  repo. Keep them separate.
- **One commit per phase on `develop`**, conventional commit with scope. Keep the tree clean.
- **A run log that only records what passed is not a run log.** Write the gaps down.

## What is different about suite 08, and it is most of the work

Suite 07 scored a plan that nothing executed: run 20 planned seven work items and **zero jobs** was correct,
because the front office had not been released. Suite 08 is the beat where that plan is executed. Three
consequences:

- **The worker has to be up.** `scripts/start.sh` starts Core *and* the worker; a Core-only boot produces a
  project whose jobs never move. The suite's oracle wants progress **observable while it runs**, on a public
  surface — so the run log needs a sample taken mid-flight, not a job list read afterwards.
- **A real checkout is written to.** The fixture must be a project the product can actually run checks in, and
  the suite measures `git -C <platform checkout> status --porcelain` **before and after the beat** — the diff this
  beat caused, not a comparison against a pristine tree.
- **Two claims are checked against the filesystem in both directions:** a file the reply says it wrote must
  exist, and a file that exists must be claimed by the reply. Claimed-but-missing and present-but-unclaimed are
  both findings.

## Prereqs to settle before prompt 1

- **The approved plan suite 07 produced is the cheapest entry**: `~/.kampaku-eval-07r20` holds `textstats` with
  seven work items at `todo`, a phase gate, and a checkout at `/home/pdonoso/projects/eval-seed-py` that has a
  real toolchain (`make check`, `make lint`). **The suite requires a fresh data dir for its own run**
  (`docs/eval/00-protocol.md`), so decide explicitly: either re-take a plan in the new data dir, or record why
  this beat reuses run 20's — and say which in the run log. Do not silently mix the two.
- **The project's check commands must run on the produced artifacts**, and the fixture is the only place that can
  be true. Confirm `make check` and `make lint` exit 0 in the checkout *before* granting it, and record the
  command output.
- **This machine's usual trap is armed:** the repository `.env` is loaded *after* the run's own environment, so
  the CLI needs `KAMPAKU_DOTENV_OVERRIDE=0` (or a sourced `run.env`) or it talks to whatever `.env` names — a
  different port, a different data dir — and reports `fetch failed` against a healthy Core.
- **Ports are the declared block** ([local ports](../development/local-ports.md)). Suite 07's run used 18098 and
  left the Core killed; `[F-016](results/BOARD.md)` is open and says `start.sh`/`stop.sh` cannot reclaim a port a
  killed Core leaves, which cost that session two runs. Check the port is free before you start, and budget for
  the wait if it is not.
- **A healthy model endpoint**, with the endpoint and its observed latency recorded in the run log. Suite 07's
  run 20 measured 1.0 s before the run and answered a planning turn in 4 m 22 s; the default turn budget is now
  **15 minutes** ([F-058](results/BOARD.md)) and every call inside a turn is bounded by what is left of it
  ([F-070](results/BOARD.md)), so a turn that stops says so in numbers.
- **Nothing executes before the plan is approved.** The suite tests this directly: a prior vague *"start now"* in
  the same data dir does not authorize execution. Include that measurement rather than assuming it.

## Deliverable

The suite taken to a verdict: every gate ticked or explicitly not, a score with its reasons, the run log, the
evidence, and `docs/roadmap/README.md` updated to say where the work now stands. **Suite 07's pattern is the
standard**: fix what blocks the oracle in the moment, lock each fix with a test, re-measure on the live instance,
and leave the open rows open with the measurement that opened them.

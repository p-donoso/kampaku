# Next session — take suite 06

Kampaku eval lab, suite **06 — greenfield stranger repository**.

Read these first, in this order:

1. `docs/eval/README.md` — how the lab runs, what a score means, what the protocol demands.
2. `docs/roadmap/README.md` § **Resume here** — where the work stands. Its `Next action` names this suite.
3. `docs/eval/06-greenfield-stranger-repo.md` — the suite itself: promise, prompts, oracle, gates, how to measure.
4. `docs/eval/05-intent-to-work-order.md` — the previous suite's run log is the shape to follow: prereqs, fixture,
   prompts with their tool calls, oracle state before and after each prompt, result, evidence, and the honest gaps.
5. `docs/eval/00-protocol.md` — the run protocol, including what a fresh data dir means.
6. `docs/eval/results/BOARD.md` — the rows. Nine are `open`; if one blocks this suite, fix it in the moment and
   record it, and if the suite finds a new one, add a row with the measurement that produced it.

Suites 01–05 have run. 04 is closed at 10/10, 05 at 8/10, 01–03 hold earlier verdicts.

## How this work is done

- **You do the work; I do not.** Run the factory, drive it, and report. Bring me a question only when the product
  asks for a decision a human must make, and answer through a real human gate when one exists.
- **If a gap blocks progress, fix it now** and keep going. Record the fix as a board row with its own lock, and
  re-measure the suite's affected box on the live instance — never close a row by argument.
- **CLI is the canonical record:** `node apps/core/dist/cli.js` (`chat -m`, `projects`, `jobs`, `questions`,
  `agents`). Use the web UI for human gates and for the browser gates the suite names.
- **Instrumentation lives outside the repo** (`~/.kampaku-eval-01/{run.env,oracle.py}`), and the run log inside the
  repo. Keep them separate.
- **One commit per phase on `develop`**, conventional commit with scope. Keep the tree clean.
- **A run log that only records what passed is not a run log.** Write the gaps down.

## Prereqs to settle before prompt 1

- Suites 01–05 green (they are).
- An empty directory **outside** the platform checkout for `<PATH>` — the suite's own example is
  `/home/pdonoso/projects/eval-seed`. It must be inside a folder the factory has been allowed; see the root
  `README` § *Where a project may live* for the command, and grant it before the first prompt rather than
  discovering the refusal mid-run.
- A healthy model endpoint. Record the endpoint and its observed latency in the run log: the last two suites were
  measured on both a degraded and a healthy ladder, and the difference is visible in wall clock.

## Deliverable

The suite taken to a verdict: every gate ticked or explicitly not, a score with its reasons, the run log, the
evidence, and `docs/roadmap/README.md` updated to say where the work now stands.

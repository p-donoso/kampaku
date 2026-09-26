# Next session — take suite 07

Kampaku eval lab, suite **07 — a plan a human can run**.

Read these first, in this order:

1. `docs/eval/README.md` — how the lab runs, what a score means, what the protocol demands.
2. `docs/roadmap/README.md` § **Resume here** — where the work stands. Its `Next action` names this suite.
3. `docs/eval/07-plan-a-human-can-run.md` — the suite itself: promise, prompts, oracle, gates, how to measure.
4. `docs/eval/06-greenfield-stranger-repo.md` — the previous suite's run log is the shape to follow, and this one
   keeps **four** runs rather than two: prereqs, fixture, prompts with their tool calls, oracle state before and
   after each prompt, result, evidence, and the honest gaps. Its § Blocker says what it left open.
5. `docs/eval/00-protocol.md` — the run protocol, including what a fresh data dir means.
6. `docs/eval/results/BOARD.md` — the rows. `F-053` is `open` and does not block this suite; if a row does block
   it, fix it in the moment and record it, and if this suite finds a new one, add a row with the measurement
   that produced it.

Suites 01–06 have run. 04 is closed at 10/10, 05 at 8/10, 06 at **6/10** and 01–03 hold earlier verdicts.

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

## Prereqs to settle before prompt 1

- **A project whose toolchain actually exists — this is the one that can block mid-run, so build it first.**
  Suite 06 left two checkouts (`/home/pdonoso/projects/eval-seed`, `…/eval-seed-py`) and this suite's crux is
  *"every check command in the plan runs in this project's toolchain"*. Those checkouts are neutral scaffolds
  with no manifest and no commands, so a plan for them has nothing to derive and F2 cannot be measured. Either
  give one of them a real, small toolchain as an **operator fixture before the run** — a manifest, a runner, one
  passing test, and a documented command — or take a brownfield project per suite 19. Prefer the **non-Node** one
  (`eval-seed-py`), because `docs/eval/00-protocol.md` § Automated test lab notes asks for at least one non-Node
  scenario, and this suite is where a copied Node command would show.
- The fixture is written **before** the run and never touched after. Record its mtimes and check them at the end,
  the way suite 05 did with `/tmp/intent-demo`: otherwise an empty board cannot be told from a project the
  product quietly edited.
- A fresh data dir, bootstrapped, with the project's folder granted (`settings folders add`) **before** the first
  prompt, and this machine's usual trap armed: the repository `.env` sets `KAMPAKU_CORE_URL` to `:8080`, so the
  CLI needs `KAMPAKU_DOTENV_OVERRIDE=0` or a sourced `run.env` or it reports `fetch failed` against a healthy
  Core.
- A healthy model endpoint, with the endpoint and its observed latency recorded in the run log. Suite 06's run 4
  measured 1.0 s before the run and 4–55 s per call inside it, and two of its three turns then spent the whole
  5-minute turn budget — a plan turn that delegates can do the same, and the run log has to say which it was.
- **A cold reader, for prompt 4**, with a five-minute timer. That is the suite's own measurement and the one box
  no amount of automation answers; ask me when you reach it, and record whether the reader needed a question.

## Deliverable

The suite taken to a verdict: every gate ticked or explicitly not, a score with its reasons, the run log, the
evidence, and `docs/roadmap/README.md` updated to say where the work now stands.

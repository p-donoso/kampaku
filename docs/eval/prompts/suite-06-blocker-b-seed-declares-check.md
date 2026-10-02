# Sub-chat — suite 06, blocker B: the greenfield seed declares the stack's own check

**Blocker row:** `F-003` (open, partially resolved) in `docs/eval/results/BOARD.md`. **Suite:** [06
greenfield stranger repo](../06-greenfield-stranger-repo.md) § Oracle § *Toolchain freedom (F2)*, the box
that is still unticked. **Status when this chat was seeded:** fixed and locked, not yet re-measured.

## The measurement

Suite-06 run 4 (2026-09-25), on a fresh data dir: two projects were seeded from chat, and **neither has a
check, in either language**. Prompt 1 asks for *"a minimal check"* on an empty directory; prompt 3 asks for
the same project in Python, a language the emperor named out loud. The seed wrote hygiene files only — no
`Makefile`, no test, no check target — and its README said in the same words that the checkout has no
dependency manifest and no test setup.

The suite's box reads *"Prompt 3 produces a project whose checks are that language's commands, not the first
project's"*. It could not be met by any plan, because there was no check to plan against. Two consequences
followed: F2 held only in the **neutral** form (neither project has a toolchain, so the second cannot
inherit the first's — true and vacuous), and F5 / *"every documented command succeeds"* held vacuously,
because zero commands were documented. The lock in
`apps/core/tests/eval/eval-seed-toolchain-freedom.test.ts` asserted that absence, which is how a defect came
to look deliberate.

## What landed

- `apps/core/src/application/pm/repo-bootstrap.ts`: `seedExternalRepository(repoPath, projectName, { stack })`
  now resolves a **profile** and writes the check that profile can justify:
  - **python** — `Makefile` (`check` → `python3 -m unittest discover -s tests -v`, `lint` → `python3 -m compileall`),
    a real `tests/test_smoke.py`, a README documenting both, and CI running both. No `pyproject.toml`, no
    `requirements.txt`, no third-party runner: a manifest the checkout cannot install from is what made
    toolchain discovery offer pytest against a checkout with no pytest (F-057).
  - **neutral** — a `Makefile` whose `check` target asserts the files the seed itself wrote. It runs with
    `make` and `sh` and nothing else, it can fail, and it is the one check a seed is entitled to claim.
  - A named stack with **no profile** (e.g. `rust`) falls back to neutral **and says so** in its report and
    its README, rather than writing a command the checkout cannot run.
- The report grew: `stackProfile`, `stackRequested`, and `checks[]` (the exact commands now declared), so
  the reply states its own output instead of describing it.
- The stack reaches the seed through `create_project`'s new `stack` argument (and `POST /api/v1/projects`,
  for parity — F-036's rule), and the front-office prompt tells it to pass the language the emperor named.
- CI now runs the same command the README documents, for both profiles, so the pipeline and the docs cannot
  disagree.
- Lock `apps/core/tests/eval/eval-seed-toolchain-freedom.test.ts` **inverted**: it used to require that both
  seeds document no command; it now requires each profile's commands to be **executed** (`make check`,
  `make lint`, with `stdout` **and** `stderr`, because `unittest`'s report goes to `stderr`) and to be the
  only commands the README names. Also updated: `tests/application/repository-policy.test.ts` (a sentence
  became a property: every `make <target>` the README names is a target the `Makefile` declares) and
  `tests/pm/leaf-splitter-toolchain.test.ts` (an *empty* directory is no longer "a checkout that declares
  no check", because the seed now gives it one — the fixture writes a README and nothing else).

## What this chat still has to do

1. **Re-measure on the live instance in the suite-06 re-run**: prompt 1's checkout must document at least one
   command that runs, prompt 3 (Python) must produce Python checks, and both must be *executed* by the
   operator with exit codes recorded.
2. **F-003's remaining halves are still open** and this chat is the place they belong:
   - toolchain discovery is still **not persisted on the project**, so a plan re-derives it every time;
   - the platform's skill catalog is still **web-shaped**;
   - and no suite had re-measured any of it before this one.
3. Whether the **worker's** check routing accepts `make check` for a seeded checkout without a manifest
   (F-057 made a declared entry point win for `make`/`just`; confirm end to end on a seeded Python project).

## Honest caveats

- `make` is now required by the neutral profile. That is a POSIX build tool, not an ecosystem, and the
  README says so — but it is an assumption the old seed did not make, and it is stated rather than hidden.
- Only **python** has a profile. A Rust or Go project asked for by name gets the neutral check plus a
  sentence saying the seed has no profile for it. That is a stated limitation, not a covered case.

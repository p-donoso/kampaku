# 00 — Protocol (empty instance)

## Purpose

Define a repeatable empty-instance run so suites are comparable.

This protocol is operator-facing. Prefer the public README commands, the CLI, the UI, and documented
HTTP. Peeking into SQLite or private tables to "prove" a pass is a **product smell**: record it on
`results/BOARD.md` even if the suite otherwise passes.

## Empty instance

1. Choose a **new** data directory, with `./scripts/runs.sh new <run-id>` — it creates
   `<checkout>/.kampaku/runs/<run-id>/` and prints the environment the run needs. Never reuse a personal
   production data dir, and never create one in `$HOME`; see *Where run state lives* below.
2. Clean monorepo checkout. Install with the commands the **public root README** documents. If those
   commands fail, suite 01 fails as a product gap.
3. Configure the minimum environment the public docs require for real model-backed planning and
   execution (a model endpoint and key). Do not rely on undocumented local tricks.
4. Start the stack with the public start command(s). Control plane, worker, and operator UI must come
   up as documented.
5. Confirm health with whatever the product exposes to operators (health endpoint and/or status CLI).
6. Record in the run log: git SHA, data dir path, model/provider label, platform, and wall-clock
   start.

## Where run state lives

**`<checkout>/.kampaku/runs/<run-id>/`, and nowhere else.** Inside the repository tree, ignored by
`.gitignore` (`.kampaku/`), out of the operator's home.

This is a rule because of what its absence cost. Every run used to create its own directory in `$HOME` —
`~/.kampaku-eval-01`, then one per suite-07 run as far as `~/.kampaku-eval-07r20`, plus the langprobe and
language-run dirs — and nothing removed them. Measured 2026-09-29: **21 run dirs, 57 MB, in the operator's
home folder**, mixed in with what he keeps there by hand, and a `.env` still pointing at a data dir whose
run had closed weeks earlier. That is the failure this section prevents: run state that outlives its run,
in a place whose whole point is not being run state.

```bash
./scripts/runs.sh new s08r1     # create it, print the exports
./scripts/runs.sh list          # every run dir, with its size
./scripts/runs.sh rm s08r1      # delete one when the run closes
```

A run dir holds `data/` (the Core data dir, `KAMPAKU_DATA_DIR`), `logs/` (`KAMPAKU_RUN_DIR`: run logs,
captured output, the operator's oracle script), and `run.env`, which is those exports. Instrumentation
written for a run belongs there: it stays outside the committed tree while staying out of `$HOME`.

Two consequences worth stating, because both otherwise look like details:

- **A run dir is not a project checkout.** Nothing is linked as a repository inside it, so the isolation
  rule — a project repository inside the platform workspace is refused — has no bearing on it. What is
  refused is a *project* living in there.
- **The live instance's own data dir is the operator's choice, not a run's.** The checkout's `.env` points
  `KAMPAKU_DATA_DIR` at `<checkout>/.kampaku/data`, and a run overrides it per shell rather than by editing
  that file. An `.env` repointed at a run dir is how the live instance came to depend on a run that had
  already been deleted.

### What "empty" does not mean

- It does not require a specific internal agent tree shape from a private ADR.
- It does not require the absence of a default project. It requires that whatever exists is
  **described truthfully**, or that a clear question is asked before anything is invented.

## Measurement glossary

| Signal | Operator oracle |
|--------|-----------------|
| **Alive** | Health/status responds; UI loads |
| **Same truth** | The same resource ids and fields across chat, CLI, and web after one mutation (or after inspect, for read-only suites) |
| **Real work** | Files on disk, git history, and build/run output match what the board claims |
| **Human gate** | A pending question or approval is visible **and answerable** in the UI and CLI without digging through logs |
| **Survival** | After a process kill and restart, work resumes or the product states the loss honestly |
| **Isolation** | Project jobs do not modify platform source; platform jobs do not rewrite the project unless asked |
| **Toolchain fidelity** | Every command in a plan, README, or criterion runs in that checkout |
| **Cost** | Tool/iteration budget exhaustion mid-task is recorded as a product defect |

## Scoring

See [README.md](README.md) — *The bar*.

Summary:

- **Binary pass**: every oracle bullet for the suite holds.
- **Score 1–10**: independent judgment. Manual-only evidence caps at **9**.
- **Testing gate**: **10 requires automated tests** cited in the suite file that lock the promise.
- **Universal gates U1–U8** must hold for 10.
- **Factory gates F1–F5** must hold for 10 (software scope, stack neutrality, architecture
  neutrality, brownfield respect, shippability).
- **P-gates** apply when the suite's oracle depends on honest done, isolation, UI human-gate,
  survival, shared truth, human-readable plan, work-order intake, or scope discipline.
- **Suite green**: binary pass **and** score **10**.
- **Blocked**: a prior open blocker. Prefer `blocked` over a fake pass.

## Performance notes (record when relevant)

- Wall clock for the suite.
- Number of visible jobs and work items created.
- Whether a tool/iteration budget was exhausted mid-task.
- Whether the suite markdown alone was enough for a stranger (U1/U2).
- For stack-neutral suites: which toolchains were discovered, and which were invented.

## Language

Eval markdown stays in English. Emperor chat during a run may use Spanish. Durable artifacts the
product writes must meet the product's own English-persistence rule; the honesty of published memory
is judged in suite [09](09-shared-truth.md).

## Run artifacts

| Artifact | Lives in | Purpose |
|----------|----------|---------|
| Suite markdown | `docs/eval/NN-*.md` | Protocol, checklist, run log, score |
| Board row | [`results/BOARD.md`](results/BOARD.md) | Blocking product gaps in product language |
| Learning | [`results/LEARNINGS.md`](results/LEARNINGS.md) | Deferred elevations and dispositions |
| Probe run record | Committed as `docs/eval/<probe-name>.md`, or retained by the operator outside the tree when it carries live operator turns and run parameters | Live turn log and gap/fix ledger for a capability probe; a gap id is citable from committed artifacts only once its disposition is committed ([capability-probe-protocol.md](capability-probe-protocol.md)) |
| Oracle scripts | **Outside** both the platform monorepo and the project under test | Instrumentation must not become the deliverable or the platform |

Instrumentation never lives inside the platform monorepo, and never inside the project being built.
If an oracle script is required to prove a pass, the pass is manual-only and caps at 9.

## Fresh re-run rule (U5)

After closing board items, re-run the affected suites from a **fresh** data dir before claiming the
suite green. Partial state from a patched mid-run does not count as an empty-instance pass. Automated
tests must be green in the same commit window cited in Evidence.

A mid-run product fix that changes core runtime behavior marks the run `mixed-commit`. Affected
verdicts must be re-run clean on a fresh data dir before they are called green.

## Incremental fixes (do not break closed suites)

Product fixes for suite **N** must be **additive**. A later suite must not weaken or remove a promise
locked by an earlier green suite.

Before claiming suite **N** green:

1. Keep the prior suites' automated tests in the same commit. Do not delete or soften their
   assertions to make N pass.
2. Re-run **all** cited automated tests for the suites earlier in the order (unit + e2e where they
   exist) and record that regression pass in Evidence or the run log.
3. Prefer new tools, narrower runtime gates, and extra tests over changing behavior an earlier suite
   already scored as 10.
4. If a later design change must alter an earlier promise, **re-open** that suite on the board,
   re-run it on a fresh data dir, and re-score. Do not leave it green from an old commit.

## Automated test lab notes

Recorded while greening the first battery — follow these so e2e is honest:

1. **Explicit env wins over workspace `.env`.** Set `KAMPAKU_DOTENV_OVERRIDE=0` when launching Core
   for Playwright/CI, so the monorepo `.env` does not overwrite `KAMPAKU_AGENT=stub`, the data dir,
   or the workspace. Measured: without it, every CLI turn silently ran against a different data dir.
2. **One Next.js process per `apps/web`.** Next refuses a second dev server in the same directory
   even on another port. Stop the stack's web before running web e2e that starts its own server.
3. **Prefer dedicated ports** from the declared block — Core `28080`, web `28002`, and the Playwright
   fixtures on `28081`/`28003` ([local ports](../development/local-ports.md), declared in
   `scripts/ports.env`) — with a fresh `PLAYWRIGHT_CORE_DATA_DIR` empty directory. Never a shared
   default such as 3000/8080, and never the port a live run is already using: a fixture that adopts a
   live instance measures the wrong thing.
4. **Stub e2e proves UI wiring, not provider honesty.** A suite that claims a provider path must
   also run an LLM path ([17-provider-fidelity.md](17-provider-fidelity.md)).
5. **Node-based scenarios are the easiest to stand up, and are the most likely to leak a stack
   assumption.** When a suite needs a project, prefer at least one non-Node scenario across the
   battery so F2 is exercised where it is easy to check.

Deferred learnings: [results/LEARNINGS.md](results/LEARNINGS.md).

# Repository-wide rules

These rules apply across the Kampaku monorepo. Product-specific development invariants live in
[agent-operating-model.md](agent-operating-model.md); language, evaluation, branching, and brand rules have
their own files in this directory.

## Repository boundary

Kampaku is the software factory platform: its control plane, workers, operator UI, and contracts. It is not a
project built by the factory. Read the [product statute](../../docs/product/software-factory.md),
[agnosticism invariants](../../docs/concepts/agnosticism-invariants.md), and
[factory contract](../../docs/eval/factory-contract.md) when the task touches those boundaries.

The repository's npm, TypeScript, Vitest, and Playwright conventions apply to this monorepo only. Do not make
projects managed by Kampaku assume this stack. Verify values that can be measured; label them unverified when
they cannot.

## Documentation and evaluation

Use [`docs/README.md`](../../docs/README.md) as the documentation map. Keep durable product, architecture,
security, development, design, protocol, decision, roadmap, and evaluation material in the matching
`docs/` area; update the map and relevant links when adding or moving a document. Keep repository-agent
guidance in `.agents/` (`AGENTS.md` is only its root index); product/runtime skills remain under
`packages/contracts/skills/`. Do not duplicate active evaluation status outside the suite files and
`docs/eval/results/` board.

Roadmap tracking belongs in the private [Kampaku Roadmap Project](https://github.com/users/p-donoso/projects/2)
linked to `p-donoso/kampaku`: issues and Project fields own active status, readiness, priority, owner area,
dependencies, and schedule; `docs/roadmap/` owns strategy, technical context, and acceptance criteria. Do not
mirror active progress in Markdown or create unattached roadmap issues. If the Project is temporarily
inaccessible, leave tracking data untouched, report the specific access gap, and resume when access returns.
Follow the [roadmap skill](../skills/kampaku-roadmap/SKILL.md).

### The eval board is a summary, not a record

`docs/eval/results/BOARD.md` answers *what is broken, how badly, and where do I read the rest*. It is read to
decide what to work on next, and it stopped being usable for that: on 2026-11-23 its 155 rows carried 415 000
characters between them, the largest 8 594, because every re-measurement, transcript and fix narrative was
appended to the cell it belonged to. A row therefore has a shape and a budget, and `npm run check:docs`
enforces both.

- **A row is eight cells:** `id | suites | symptom | product gap | likely layer | owner | status | notes`.
  `symptom` and `product gap` are **one sentence each**; `notes` is a pointer.
- **The detail has a home, and it is not the board.** For an `open` row it is the row's **GitHub issue**,
  linked from `notes` — open it first and put the specimen, the commands, the ids and the transcript paths
  there. For a `resolved` row it is the **commit and the suite's own `.md`**, and the row's earlier text stays
  recoverable: `git log -S "F-0NN" -- docs/eval/results/BOARD.md` names the commit that reduced it, and
  `git show <commit>^:docs/eval/results/BOARD.md` prints the row as it stood.
- **The budget:** a row at most 700 characters, the whole board at most 120 000. `check:docs` fails a longer
  row, a row with the wrong cell count, a duplicate `id`, and an `open` row that links no issue.
- **A re-measurement updates the sentence, not the log.** When a run confirms or refutes a row, change the one
  clause that carries the verdict and put the evidence in the issue or the suite document. Adding a paragraph
  to `notes` is how this board grew to 435 KB once already.

Product documentation is one contract. `apps/core/tests/eval/eval-docs-coherence.test.ts` checks product
framing and relative links. Run `npm run test:eval` after documentation changes when the active evaluation
work allows it. See [eval-suites-required.md](eval-suites-required.md) for product behavior changes and
evaluation re-runs.

When changing the front-office scope statement, update its locks in
`apps/core/tests/eval/eval-software-scope.test.ts`. When changing
`KAMPAKU_BUILTIN_DEFINITION.tools`, verify `apps/core/src/agents/runtime/session.ts` still exposes every
prompt-named tool and withholds line capabilities; this is locked by
`apps/core/tests/eval/eval-orchestrator-contract.test.ts` and tracked as
[BOARD F-001](../../docs/eval/results/BOARD.md).

## Local ports

Ports are declared in [`scripts/ports.env`](../../scripts/ports.env) and explained in
[`docs/development/local-ports.md`](../../docs/development/local-ports.md).

- Do not bind 3000, 3001, 3002, 5000, 8000, or 8080.
- Do not bind above 32767; that range is used for ephemeral ports.
- Use `./scripts/ports.sh free 1`, `./scripts/ports.sh check`, or `./scripts/ports.sh list` to select and
  verify a port. Do not kill a listener you did not start.
- Add a new service port to `scripts/ports.env` and the local-ports document in the same change.

## Local configuration and secrets

Operator-specific infrastructure, model routers, local voice stacks, credential paths, and secrets do not
belong in the repository. Keep run parameters in the active evaluation record that needs them and never
commit provider credentials.

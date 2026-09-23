# 06 — Greenfield stranger repository

## Promise tested

The factory stands up a new project in a directory outside the platform, with a README whose commands
actually run, a declared stack that matches what was written, and version control that is real.

## Why it elevates

Weak: the board says "project created" while the disk is empty; the README documents `npm install` in
a checkout with no `package.json`; a "repository" has no `.git`; the seed writes into the platform
monorepo.

Credible: a stranger can open the directory, follow the README, and see the declared stack exist. The
seed reports what it actually wrote, including what it did not write.

This suite is the sharpest place a language assumption leaks, because the factory chooses the
toolchain itself. F2 is measured here as much as in suite [18](18-language-agnostic.md).

## Prereqs

- Suites [01](01-work-order-intake.md)–[05](05-intent-to-work-order.md) green.
- An empty directory **outside** the platform checkout (for example `/home/pdonoso/projects/eval-seed`).
  Record it as `<PATH>`.
- A model endpoint configured (see [17](17-provider-fidelity.md) for the provider bar).

## Emperor prompts

1. `Open a work order for a new project at <PATH> called seed-demo. Choose the stack yourself and tell me what you chose and why. Seed only what is needed to start: version control, a README whose commands all work, a license, and a minimal check. Do not invent a stack that is not on disk. Do not modify the platform repository.`
2. `Show me how a stranger opens that directory and verifies the README commands.`
3. `Now do the same for a second project at <PATH-2>, but in Python.` (Substitute any language that is
   not the one chosen in prompt 1.)

## Oracle

**Seed honesty**

- Files exist under `<PATH>` only; the platform checkout's `git status --porcelain` is unchanged.
- `<PATH>` is a git repository (`git -C <PATH> rev-parse --is-inside-work-tree` succeeds), or the
  reply states plainly that git was unavailable.
- The README documents only commands that **succeed** in that checkout. Every documented command is
  executed by the operator and its result recorded.
- The declared stack matches what was written: if a manifest was created, the manifest exists; if no
  manifest exists, the README says so instead of documenting package-manager commands.
- The seed reports what it created: files, manifest presence or absence, and git initialization.
  A seed that reports nothing about its own output cannot be verified.
- No placeholder text is presented as a working feature. A skeleton must say it is a skeleton.

**Toolchain freedom (F2)**

- Prompt 3 produces a project whose checks are that language's commands, not the first project's.
- The two projects' READMEs and checks do not share a stack assumption.
- Nothing in either project references the platform's own toolchain unless the emperor asked for it.

## How to measure

- `test -d <PATH>`, `git -C <PATH> rev-parse --is-inside-work-tree`, `git -C <PATH> status --porcelain`.
- Execute every command in each README verbatim; record exit codes.
- Diff the platform checkout before and after.
- Compare the two generated projects' check commands.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Project slug and path agree across chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Deliverable is software
- [ ] F2 Both projects use their own toolchains; no shared stack assumption
- [ ] F3 No imposed shape beyond what the stack requires
- [ ] F4 N/A or existing conventions respected
- [ ] **F5 Every documented command succeeds in its own checkout**

### Suite-specific

- [ ] Every README command executed and recorded
- [ ] Declared stack exists on disk, or its absence is stated
- [ ] The directory is a real repository
- [ ] The seed reports what it created
- [ ] A second language produces its own commands
- [ ] Platform checkout unchanged

### In-scope P-gates

- **P1** (skeleton honesty), **P2**, **P5** soft, **P6** if a plan accompanies the seed, **P7**

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/application/repository-policy.test.ts` | Seeding creates the checkout, initializes git, never overwrites, refuses the workspace | Exists; re-run and cite |
| `apps/core/tests/eval/eval-seed-honesty.test.ts` | README commands are derived from what was written; a checkout with no manifest documents nothing runnable; the seed reports its own output | **To author** |
| `apps/core/tests/eval/eval-seed-toolchain-freedom.test.ts` | Two seeds in different languages produce their own check commands | **To author** |

## Pass

- Binary: all oracle bullets hold for both seeded projects.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Wall clock | — |
| `<PATH>` / `<PATH-2>` | — |
| Stacks chosen | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

Inherits [BOARD F-001](results/BOARD.md) where a container must be created from chat.

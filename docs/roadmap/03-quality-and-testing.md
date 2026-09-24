# 3. Quality and testing

- **Document:** `03 — Quality and testing`
- **Kind:** `deliverable`
- **Status:** `In progress`
- **Owner:** core / worker
- **Dependencies:** [statute](../product/software-factory.md), [06](06-project-context.md)
- **Related documents:** [execution assurance](../architecture/execution-assurance.md) — **the policy
  this deliverable implements**, [statute](../product/software-factory.md) § Gates,
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [eval 18](../eval/18-language-agnostic.md), [eval 24](../eval/24-execution-assurance.md)
- **Last reviewed:** 2026-09-24

> **The policy is not here.** What counts as verification, the closure rules, and the quality policy
> live in [execution assurance](../architecture/execution-assurance.md), because they are standing
> properties of the product. This document is the **work** that makes one part of that policy true:
> deriving evidence from the project instead of from a template.

## Purpose

The policy says acceptance evidence comes from the project's own toolchain
([invariants §1](../concepts/agnosticism-invariants.md)). Today that holds for **execution** and not
for **discovery**:

- `run_check` resolves a toolchain-neutral name against the repository, and `install_dependencies`
  fails closed. That landed 2026-09-24.
- What the repository declares is **not persisted on the project**, so planning re-discovers it or
  guesses, and no surface can show what the factory thinks the toolchain is.
- A check cannot be scoped to one package, so on a monorepo the root's check runs for a package's
  change.
- The seeded wiki pages still hand every project an `npm install` / `npm test` / `npm run build` page —
  the seeded-README defect in a second location.

Left alone, a project can be planned against a toolchain nobody read, and a monorepo's slices cannot
be verified in isolation.

## Outcome

Every criterion's check is traceable to a file in the project, the discovered toolchain is a durable
fact other stations read, and no artifact the factory writes documents a command the checkout cannot
run.

## Scope

### In scope

- [ ] Persist the discovered toolchain on the project, with provenance and freshness, so planning
      derives criteria from it instead of re-discovering or guessing.
- [ ] Scope a check to one package, so a package's `test` is not the repository root's.
- [ ] Derive a criterion's check from the project when the criterion states none, and raise a question
      when nothing is discoverable.
- [ ] Make every seeded artifact honest: no command documented that the checkout cannot run, including
      the default wiki pages.
- [ ] Close the lock gap on the suites that score this: cite committed tests, not a manual run.

### Out of scope

- [ ] The verification policy itself. [Execution assurance](../architecture/execution-assurance.md)
      owns it; changing what counts as verification is not part of finishing discovery.
- [ ] The evidence contract's shape. It is defined and stable.
- [ ] The audio-verification gap ([BOARD F-009](../eval/results/BOARD.md)). It is a missing
      *capability*, not a discovery problem, and it is tracked separately.

## What exists now

Measured 2026-09-24:

| Piece | State |
|-------|-------|
| `run_check` resolves a neutral name against the repository | **Done.** `project-toolchain.ts`: a data table of profiles (Node, Python/Poetry, Rust, Go, Maven, Gradle, Elixir, Ruby, .NET, PHP, Dart, CMake, Zig, Make, just), each command carrying the file that justifies it |
| `install_dependencies` runs the project's installer | **Done.** Fails closed naming the manifests it looked for |
| Required-check inference recognises non-Node criteria | **Done.** A criterion naming `pytest` produces a `test` requirement; before, it produced none |
| The seed and fallback plan leaves assert no ecosystem | **Done.** Locked by `scaffold-toolchain-neutrality.test.ts` |
| Discovery persisted on the project | **Not done** |
| Package-scoped checks | **Not done.** Discovery reports a nested package's toolchain rather than running it, because a check name has no directory |
| Seeded wiki pages | **Not done.** `wiki/default-pages.ts` still names `npm` commands |

## Definition of done

Every box ticked closes this deliverable.

- [ ] The discovered toolchain is persisted on the project with provenance and freshness
- [ ] Planning derives a criterion's check from the persisted toolchain, not from a re-discovery or a template
- [ ] A check can be scoped to one package, proven on a monorepo where a sibling package's change does not re-run it
- [ ] A repository with no discoverable check and no stated intent produces a question, not an invented command
- [ ] No artifact the factory writes — including the default wiki pages — documents a command the checkout cannot run
- [ ] The suites that score this cite committed automated tests
- [ ] Board row F-003 closes with a fresh suite run, not with a code change

## Gate

**Acceptance evidence for every project is derived, persisted, and traceable to a file in that
project** — on a non-default toolchain, on a polyglot repository, and on a monorepo where the change
lands in one package.

Scored by [eval 18](../eval/18-language-agnostic.md) (toolchain discovery and polyglot),
[eval 19](../eval/19-brownfield-and-legacy.md) (an existing repository's own checks), and
[eval 24](../eval/24-execution-assurance.md) (the evidence machinery), each on a fresh data dir.

## Software scope and invariants

**Language-agnostic** is the invariant this deliverable *is*. Adding a toolchain must stay data, not a
code path: a new profile is a row in the table, and if adding one requires editing planning or
execution logic, this deliverable has failed even if the profile works.

**Project-type-agnostic.** Brownfield and maintenance work is where discovery matters most, because
the repository already has opinions the factory did not write. The persisted toolchain must record what
was *found* in a checkout the factory did not author, not a profile it inferred from a template.

**Architecture-agnostic.** Package-scoped checks are the monorepo requirement. Without them, every
change in a forty-package repository verifies the whole workspace, which is both slow and wrong: it
proves the root's checks, not the changed package's.

**Scope.** This deliverable narrows nothing about the product and widens nothing about the deliverable.
It makes an existing promise true. A check that cannot be discovered is a **question**, never an
invented command — inventing one is the defect this work exists to remove, and the refusal boundary is
unchanged.

## Design rules

- [ ] Discovery reads the repository; it never infers from the platform's own stack.
- [ ] Every discovered command carries the file that justifies it.
- [ ] A plausible-but-undeclared command is a named near miss, not a guess.
- [ ] Persist what was found, with freshness, so a stale value is visible rather than silently reused.
- [ ] Adding a toolchain is one data entry and no branching.
- [ ] Fall back to a question, never to a default.

## Work checklist

### Discovery and persistence

- [ ] Define the persisted shape: profiles, commands, evidence, and the revision observed against.
- [ ] Persist on the project through [06](06-project-context.md)'s context schema.
- [ ] Expose freshness so a changed repository marks the toolchain stale.
- [ ] Wire planning to read the persisted toolchain before discovering again.

### Package scope

- [ ] Give a check a directory, so `test` in a package is that package's.
- [ ] Report a nested package's toolchain as scopable rather than as a near miss.
- [ ] Test on a monorepo: a one-package change re-runs one package's checks.

### Seeded artifacts

- [ ] Make the default wiki pages assert no ecosystem, as the seed and plan leaves already do.
- [ ] Extend `scaffold-toolchain-neutrality.test.ts` to cover them.

### Evidence

- [ ] Author the automated tests [eval 18](../eval/18-language-agnostic.md) cites, so the suite is not capped at 9.
- [ ] Re-run [eval 18](../eval/18-language-agnostic.md), [19](../eval/19-brownfield-and-legacy.md), and [24](../eval/24-execution-assurance.md) on a fresh data dir.
- [ ] Close [F-003](../eval/results/BOARD.md) with that run, and record what it found.

## Risks and open decisions

- [ ] **Persistence can freeze a wrong answer.** A toolchain read once and stored becomes a claim with
      a timestamp. If freshness is not enforced, discovery is replaced by a stale cache, which is worse
      than re-reading. Freshness is not optional here.
- [ ] **Package scope needs a stable package identity.** "The package this criterion belongs to" must
      survive a directory rename, or checks silently stop running. Depends on [06](06-project-context.md).
- [ ] **A large repository makes discovery expensive.** Bounded traversal is already in place; the
      persisted form must not re-introduce an unbounded walk on every plan.
- [ ] **This deliverable can be scored by a suite that has never run.** Every box except the last can
      be true while [eval 18](../eval/18-language-agnostic.md) remains `not run`. The last box exists
      precisely so this cannot close on code alone.

## Delivery record

Not started. Filled when the definition of done is fully ticked.

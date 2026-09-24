# 3. Quality and testing policy

- **Phase:** `03 — Quality and testing`
- **Kind:** `policy`
- **Status:** `Partly enforced`
- **Owner:** core / worker
- **Dependencies:** [01](01-philosophy.md), [02](02-factory-flow.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [execution assurance](../architecture/execution-assurance.md), [eval 24](../eval/24-execution-assurance.md)
- **Last reviewed:** 2026-09-23

## Factory rule

Every software change must have a verification strategy appropriate to its deliverable, project
type, architecture, and toolchain. No change is complete because code was written or because a
worker reported success.

## What the strategy may contain

Depending on the project, evidence may include unit, integration, contract, end-to-end, smoke,
property, performance, security, compatibility, migration, build, packaging, or manual review
checks. The factory must not require one testing style when another is technically appropriate.

## Required behavior

- Planning maps acceptance criteria to executable or inspectable checks.
- Workers add or update tests when the change requires them.
- Existing tests and conventions are preserved unless scope explicitly approves a change.
- Missing test infrastructure is reported as a risk or gap, not hidden.
- Inspection executes the declared checks against the produced artifact.
- Evidence records identify the criterion, method, result, timestamp, and relevant observation.
- Completion is blocked when required checks are failed, missing, or unverified.

## What exists now

The execution half of stack-neutral evidence exists. A check is resolved against the repository
instead of against npm:

- `run_check` takes a toolchain-neutral name (`test`, `build`, `lint`, `typecheck`, `e2e`) and runs
  the command the repository declares — a package script, `cargo test`, `go test ./...`, `pytest`,
  `mvn verify`, a Makefile or `just` target, and so on. Each result carries the command and the file
  that justified it.
- `install_dependencies` runs the project's own installer, or fails closed naming the manifests it
  looked for.
- A check the repository does not declare is an error listing what was discovered. A `Makefile`
  target that is not declared is a named near miss, not a guess.
- A monorepo package's own toolchain is **reported** rather than run: a check name has no directory,
  so running it from the repository root would run the wrong thing. Scoping a check to one package
  belongs to the [project context](06-project-context.md) work.
- Required-check inference recognises non-Node criteria, so a criterion naming `pytest` or
  `cargo test` produces a `test` requirement instead of none. Before, it produced either a phantom
  extra check or a silently empty gate.
- The seed and the planner's fallback leaves assert no ecosystem: no CI pipeline that installs a
  toolchain, no agent rule naming a package manager, no acceptance criterion naming one.

Also in this phase: `qa-testing` and `audit-deliverable-readiness` no longer prescribe a runner or a
manifest name, and the worker's own prompt discovers the project instead of reading `package.json`,
running `npm` scripts, or naming a framework.

**Still to fix, same defect class.** The seeded wiki pages
(`apps/core/src/application/wiki/default-pages.ts`) still hand every new project a "Development setup"
page whose body is a fenced block of `npm install`, `npm test`, and `npm run build`. That is the
seeded-README defect in a second location: a page the factory writes into every project, documenting
commands the checkout may not have. The phase-01 surface sweep found it; it is this phase's work, not
a framing problem.

Still open: discovery is not persisted on the project, so planning cannot reuse it; a check cannot be
scoped to one package of a monorepo; the platform's skill catalog remains web-application-shaped
([07](07-engineering-skills.md)); and no suite has re-measured any of this.

## Quality is broader than testing

Testing is one evidence method. The enduring requirement is trustworthy verification. A factory
must prefer a failed or unsupported check over a plausible but unverifiable claim.

This phase also carries [BOARD F-003](../eval/results/BOARD.md): a criterion could name `npm test`
in a checkout with no manifest, and the worker's check runner assumed a package-script convention.
Deriving the check per project is the phase's main deliverable, and its execution half now exists.
What remains is persistence of the discovered toolchain and the stack coverage of the skill
catalog.

## Quality checklist

- [ ] Acceptance criteria are stable and criterion-level.
- [ ] Each criterion has an executable or inspectable verification method.
- [ ] Tests follow repository conventions.
- [ ] New behavior has regression coverage appropriate to its risk.
- [ ] Failed checks block closure.
- [ ] Missing checks produce an explicit gap or question.
- [ ] Evidence identifies artifact, method, result, and timestamp.
- [ ] Inspection is independent of the worker's success claim.
- [ ] Reproducibility is checked before shipment.
- [ ] No criterion is satisfied by a metadata or structural check when its claim is about content.
- [ ] A criterion whose check cannot be provided fails closed and is marked unverified.
- [ ] The discovered toolchain is persisted on the project, with provenance, so planning derives
  criteria from it instead of re-discovering or guessing
  ([F-003](../eval/results/BOARD.md), [06](06-project-context.md)).
- [ ] A check can be scoped to one package of a monorepo, so a package's `test` is not the root's.
- [ ] No seeded artifact documents a command the checkout cannot run, including the default wiki
      pages, which currently name `npm` commands for every project.
- [ ] Every committed lock on this phase's behavior is exercised by the suite, not only by a test that
      has never been run.

## Gate

**No closure without criterion-level evidence re-executed against the artifact.** A completion whose
required checks are missing, failed, unverified, or unreferenced is rejected and the work reopens.
This is gate **P1** of the [eval lab](../eval/README.md), scored by
[11](../eval/11-honest-done.md) and [24](../eval/24-execution-assurance.md).

**Known open conflict.** [BOARD F-009](../eval/results/BOARD.md) is the counter-example this phase
exists to close: a header-only WAV passes every metadata check the worker can currently run, so an
audio-bearing criterion can be satisfied by a meaningless artifact. Until a real round-trip exists or
the criterion is refused as unverifiable, this gate does not hold for that deliverable class.

## Automated locks

| Test | Locks |
|------|-------|
| `apps/worker/tests/project-toolchain.test.ts` | A checkout that declares nothing yields no commands; Python, Rust, Go, Make, and Node resolve to their own commands; a Node check exists only for a declared script and a Makefile target only for a declared target; a polyglot repository reports its nested package; an e2e criterion does not also require a test check; non-Node criteria produce a required check instead of none |
| `apps/core/tests/application/scaffold-toolchain-neutrality.test.ts` | The seed and the fallback plan leaves name no ecosystem in CI, agent rules, env template, README, or acceptance criteria, and their criteria stay verifiable |
| `apps/core/tests/eval/eval-roster-model.test.ts` | The seat is modelled as fields on one `Agent` entity, never a parallel class; the seed set is documented as a suggestion rather than a taxonomy; every skill the runtime references exists in the catalog |
| `apps/worker/tests/worker-system-prompt.test.ts` | The worker prompt names no toolchain, package manager, framework, or refused deliverable class; it tells the worker to discover the project; citation integrity survives as a general rule; operator and project additions are preserved |

## Software scope and invariants

Evidence is what makes the software scope enforceable, and this phase is where that happens: a
deliverable is in scope only when its acceptance evidence can be executed, inspected, or measured
against a technical contract ([statute](../product/software-factory.md)). A request whose only
acceptance condition is editorial judgment has no check to map, which is the same fact as being out
of scope — it is refused rather than measured loosely.

Verification must not assume a language, a test runner, or a repository shape, or it breaks
**F2** and **F3**. The check comes from the project's own toolchain
([invariants §1](../concepts/agnosticism-invariants.md)); the platform's own stack is not evidence.

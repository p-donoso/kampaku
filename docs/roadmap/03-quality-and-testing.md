# 3. Quality and testing policy

- **Phase:** `03 — Quality and testing`
- **Status:** `Documented`
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

## Quality is broader than testing

Testing is one evidence method. The enduring requirement is trustworthy verification. A factory
must prefer a failed or unsupported check over a plausible but unverifiable claim.

This phase also carries [BOARD F-003](../eval/results/BOARD.md): today a criterion can name `npm test`
in a checkout with no manifest, and the worker's check runner assumes a package-script convention.
Deriving the check per project is the phase's main deliverable, not a refinement of it.

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

## Gate

**No closure without criterion-level evidence re-executed against the artifact.** A completion whose
required checks are missing, failed, unverified, or unreferenced is rejected and the work reopens.
This is gate **P1** of the [eval lab](../eval/README.md), scored by
[11](../eval/11-honest-done.md) and [24](../eval/24-execution-assurance.md).

**Known open conflict.** [BOARD F-009](../eval/results/BOARD.md) is the counter-example this phase
exists to close: a header-only WAV passes every metadata check the worker can currently run, so an
audio-bearing criterion can be satisfied by a meaningless artifact. Until a real round-trip exists or
the criterion is refused as unverifiable, this gate does not hold for that deliverable class.

## Software scope and invariants

Evidence is what makes the software scope enforceable, and this phase is where that happens: a
deliverable is in scope only when its acceptance evidence can be executed, inspected, or measured
against a technical contract ([statute](../product/software-factory.md)). A request whose only
acceptance condition is editorial judgment has no check to map, which is the same fact as being out
of scope — it is refused rather than measured loosely.

Verification must not assume a language, a test runner, or a repository shape, or it breaks
**F2** and **F3**. The check comes from the project's own toolchain
([invariants §1](../concepts/agnosticism-invariants.md)); the platform's own stack is not evidence.

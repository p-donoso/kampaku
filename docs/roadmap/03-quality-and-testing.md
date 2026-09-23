# 3. Quality and testing policy

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

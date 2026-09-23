# Execution assurance

The inspection station. This layer exists to distinguish a **claimed** result from a **verified**
deliverable, and it is the reason the factory can say "done" without lying.

Scope follows the product: the artifacts assured here are software and the technical artifacts
software cannot exist without ([statute](../product/software-factory.md)). Evidence kinds are
therefore technical — a command, a build, an artifact, a contract, a behavior, a rendered interface —
and are independent of language, toolchain, project type, and model provider.

## Evidence contract

Worker evidence uses one strict format:

- `subjectType`: artifact, behavior, data, publication, or decision.
- `format`: code, document, dataset, API response, image, or other.
- `verificationMethod`: command, file inspection, browser, API request, renderer, or manual review.
- `criterionId`, `subject`, `passed`, `verified`, `sourceTool`, and `observedAt`.

Evidence is persisted as job events and exposed through `GET /api/v1/jobs/:jobId/evidence`.

**Every evidence record references the criterion it covers.** A record with no criterion reference is
rejected, and an observation must name the tool or reviewer that produced it.

## What counts as verification

This is the sharpest rule in the layer, and it exists because the failure mode has been measured three
separate ways on this machine: a 44-byte header-only WAV returned `HTTP 200` with the correct
`Content-Type`; the audio inspector's duration, codec, and signal statistics all passed on that same
silence; and a RIFF header declared a 4-second clip to be 89478 seconds long.

So:

| Acceptable | Not acceptable as proof of the criterion |
|-----------|------------------------------------------|
| The project's own build or test command, executed, with its result | Compilation succeeding |
| A behavior observed through the interface the user uses | A file existing at a path |
| A contract inspected against its consumers | A well-formed but empty or constant artifact |
| A round-trip (produce → consume → compare) where the content matters | An HTTP 200, a content type, or a byte count |
| An artifact whose content is inspected and shown to satisfy the criterion | Metadata about a file (duration, dimensions, row count) |
| A manual review, explicitly recorded as manual | A model's own assertion that it passed |

**Metadata is never content verification.** A capability that would require an engine the worker does
not have must fail closed (`INSPECTION_UNSUPPORTED`) so the item can be reported unverified, rather
than returning an approximation that a green board can absorb.

## Closure rules

Core blocks work-item completion when required checks fail, evidence is invalid, evidence fails,
evidence lacks a criterion reference, or quality gates detect an incomplete attempt. Project
completion additionally requires a passing objective-coverage audit.

## Objective coverage

Original objectives are normalized into stable requirement records. Coverage audits classify each
requirement as covered, partial, missing, blocked, or unverified. A critical gap produces a failing
verdict and prevents project completion.

## Planning

Plans support vertical slices. A slice declares an observable outcome, requirement references,
work-item references, and the kinds of evidence that will demonstrate it. Slice acceptance evidence is
derived from the project's own toolchain — see
[invariants §1](../concepts/agnosticism-invariants.md) and
[roadmap](../roadmap/03-quality-and-testing.md).

## Quality gates

Quality gates reject:

- an iteration-limit outcome without evidence;
- missing, failed, or unreferenced required checks;
- a check that only asserts existence, size, a header, or a status code for a behavior criterion;
- placeholder content and undeclared demo output;
- an artifact whose content is too thin to satisfy the criterion;
- a declared fixture presented as production behavior (declared fixtures and examples are permitted).

## Environment compatibility

Environment validation records runtime, dependency, schema, service, and minimum-operation constraints
before execution. Incompatible assumptions must produce diagnostics rather than a late failure.
Stateful schemas or services require a passing minimal real operation — create-and-read, or an
equivalent — before they are considered compatible.

## Integration validation

Integration validation requires primary, failure, and recovery scenarios. Each scenario must cross at
least two relevant boundaries, pass, and include evidence. A successful compile or an isolated unit
test does not substitute for this.

## Authority policy

Planning, implementation, and approval are separate roles. Planners may plan, implementers may
execute, and auditors may approve or reopen. An override requires an authorized actor, a reason, and
evidence. The emperor may override authority boundaries explicitly.

## Traceability

Trace links connect a requirement to a work item, an attempt, an artifact, evidence, and a version
reference. Attempts are append-only and carry unique ids and output hashes, so a report remains
auditable after later attempts.

## Iteration policy

Iteration limits produce explicit completed, incomplete, blocked, or iteration-limited outcomes. Limits
increase only after measurable progress and never beyond a bounded maximum. An unproductive loop stops
with a diagnostic instead of being reported as success.

## Interface validation

Visual and interactive criteria require an artifact reference, requirement references, viewport
metadata when relevant, an accessibility inspection, and runtime metadata. Comparison against a
reference can be done without assuming a framework or a design system.

## Final report

The final report reconciles the original objective, the approved plan, the implementation summary, and
the requirement evidence. It includes coverage states, risks, and follow-ups in both Markdown and
machine-readable form. See [eval 23](../eval/23-shipment-gate.md).

## Related

- [Worker capabilities](../development/worker-capabilities.md) — what the line can actually observe
- [Eval 11](../eval/11-honest-done.md) — the sabotage beats that test this layer
- [Eval 24](../eval/24-execution-assurance.md) — the layer's own oracle

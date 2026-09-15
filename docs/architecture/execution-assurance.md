# Execution Assurance

## Purpose

Kampaku must distinguish a claimed result from a verified deliverable. This layer applies to software, research, design, documents, data, media, and operations.

## Evidence contract

Worker evidence uses one strict format:

- `subjectType`: artifact, behavior, data, publication, or decision.
- `format`: code, document, image, audio, video, dataset, API response, or other.
- `verificationMethod`: command, file inspection, browser, API request, renderer, manual review, or model observation.
- `criterionId`, `subject`, `passed`, `verified`, `sourceTool`, and `observedAt`.

Evidence is persisted as job events and exposed through `GET /api/v1/jobs/:jobId/evidence`.

## Closure rules

Core blocks work-item completion when required checks fail, evidence is invalid, evidence fails, evidence lacks a criterion reference, or quality gates detect incomplete attempts. Project completion also requires a passing objective-coverage audit.

## Objective coverage

Original objectives are normalized into stable requirement records. Coverage audits classify each requirement as covered, partial, missing, blocked, or unverified. A critical gap produces a failing verdict and prevents project completion.

## Planning

Plans support vertical slices. A slice declares an observable outcome, requirement references, work-item references, and evidence types. The model is project-agnostic and examples must remain illustrative.

## Quality gates

Quality gates reject iteration-limit outcomes without evidence, missing or failed checks, unreferenced evidence, placeholder content, and insufficient artifact content. Simulation detection permits declared fixtures while flagging undeclared demo output or suspicious static values.

## Environment compatibility

Environment validation records runtime, dependency, schema, service, and minimum-operation constraints before execution. Incompatible assumptions must produce diagnostics. Stateful schemas or services require a passing minimal real operation, such as create-and-read, before they are considered compatible.

## Integration validation

Integration validation requires primary, failure, and recovery scenarios. Each scenario must cross at least two relevant boundaries, pass, and include evidence. A successful compile or isolated unit test does not substitute for this validation.

## Authority policy

Planning, implementation, and approval are separate roles. Planners may plan, implementers may execute, and auditors may approve or reopen. Overrides require an authorized actor, a reason, and evidence. The emperor may override authority boundaries explicitly.

## Traceability

Trace links connect a requirement to a work item, attempt, artifact, evidence, and version reference. Attempts are append-only and require unique IDs and output hashes.

## Iteration policy

Iteration limits produce explicit completed, incomplete, blocked, or iteration-limited outcomes. Limits increase only after measurable progress and never beyond a bounded maximum. Unproductive loops stop with a diagnostic instead of being reported as success.

## Visual validation

Visual observations require an artifact reference, requirement references, viewport metadata when relevant, accessibility inspection, and runtime metadata. Visual references can be compared without assuming a framework or design system.

## Final report

The final report reconciles the original objective, approved plan, implementation summary, and requirement evidence. It includes coverage states, risks, and follow-ups in Markdown and machine-readable form.

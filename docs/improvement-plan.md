# Kampaku Improvement Plan

This is a living backlog. Each item will be implemented and annotated with progress and observations as work proceeds.

## 1. Project-agnostic, executable Definition of Done

**Impact: Critical**

Every work item must define observable acceptance evidence appropriate to its deliverable. Evidence may be a passing command or check, an artifact at a specified path, a documented API or UI behavior, a media or document result, a dataset query, or an explicit publication, export, or persistence outcome. File existence or compilation alone is insufficient unless that is the actual deliverable.

Kampaku must reject vague criteria, record which evidence was collected, and keep the item unverified when a criterion cannot be executed or inspected. This rule applies equally to software, research, design, documents, data, media, operations, and other project types.

**Implementation notes**

- Planner prompts require observable evidence without assuming a software project.
- Plan validation recognizes project-agnostic evidence forms.
- Worker results now include structured `evidence` records with kind, subject, pass/fail state, and observation timestamp for checks and inspected artifacts.
- Core now validates structured evidence during work-item closure, blocks any result containing invalid or failed evidence, and includes the observations in completion journal output.
- Follow-up work should persist evidence as first-class records and add executor capabilities for each evidence type.

### Point 1 backlog

- [x] Persist evidence as first-class Core records (event-backed and queryable through the Core API).
- [x] Link each evidence record to a specific acceptance criterion (stable criterion references are emitted by worker verifiers).
- [x] Define a project-agnostic evidence type registry.
- [x] Record the tool or reviewer that produced each observation.
- [x] Require objective criterion coverage before project closure.
- [x] Add an API to query persisted job evidence and attempt history.
- [x] Show evidence coverage in completion reports.
- [x] Add tests for evidence-driven closure and objective coverage.
- [x] Use one strict evidence contract; legacy formats are intentionally unsupported.
- [x] Add a review workflow for evidence that cannot be automated.

### Pre-point-3 hardening backlog

- [x] Assign stable IDs to every acceptance criterion.
- [x] Send criterion IDs to workers with each work item.
- [x] Require every evidence record to reference a criterion ID.
- [x] Allow one evidence record to cover multiple criteria.
- [x] Reject file or command evidence that does not prove the criterion content.
- [x] Report criteria with missing or insufficient evidence.
- [x] Test one-to-one, one-to-many, uncovered, and rejected criterion mappings.

## 2. Final audit against the user's product objective

**Impact: Critical**

Before project completion, Kampaku must compare the original objective with the implemented and verified deliverables. The audit must identify covered, partial, missing, blocked, and unverified requirements with evidence references. It must work for software, research, design, documents, data, media, operations, and mixed projects.

### Point 2 backlog

- [x] Normalize objective text into stable requirement records.
- [x] Generate a requirement coverage matrix from normalized requirements and evidence.
- [x] Require an evidence reference for a requirement to be considered covered.
- [x] Add a final project gate that blocks completion when the objective audit has not passed.
- [x] Produce a human-readable and machine-readable final audit report.
- [x] Add tests for complete, partial, missing, blocked, and mixed-project coverage.

### Point 2 progress

- [x] Add a project-agnostic coverage evaluator that classifies each requirement as covered, partial, missing, blocked, or unverified and produces pass, conditional, or fail verdicts.
- [x] Add a human-readable Markdown and machine-readable coverage report builder.
- [x] Add an explicit completion assertion that rejects failed objective audits.
- [x] Persist objective requirements at goal intake and enforce a passing objective audit before project completion.
- [x] Wire the evaluator into project completion and persist the objective requirement set.

### Point 5 closed capabilities

Each capability below is available to the worker loop, routed from acceptance criteria, and denied outside the work-item capability allowlist:

| Capability | Tool | Evidence produced |
|------------|------|-------------------|
| Command checks | `run_check` | `behavior` / `command` |
| Repository artifacts | `inspect_artifact`, `verify_file` | `artifact` / `file-inspection` |
| Documents | `inspect_document` | `artifact` / `file-inspection` with extracted text |
| Images | `inspect_image`, `compare_images` | `artifact` / `renderer` |
| Audio | `inspect_audio` | `artifact` / `renderer` |
| Video | `inspect_video` | `artifact` / `renderer` |
| Datasets | `inspect_dataset`, `query_dataset` | `data` / `file-inspection` |
| Browser workflows | `run_browser_session` | `behavior` / `browser` |
| Human review | `request_review` | `decision` / `manual-review` |

## 3. Planning with end-to-end vertical slices

**Status: Open**

This phase will redesign planning around end-to-end slices that cross the relevant deliverable boundaries for each project type. It must not assume that a project is software.

### Point 3 backlog

- [x] Define a project-agnostic vertical slice model.
- [x] Require each slice to produce an observable user or stakeholder outcome.
- [x] Add plan schema and planner instructions for mapping slices to requirements, work items, and evidence.
- [x] Add a validation gate that can reject plans without vertical slices; planner integration remains the next wiring step.
- [x] Define optional domain-skill examples as illustrative guidance, never as a closed project taxonomy.

## 4. Real validation for every acceptance criterion

**Status: Open**

This phase will ensure every acceptance criterion is executed or inspected with the appropriate tool and cannot be accepted from model claims alone.

### Point 4 backlog

- [x] Parse acceptance criteria into executable or inspectable checks.
- [x] Route each check to an appropriate verification capability.
- [x] Persist criterion-level outcomes and evidence references.
- [x] Block completion when required criteria are missing, failed, or unverified.
- [x] Add integration tests for mixed verification methods.

## 5. Complete execution environment for workers

**Status: Open**

Workers must be able to execute, inspect, and validate the deliverable types required by a project, without assuming that the work is code.

### Point 5 backlog

- [x] Define a capability contract for commands, files, APIs, browser sessions, documents, media, data, and manual review.
- [x] Define a policy contract for project-scoped execution with allowlists and timeouts.
- [x] Add artifact inspection capability with bounded metadata and text extraction.
- [x] Add endpoint and service interaction capability with HTTPS/localhost restrictions and timeout.
- [x] Add browser-based page inspection over localhost/HTTPS.
- [x] Add document, image, audio, and video metadata inspection capability.
- [x] Inspect text datasets and structured artifacts through the artifact capability.
- [x] Carry structured outputs, diagnostics, and timestamps in verification results and evidence records.
- [x] Define capability permission checks for work-item and repository policy.
- [x] Propagate required verification capabilities from work-item criteria into job input.
- [x] Enforce the work-item capability allowlist before worker tool execution.
- [x] Validate worker capability integration with the full worker test suite.
- [x] Add tests for capability discovery, denial, timeout policy, and successful execution metadata.

### Point 5 expanded backlog and observations

- [x] Add `request_endpoint` for localhost and HTTPS GET/HEAD checks with timeout and bounded output.
- [x] Add `inspect_ui` for localhost/HTTPS page inspection, HTTP status, title, and bounded HTML.
- [x] Add `inspect_artifact` for bounded metadata and text extraction from common structured formats.
- [x] Add `inspect_media` for document and media format metadata without upload or decoding.
- [x] Add real browser runtime support for navigation, screenshots, and accessibility inspection.
- [x] Add browser actions for clicks, forms, keyboard input, and multi-step workflows.
- [x] Add PDF and DOCX text extraction and structural inspection.
- [x] Add image visual inspection and comparison; OCR remains unavailable and fails closed.
- [x] Add audio duration, codec, and bounded signal inspection; speech analysis remains unavailable and fails closed.
- [x] Add video duration, dimensions, and track inspection; frame extraction and transcripts remain unavailable and fail closed.
- [x] Add CSV and JSON dataset queries with schema and invariant checks; SQL remains unavailable and fails closed.
- [x] Attach capability output, diagnostics, and logs to criterion-level evidence records.
- [x] Add capability integration tests, including denial, malformed input, unsupported formats, and successful execution.

Observation: `apps/worker/src/tools/deliverable-inspection.ts` decodes PDF, DOCX, PNG, JPEG, WAV, MP3, MP4, CSV, and JSON with Node builtins only. Capabilities that need an external model or engine (OCR, speech analysis, video frames, SQL) raise `INSPECTION_UNSUPPORTED` instead of returning a guess, and `INSPECTION_MALFORMED` for corrupt input.

## 6. Reliable blocker handling and retries

**Status: Open**

Blockers must be durable, actionable, and safely recoverable. A resolved blocker must requeue the affected work, preserve context, and prevent duplicate or unsafe execution.

### Point 6 backlog

- [x] Define explicit blocker lifecycle transitions and resolution evidence states.
- [x] Define safe requeue rules after valid resolution, preventing active-job duplicates.
- [x] Preserve structured failed-attempt context for retries.
- [x] Define bounded retry policies with exponential backoff.
- [x] Detect repeated identical failures and stop blind retries.
- [x] Escalate unresolved blockers to the correct owner.
- [x] Distinguish tool failure, task failure, dependency block, and decision dependency states; reuse the existing question flow.
- [x] Prevent duplicate jobs during retry and recovery.
- [x] Add recovery tests for resolution, retry, escalation, duplicate prevention, and repeated failure.

## 7. Quality gates resistant to false positives

**Status: Open**

Quality gates must distinguish verified outcomes from compilation, file presence, model claims, placeholders, and incomplete attempts.

### Point 7 backlog

- [x] Reject iteration-limit results without complete evidence.
- [x] Detect placeholder and hardcoded demo output.
- [x] Require required checks to be present and passing.
- [x] Require artifacts to contain meaningful content when content is part of the criterion.
- [x] Identify interactive criteria that require behavior checks.
- [x] Add quality gate reasons to closure decisions.
- [x] Add integration tests for false-positive scenarios.

## 8. Detection of simulated or hardcoded content

**Status: Open**

Quality gates must identify placeholder, fabricated, or hardcoded output that is presented as a real deliverable, while allowing explicitly declared fixtures and examples.

### Point 8 backlog

- [x] Detect placeholder text and generic demo labels.
- [x] Detect suspicious hardcoded metrics and repeated sample values.
- [x] Distinguish declared fixtures, examples, and seeds from production behavior.
- [x] Identify static outputs where a requirement expects persistence or computation.
- [x] Identify deliverables that require provenance for generated research, data, media, and documents.
- [x] Add evidence checks for dynamic behavior and state changes.
- [x] Add a review path signal for ambiguous suspected simulation.
- [x] Add tests for allowed fixtures and rejected simulated deliverables.

## 9. Infrastructure compatibility and validation

**Status: Open**

Kampaku must discover the real execution environment before assigning work, then prove that dependencies, schemas, services, and runtime assumptions work together in a minimal real scenario.

- [x] Detect provider and runtime constraints before planning.
- [x] Validate schemas, migrations, dependencies, and required services.
- [x] Require a minimal real CRUD or equivalent operation where applicable.
- [x] Report incompatible assumptions before execution.

## 10. Integration and smoke tests from the beginning

**Status: Open**

Every project needs an early proof of its primary outcome across the boundaries that matter. Smoke checks should exercise the smallest useful end-to-end path and its failure behavior.

- [x] Generate smoke checks for the primary outcome.
- [x] Test one end-to-end path across relevant boundaries.
- [x] Test failure and recovery paths.
- [x] Require integration evidence before phase closure.

## 11. Clear separation of planner, implementer, and auditor authority

**Status: Open**

Planning, execution, and approval must remain separate responsibilities. Agents may propose and implement, but closure requires independent evidence or an explicitly recorded override.

- [x] Define authority boundaries and override rules.
- [x] Prevent planners from self-approving deliverables.
- [x] Allow auditors to reopen unsupported closures.
- [x] Record all overrides with actor and evidence.

## 12. Plan scope and requirement coverage tracking

**Status: Open**

The plan must make omissions visible before execution. Every objective requirement should be covered, explicitly deferred, or rejected with a recorded scope decision.

- [x] Define requirement scope records and validate mappings before approval.
- [x] Identify requirements excluded from current scope with an explicit reason.
- [x] Record scope changes and their rationale.
- [x] Report uncovered and out-of-scope requirements through a structured scope report.

## 13. Honest project status states

**Status: Open**

Project status must communicate evidence quality and uncertainty, not only workflow position.

### Point 13 backlog

- [x] Define distinct implemented, partial, missing, blocked, and unverified states.
- [x] Prevent one generic done state from hiding uncertainty.
- [x] Expose status reasons and evidence.
- [x] Test status transitions and evidence requirements.

## 14. Commit and evidence traceability

**Status: Open**

Each outcome must be traceable from requirement to work item, attempt, changed artifact, verification, and versioned result. Reports must remain auditable after later attempts.

- [x] Associate requirements, changes, artifacts, checks, and evidence with work items.
- [x] Verify that trace links include a commit or equivalent versioned output.
- [x] Preserve immutable attempt history with unique attempt IDs and output hashes.
- [x] Expose traceability through structured trace links.

## 15. Adaptive iteration limits

**Status: Open**

Execution limits should respond to progress and complexity. Kampaku must stop unproductive loops with a truthful incomplete state and enough context for a safe next attempt.

- [x] Distinguish completed, incomplete, blocked, and iteration-limited outcomes.
- [x] Adjust limits using task complexity and progress within a bounded maximum.
- [x] Stop unproductive loops with actionable diagnostics.
- [x] Test limit and recovery behavior.

## 16. A genuinely usable project starter template

**Status: Open**

Starter templates should remove setup friction while remaining optional and replaceable. They must be runnable from a clean environment and clearly separate examples from real behavior.

- [x] Define starter templates by capability, not domain assumptions.
- [x] Require runnable checks, documentation, and seed/example separation.
- [x] Define clean-environment validation requirements.
- [x] Keep templates optional and replaceable.

## 17. Browser-based visual validation

**Status: Open**

Visual and interactive outcomes need direct inspection in the relevant runtime, including accessibility and responsive behavior where those are part of the objective.

- [x] Capture screenshots for declared visual outcomes.
- [x] Inspect accessibility and responsive states.
- [x] Compare visual evidence against declared requirements.
- [x] Preserve artifacts and browser metadata.

## 18. Domain skills for complex product categories

**Status: Open**

Domain skills should add bounded expertise, checks, and evidence guidance without turning the core into a closed list of project types.

- [x] Define optional domain skills with bounded responsibilities.
- [x] Keep domain examples illustrative and non-exhaustive.
- [x] Require skills to provide checks and evidence guidance.
- [x] Test skill composition and responsibility conflicts.

## 19. Provider-agnostic model execution

**Status: Open**

Model execution must depend on a protocol and negotiated capabilities rather than provider names, so planning and workers remain portable across model services.

- [x] Complete provider-neutral configuration and naming.
- [x] Define a provider-neutral contract for structured output, tool calls, streaming, retries, and timeouts.
- [x] Support model capability negotiation.
- [x] Test provider substitution through a shared protocol profile.

## 20. Final report comparing intent, plan, and reality

**Status: Open**

The final report must reconcile the original request, approved scope, actual work, and collected evidence, including gaps and follow-ups in both human and machine-readable forms.

- [x] Compare original objective, approved plan, implementation, and evidence.
- [x] Report completed, partial, missing, blocked, and unverified requirements.
- [x] Include risks, limitations, and follow-ups.
- [x] Produce human-readable and machine-readable reports.

## 21. Durable human gate for root-agent questions

**Status: In progress**

A decision the emperor owes must be a first-class, queryable record, not prose in a transcript. The
`<kampaku-question>` tag is the protocol the root agent must use to ask for a decision, and the web
client rendered it as a widget while persisting nothing. The consequence was that a required question
was invisible to `questions list` and to `GET /api/v1/questions`, so the human gate could not be
answered through any surface: the only copy lived in the conversation log. Found by the LangProbe
capability probe (gap G-01), where the root agent asked a required design question that the platform
silently dropped.

The durable question path already existed, but only for sub-agent-to-superior questions: `ask_superior`
is the only writer, and `ask()` deliberately rejects a parentless asker ("Kampaku must ask the emperor
directly"). The agent-to-emperor channel therefore had no representation at all.

**Implementation notes**

- `QuestionStore.askEmperor()` records a question awaiting the emperor, reusing the existing
  convention that `recipientAgentId === KAMPAKU_AGENT_ID` means "awaiting the emperor" (the same way
  `escalate()` already represents it). Because `answer()` defaults to that id, the new records are
  answerable from the CLI and the UI with no change to those paths.
- `parsePendingQuestion()` in Core mirrors the web client's acceptance rules, so a question cannot be
  visible in chat but missing from the pending list (or the reverse).
- Persisting the gate happens when the chat turn is written, is idempotent by question id (the
  protocol tells the agent to re-ask with the same id), and never fails the reply it belongs to.
- `ask()` keeps refusing a parentless asker; the agent-to-agent rule is unchanged and locked by a test.

**Remaining work**

- [ ] Surface the pending emperor question in the operator UI's existing pending-questions panel with
      an inline answer control (the panel already reads the same API, so this is presentation work).
- [ ] Decide whether an unanswered `required: true` question should park project execution, rather
      than only being listed.
- [ ] Have `judge`/review tooling treat an open emperor question as an explicit unresolved-state gate.

## 22. Conversation continuity on every surface

**Status: In progress**

A single-message chat turn must belong to a conversation, and every surface must be able to continue
one. The CLI could not: `kampaku chat -m` created a brand-new conversation on every invocation and
dropped the conversation id, even though `sendKampakuMessage` accepted one and `runRepl` tracked one
afterwards. The web UI and `POST /api/v1/agents/kampaku/chat` both accepted `conversation_id`, so the
Commander CLI was the only surface that could not continue a conversation — a direct violation of the
"Web/CLI parity" golden rule in `docs/architecture/agent-hierarchy.md`.

The effect on an operator driving a multi-turn arc was not cosmetic: with no history, the agent
started every turn from nothing and re-asked for decisions it had been given one turn earlier. Found
by the LangProbe capability probe (gap G-02), where a beat asked for a project name, description and
stack that had already been agreed twice in the same data dir.

**Implementation notes**

- `kampaku chat` accepts `--conversation-id <id>` and `-c, --continue` (resume the most recent
  conversation). Resolution lives in `resolveConversationId()`; an unresolvable or failing lookup falls
  back to a new conversation and says so, rather than aborting the turn.
- The single-message output now prints `conversation: <id>` in its metadata line, so a one-shot turn is
  continuable without querying the API by hand.
- Fixed a supporting defect in `ConversationStore.listConversations`: it ordered by `updatedAt`,
  applied `limit`, and only then filtered by `agentSlug`. A caller asking for "the latest conversation
  of agent x" with `limit: 1` therefore read one conversation *overall* and returned nothing when it
  belonged to another agent. The filter now runs before the limit, and a regression test fails against
  the previous ordering.

**Remaining work**

- [ ] Add a `kampaku conversations` CLI command so the operator can list and resume conversations
      without reaching for the REST API (completes the parity rule for this resource).
- [ ] Decide whether `--continue` should be the default for `chat -m`, with an explicit `--new` to
      opt out, so stateless turns are the deliberate case rather than the accident.
- [ ] Consider surfacing the conversation id in interactive mode too, where it is currently implicit.

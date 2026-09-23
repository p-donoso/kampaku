# 00. Roadmap phase template

Copy this file when adding a roadmap phase. Keep the document in English and use checkboxes for
work that can be verified. Replace every placeholder before treating the phase as ready.

## Phase metadata

- **Phase:** `N — Name`
- **Status:** `Proposed | Ready | In progress | Blocked | Complete`
- **Owner:** `team or role`
- **Dependencies:** `phase numbers, ADRs, or board rows`
- **Related documents:** `links`
- **Last reviewed:** `YYYY-MM-DD`

## Purpose

State the product problem and why it belongs in the software-factory roadmap.

## Outcome

Describe the observable change in operator and agent behavior. Avoid implementation-only outcomes.

## Scope

### In scope

- [ ] `Capability or behavior 1`
- [ ] `Capability or behavior 2`
- [ ] `Capability or behavior 3`

### Out of scope

- [ ] `Explicit exclusion 1`
- [ ] `Explicit exclusion 2`

## Design rules

- [ ] Preserve language, project-type, and architecture agnosticism.
- [ ] Preserve project/repository isolation.
- [ ] Preserve least privilege and human decision gates.
- [ ] Preserve durable state and interruption safety.
- [ ] Preserve truthful claims and criterion-level evidence.
- [ ] Avoid adding equivalent entities, tools, skills, or vocabulary.

## Work checklist

### Model and contracts

- [ ] Define canonical entities, fields, states, and relationships.
- [ ] Define ownership, authorization, and scope boundaries.
- [ ] Define compatibility or migration behavior.
- [ ] Update the domain model and relevant ADRs.

### Agent behavior

- [ ] Define minimum context for each role.
- [ ] Define allowed and denied tools.
- [ ] Define questions, blockers, and escalation behavior.
- [ ] Define durable outputs and provenance.

### Operator surfaces

- [ ] Update chat behavior.
- [ ] Update CLI behavior.
- [ ] Update REST/API behavior.
- [ ] Update web UI and Settings where applicable.
- [ ] Confirm ids, fields, states, and errors agree across surfaces.

### Execution and quality

- [ ] Define project-native checks and evidence.
- [ ] Define failure, retry, cooldown, and recovery behavior where applicable.
- [ ] Define interruption, resume, cancellation, and duplicate-work behavior.
- [ ] Define security, privacy, and secret-handling constraints.
- [ ] Define observability and audit records.

### Documentation

- [ ] Update the canonical product document.
- [ ] Update the relevant architecture or concept document.
- [ ] Update project-local documentation contracts when applicable.
- [ ] Update shared knowledge/wiki contracts when applicable.
- [ ] Remove obsolete terminology and broken links.

### Evaluation

- [ ] Add or update an evaluation suite or board row.
- [ ] Add automated regression tests.
- [ ] Test a greenfield project.
- [ ] Test a brownfield or legacy project.
- [ ] Test a non-default language or toolchain when relevant.
- [ ] Test a multi-repository or multi-module shape when relevant.
- [ ] Run from a fresh data directory.
- [ ] Record evidence, limitations, and remaining gaps.

## Acceptance criteria

- [ ] The intended operator journey works end to end.
- [ ] The agent receives only required context and capabilities.
- [ ] Unsupported states fail closed and remain visible.
- [ ] Durable state matches the user-visible report.
- [ ] The result is reproducible from project documentation.
- [ ] No obsolete file or reference remains.

## Risks and open decisions

- [ ] `Risk or unresolved decision`
- [ ] `Risk or unresolved decision`

## Completion record

- **Implemented in:** `commit, PR, or issue`
- **Tests:** `commands and results`
- **Evidence:** `links or paths`
- **Known limitations:** `none or explicit list`
- **Follow-up phase:** `phase number or none`

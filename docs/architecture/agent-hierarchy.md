# Agent hierarchy — the factory's stations and the default platform team

Kampaku uses a tree of persistent agents rooted at `kampaku`. The root is the **front office**; every
agent below it is a station on the line. The default self-improvement project is led by the platform
team described below.

## Three roles, three powers

The boundary between them is what makes the factory honest
([factory contract](../eval/factory-contract.md)):

| Role | Object | May | May not |
|------|--------|-----|---------|
| **Front office** | Root agent `kampaku` | Read state, assess change requests, inspect journals and capacity, open a project container with a linked repository and lead, create and manage sub-agents, delegate a session, ask the emperor structured questions | Submit a plan, mutate a work item, approve a plan, write a repository, reach a shell, close work, read private specialist memory |
| **Line** | Project leads, specialists, workers | Plan inside their project, decompose into work items, execute leased jobs in a sandbox, produce artifacts, report evidence, escalate | Act outside their project, parent work item, or skill scope |
| **Inspection** | Quality gates, evidence validation, claim audit, objective coverage | Reject an unsupported completion, reopen on sabotage, report unverified claims | Mutate the artifact it inspects |

> **Implementation status.** Opening a work order from the agent path is decided
> ([ADR-0005](../adr/0005-factory-authority-model.md)) and implemented: the root agent's allowlist
> includes `create_project`, and the boundary is locked in both directions by
> `apps/core/tests/eval/eval-orchestrator-contract.test.ts`
> ([BOARD F-001](../eval/results/BOARD.md) resolved 2026-09-23). The container is reachable from
> chat, the CLI, REST, and the agent path. That the four surfaces agree in a live run is what
> [eval 01](../eval/01-work-order-intake.md) and [eval 02](../eval/02-three-surfaces.md) still decide.

## The default platform team

The platform maintains itself as a project. Its team is a concrete example of a station layout, not a
template the factory imposes on other projects — other projects get the stations their aspects
require ([eval 03](../eval/03-stations-and-staffing.md)).

```text
kampaku
└── kampaku-manager           [system-architect, github-admin]
    ├── kampaku-ux-ui         [nextjs-dev]
    ├── kampaku-security      [security-review]
    ├── kampaku-fullstack     [kampaku-platform-dev]
    ├── kampaku-qa            [qa-testing]
    ├── kampaku-documenter    [docs-writer]
    ├── kampaku-skillmaster   [skill-builder]
    └── kampaku-auditor       [system-audit]
```

## Responsibilities

- **Kampaku (root)** — front office. Clarifies intent, inspects project and agent state, opens
  containers, appoints the responsible lead, surfaces decisions, and delegates end-to-end work. It
  does not plan, execute, or close.
- **Kampaku manager** — project lead for the default platform project; coordinates specialists,
  triages blockers and questions, and validates work-item coherence.
- **Leaf agents** — own bounded work; execution happens through the work-item → job bridge on a worker.
- **Kampaku auditor** — reviews work-item journals, audits communication quality, and proposes
  improvements to structure, skills, and prompts.

The built-in root definition lives in `apps/core/src/agents/definitions.ts`
(`KAMPAKU_BUILTIN_DEFINITION`). Its tool list is filtered against `KAMPAKU_TOOLS` in
`apps/core/src/agents/runtime/session.ts`; a tool that is not in the definition's list is never
advertised to the model, whatever the prompt says
([the contradiction](../adr/0005-factory-authority-model.md)).

## Escalation workflows

Agents escalate to their direct superior (`parentId`) through two parallel flows:

| Flow | Tool | When to use |
|------|------|-------------|
| **Question** | `ask_superior` | A missing decision or piece of information needed to continue safely |
| **Blocker** | `report_blocker` | An unsolvable problem: a dependency, a bug, a capability gap, an external failure |

Both flows block the linked work item and its descendants until cleared. `ask_superior` deliberately
refuses a parentless asker: the root agent escalates to the emperor through its own protocol, not
through the sub-agent tool.

**Manager triage (on receiving a blocker):**

1. **Resolve** — provide instructions (`resolve_blocker`)
2. **Delegate** — create a work item for another agent (`delegate_blocker`)
3. **Convert to a question** — reclassify as a decision need (`convert_blocker_to_question`)
4. **Escalate** — pass upward as a blocker (`escalate_blocker`)

**Manager triage (on receiving a question):**

1. **Answer** (`answer_question`)
2. **Escalate** (`escalate_question`)

Escalation continues up the hierarchy until the root agent surfaces the item to the emperor in the web
dashboard or the CLI.

## Emperor-directed questions are durable

A `<kampaku-question>` block that ends a chat reply is **persisted** as a pending question, not only
rendered. When the chat turn is written, Core parses the tag and records the question with
`QuestionStore.askEmperor()`, which addresses it to the emperor by reusing the existing
"awaiting the emperor" convention (`recipientAgentId === KAMPAKU_AGENT_ID` — the same representation
`escalate()` uses when a question reaches the top of the hierarchy).

What an agent or operator can rely on:

- The question is visible in `kampaku questions list`, in
  `GET /api/v1/questions?status=pending`, and in the operator UI's pending-questions panel, which
  reads the same endpoint.
- It is answerable without reading logs: `kampaku questions answer <id> …`, or the API's answer route.
  `answer()` defaults the answerer to the emperor, so no extra argument is needed.
- Re-asking with the same question id updates nothing and creates no duplicate, which is what the
  protocol instructs when an agent adds context and asks again. Dedupe covers **all** statuses, not
  only pending: an id that was already used is already on record.
- Core's parser accepts exactly what the web client renders (`type` is one of `text`, `single_choice`,
  `multiple_choice`, `boolean`; choice questions need two or more non-empty options; `required`
  defaults to true). A malformed tag is ignored, never stored.

> **Open gap.** The question is durable, but answering one asked from chat does not resume work,
> because chat conversations carry no project, so nothing is parked. Either required questions must
> park linked work, or the surfaces must state that a following turn is needed
> ([BOARD F-007](../eval/results/BOARD.md), [eval 10](../eval/10-human-in-the-loop.md)).

## Risks a lead raises

A lead that sees an exposure it must not work around records it with `report_risk` instead of silently
absorbing it. The risk is a journal entry (`risk_reported`), it does **not** block the work item that raised
it, and it is answered with `update_risk` — mitigate, accept, or escalate, with an outcome.

Two properties make it a gate rather than a note:

- **An open high or critical risk stops `play`** (`open_high_risk`), and the refusal **names the risk** —
  title, id, impact — not only how many there are.
- **The emperor can read and answer it without an agent**: `kampaku risks list`, `kampaku risks show <id>`,
  and `kampaku risks mitigate | accept | escalate <id> --outcome <text>`, over the same journal entries and
  through the same writer the agent tool uses. An acceptance names who accepts the exposure.

See [Risk register](risk-register.md) for the storage, the routes, and the two rules a disposition must
satisfy ([BOARD F-084](../eval/results/BOARD.md): the surface was missing, so a gate the operator could be
stopped by was a gate they could not clear).

The same requirement applies one layer in, to the gate that decides whether a **leaf is done**. A work item
that reads `blocked` while its job succeeded and nothing is pending is a gate too, and it now names the
closure rule that refused it — the item, the field it read, and the command that clears it — with
`kampaku projects blocked` to read them and `kampaku projects closure` to discharge one. See
[Closure refusals](closure-refusals.md) ([BOARD F-088](../eval/results/BOARD.md): a leaf run `s08r9` spent
two succeeded jobs and two of the operator's decisions on, and no surface said why).

## Long turns and client timeouts

A chat turn is a model loop with tool calls and can legitimately run for minutes on a large reasoning
model. The CLI's HTTP client therefore sets its own timeout (`KAMPAKU_CLIENT_TIMEOUT_MS`, default 30
minutes) rather than inheriting the runtime's short default, and the transport's own headers/body
timeouts are raised to match — otherwise the configured ceiling is not the binding limit.

This matters because of *when* a turn is persisted: the conversation is written after the response
returns, so a client that gives up mid-turn loses the record of the turn while the tool side effects
already performed on the server remain. An operator then sees a failure and cannot tell what happened.
A timed-out call therefore states that the request timed out, names the env var, and says the
operation may still be running, with the commands to check what landed. Treat a timeout as
"unknown", never as "did not happen".

> **Open gap.** A turn's in-progress state is not persisted, so an interrupted turn is invisible while
> it runs ([BOARD F-013](../eval/results/BOARD.md)).

## Ground truth outranks the conversation

Model prose becomes its own source of truth: an agent that asserted something two turns ago will
repeat it, and the conversation replays it verbatim. Two mechanisms counter that, and they are
complements rather than duplicates:

- **Before the turn**, `renderDurableState()` injects a compact block — projects with status, lead and
  repository count, per-project work-item counts, pending questions split by whether they await the
  emperor or an agent, and pending blockers — as a system message *after* the history and immediately
  before the user turn. It states its precedence explicitly: if an earlier message contradicts the
  block, the block wins.
- **After the turn**, `auditTurnClaims()` compares the reply against durable snapshots taken before and
  after that turn — project slugs, agent slugs, `file://` repository paths, and work-item count — and
  reports findings the reply does not support. A turn with zero tool calls cannot have created
  anything, whatever its reply says; that is treated as the strongest signal.

The audit is deliberately narrow: it reconciles a small set of entity kinds and is not a general
fact-checker. A false accusation against a correct reply would be its own kind of dishonesty, so it
prefers silence to speculation.

## Golden rules

- **Web/CLI parity** — every capability in `apps/core` must be available through the REST API and the
  Commander CLI; neither surface may do something the other cannot. This includes conversation
  continuity (`kampaku chat --conversation-id <id>` / `--continue`), because an operator driving the
  CLI and a browser user must not get different answers to the same request.
- **Complete CRUD** — each managed resource ships Create, Read, Update, Delete across contracts,
  application layer, API, CLI, and web UI. The **agent tool surface counts as a surface**: a capability
  that is part of an agent's job needs a tool, authorized in code, not a REST-only path. Opening a
  top-level project is front-office-only, so a delegated sub-agent cannot provision containers beyond
  its delegation.
- **Least privilege** — agents, skills, tools, and endpoints get the minimum access their role needs.
  Enforce it in the tool handler from the runtime scope and lock it with a test that proves the
  **refused** case, not only the allowed one.
- **Runtime authorization** — mutating tools enforce actor, project, parent-work-item, and skill scope
  in code. Prompts are not authorization.
- **A refusal must teach** — an error a caller is guaranteed to read is a better steering surface than
  an instruction buried in a long prompt. A refusal that names the tool which does the job prevents
  the caller from improvising a mechanism that does not exist.

## Bootstrap

Run `kampaku bootstrap` (or start `kampaku serve`) to seed skills from `packages/contracts/skills/`
and create the platform team when missing. The default project is linked to `kampaku-manager` as
project lead.

## Related

- [Factory contract](../eval/factory-contract.md) — the authority model as an oracle
- [ADR-0005](../adr/0005-factory-authority-model.md) — the front-office decision
- [Domain model](../concepts/domain-model.md) — canonical vocabulary
- [Skills](../concepts/skills.md) — the catalog and default assignments

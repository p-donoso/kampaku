# Agent hierarchy — Kampaku platform team

Kampaku uses a tree of persistent agents rooted at `kampaku`. The default self-improvement project is led by the platform team below.

## Target hierarchy

```
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

- **Kampaku** — clarifies intent, inspects project health, surfaces decisions, and routes responsibility; it does not mutate projects, work items, agents, or repositories.
- **Kampaku Manager** — project lead for the default Kampaku self-improvement project; coordinates specialists, triages blockers and questions, and validates work-item coherence.
- **Leaf agents** — own micro-tasks; execution happens via work-item → job bridge on the worker.
- **Kampaku Auditor** — reviews work-item journals, audits communication quality, and proposes improvements to structure, skills, and prompts.

Built-in Kampaku definition lives in `apps/core/src/agents/definitions.ts` (`KAMPAKU_BUILTIN_DEFINITION`).

## Escalation workflows

Agents escalate to their direct superior (`parentId`) via two parallel flows:

| Flow | Tool | When to use |
|------|------|-------------|
| **Question** | `ask_superior` | Missing decision or information needed to continue safely |
| **Blocker** | `report_blocker` | Unsolvable problem: dependency, bug, skill gap, external failure |

Both flows block the linked work item (and descendants) until cleared.

**Manager triage** (when receiving a blocker):

1. **Resolve** — provide instructions (`resolve_blocker`)
2. **Delegate** — create a work item for another agent (`delegate_blocker`)
3. **Convert to question** — reclassify as a decision need (`convert_blocker_to_question`)
4. **Escalate** — pass upward as a blocker (`escalate_blocker`)

**Manager triage** (when receiving a question):

1. **Answer** (`answer_question`)
2. **Escalate** (`escalate_question`)

Escalation continues up the hierarchy until Kampaku surfaces the item to the emperor (web dashboard / CLI).

## Chat UI formatting

Kampaku chat and pending-question panels render **GitHub-flavored Markdown**. Agents should structure emperor-facing replies with headings, lists, code blocks, and tables. Keep `<kampaku-question>` prompt fields as short plain text; put context and tradeoffs in markdown prose above the tag or in `ask_superior` `context`.

## Long turns and client timeouts

A chat turn is a model loop with tool calls and can legitimately run for minutes on a large reasoning
model. The CLI's HTTP client therefore sets its own timeout (`KAMPAKU_CLIENT_TIMEOUT_MS`, default 30
minutes) rather than inheriting the runtime's short default.

This matters because of *when* a turn is persisted: the conversation is written after the response
returns, so a client that gives up mid-turn loses the record of the turn while the tool side effects
already performed on the server remain. An operator then sees a failure and cannot tell what happened.
A timed-out call therefore states that the request timed out, names the env var, and says the
operation may still be running — with the commands to check what landed. Treat a timeout as
"unknown", never as "did not happen".

## Emperor-directed questions are durable

A `<kampaku-question>` block that ends a chat reply is persisted as a pending question, not only
rendered. When the chat turn is written, Core parses the tag and records the question with
`QuestionStore.askEmperor()`, which addresses it to the emperor by reusing the existing "awaiting the
emperor" convention (`recipientAgentId === KAMPAKU_AGENT_ID`, the same representation `escalate()`
uses when a question reaches the top of the hierarchy).

Consequences an agent or operator can rely on:

- The question is visible in `kampaku questions list` and `GET /api/v1/questions?status=pending`, and
  in the operator UI's pending-questions panel, which reads that same endpoint.
- It is answerable without reading logs: `kampaku questions answer <id> …`, or the API's answer
  endpoint. `answer()` defaults the answerer to the emperor, so no extra argument is needed.
- Re-asking with the same question id updates nothing and creates no duplicate, which is what the
  protocol instructs when an agent adds context and asks again.
- Rules are identical on both sides: Core's parser accepts exactly what the web client renders
  (`type` is one of `text`, `single_choice`, `multiple_choice`, `boolean`; choice questions need two
  or more non-empty options; `required` defaults to true). A malformed tag is ignored, never stored.

Sub-agent to superior questions keep using the `ask_superior` tool: `ask()` still rejects a parentless
asker, so the agent-to-agent routing rule is unchanged.

## Golden rules (platform team)

- **Web/CLI parity** — every capability in `apps/core` must be available via REST API (`apps/web`) and Commander CLI; neither surface may do something the other cannot.
  - Conversation continuity is part of this rule: the REST API accepts `conversation_id`, so the CLI
    must be able to continue a conversation too (`kampaku chat --conversation-id <id>` or
    `kampaku chat --continue`). Without it, an operator's turns share no history while a browser
    user's do, and the same request produces different answers depending on the surface.
- **Complete CRUD** — each managed resource ships Create, Read, Update, Delete across contracts, application layer, API, CLI, and web UI.
  - The **agent tool surface counts as a surface**. `create_project` was reachable from the REST API
    but had no tool, so an agent asked to create a project could only update existing ones and would
    improvise around the missing half of the request. When a capability is part of an agent's job,
    the tool must exist and be authorized — not left to the REST API.
  - **Creating a top-level project is root-agent-only.** A delegated sub-agent provisioning new
    top-level projects would widen its own reach beyond its delegation.
- **Least privilege** — agents, skills, tools, and endpoints get minimum access required for their role.
  - Enforce it in the tool handler from the runtime scope, and lock it with a test proving the
    refused case, not only the allowed one.
- **Runtime authorization** — mutating tools enforce actor, project, parent-work-item, and skill scope in code; prompts are not authorization.

## Bootstrap

Run `kampaku bootstrap` (or start `kampaku serve`) to seed skills from `packages/contracts/skills/` and create the platform team when missing. The default project is linked to `kampaku-manager` as project lead.

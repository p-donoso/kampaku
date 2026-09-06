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
- **Kampaku Manager** — project lead for the default Kampaku self-improvement project; coordinates specialists, triages blockers and questions, and validates sprint coherence.
- **Leaf agents** — own micro-tasks; execution happens via work-item → goal → job bridge.
- **Kampaku Auditor** — reviews work-item journals, audits communication quality, and proposes improvements to structure, skills, and prompts.

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

Escalation continues up the hierarchy until Kampaku surfaces the item to the emperor (web dashboard / CLI / REPL).

## Chat UI formatting

Kampaku chat and pending-question background panels render **GitHub-flavored Markdown**. Agents should structure emperor-facing replies with headings, lists, code blocks, and tables. Keep `<kampaku-question>` prompt fields as short plain text; put context and tradeoffs in markdown prose above the tag or in `ask_superior` `context`.

## Golden rules (platform team)

- **Web/CLI parity** — every capability in apps/core must be available via REST API (apps/web) and Commander CLI; neither surface may do something the other cannot.
- **Complete CRUD** — each managed resource ships Create, Read, Update, Delete across contracts, application layer, API, CLI, and web UI.
- **Least privilege** — agents, skills, tools, and endpoints get minimum access required for their role.

Defined in skills: `system-agent-roster` (agent creation), `kampaku-platform-dev` (implementation), `security-review`, `nextjs-dev`, `qa-testing`.

## Bootstrap

Run `kampaku bootstrap` to seed skills from `packages/contracts/skills/` and create the platform team when missing. The default project is linked to `kampaku-manager` as project lead.

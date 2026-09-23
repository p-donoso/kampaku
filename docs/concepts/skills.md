# Skills

Skills are modular capabilities assignable to sub-agents. They define worker capabilities, tool access, and reusable Markdown instructions.

## Skills follow the aspects on disk

The catalog below is the **platform's own** station vocabulary, used by the default self-improvement
team. It is not a roster the factory imposes on other projects.

A project's stations come from the aspects that actually exist in it
([eval 03](../eval/03-stations-and-staffing.md)): a schema, a pipeline, a platform, a compatibility
surface, an embedded target. Two consequences follow, and both are tracked obligations rather than
done work:

- **A specialist the emperor names must receive skills**, whatever its suffix. A specialist with zero
  skills is a defect, not a missing feature.
- **Aspect coverage is incomplete today.** The catalog is web-application-shaped: it has no station for
  data and pipelines, IaC, mobile, embedded, or a compatibility-bound library, while the factory
  promises those project types by invariant
  ([agnosticism invariants §2](../concepts/agnosticism-invariants.md)). Closing that gap is part of the
  [stack-neutral evidence phase](../roadmap/03-quality-and-testing.md).

Skills must never bake a scenario into a product default: no demo project name, stack, entrypoint, or
vendor in a skill's instructions or tool description. Scenario copy belongs in eval prompts and stubs
([BOARD F-003](../eval/results/BOARD.md)).

## File format

The source of truth uses the [open Agent Skills specification](https://agentskills.io/specification):

```text
packages/contracts/skills/<slug>/
└── SKILL.md
```

Each `SKILL.md` has YAML frontmatter followed by Markdown instructions. The
standard `name` field is the slug and must match its parent directory;
`description` drives discovery; and `allowed-tools` declares the tool list.
Kampaku-specific display name, capabilities, and default assignment live as
string values in the standard `metadata` map under namespaced `kampaku-*`
keys. At runtime the catalog codec maps this portable file to the existing
API and database record, where the Markdown body is exposed as
`promptFragment` for backward compatibility.

## Catalog

| Slug | Capabilities | Tools | Purpose |
|------|--------------|-------|---------|
| `nextjs-dev` | code.agent | code-agent | Next.js UI development |
| `github-admin` | github.api, code.agent | github, code-agent | GitHub repo management |
| `api-integration` | code.agent | code-agent | REST client integration |
| `docs-writer` | code.agent | code-agent | Technical documentation |
| `system-architect` | code.agent | code-agent | Architecture design |
| `qa-testing` | code.agent | code-agent | Test planning and automated QA |
| `security-review` | code.agent | code-agent | Security audits and hardening |
| `skill-builder` | code.agent | code-agent | Author and maintain skill definitions |
| `kampaku-platform-dev` | code.agent | code-agent | Core, worker, and contracts implementation |
| `workflow-questions` | workflow.questions | ask_superior, answer_question, escalate_question | Question escalation (default) |
| `workflow-blockers` | workflow.blockers | report_blocker, resolve_blocker, … | Blocker escalation (default) |
| `workflow-memory` | workflow.memory | recall, remember_log, remember_learning | Persistent memory (default) |
| `workflow-execution` | workflow.execution | execute_work_item | Work item execution (default) |
| `workflow-specialist-delegation` | workflow.delegation | submit_intent, update_work_item, create_sub_agent | Domain-owned task decomposition |
| `system-intake` | system.intake | triage_intent | Read-only software-scope check, request classification, and routing; out-of-scope work is refused with the boundary named |
| `workflow-peer-review` | workflow.peer_review | request_peer_review, submit_peer_review | Independent review before sensitive closure |
| `system-change-control` | system.change_control | assess_change_request | Read-only scope and approval assessment |
| `workflow-capacity` | workflow.capacity | get_agent_capacity | Workload, job, complexity, and skill-aware capacity inspection |
| `workflow-handoff` | workflow.handoff | request_handoff, accept_handoff | Evidence-backed transfer with explicit acceptance |
| `workflow-reporting` | workflow.reporting | get_reporting_status, submit_completion_report, remember_log, propose_wiki_edit | Cross-channel reporting projection |
| `workflow-filesystem` | workflow.filesystem | list_allowed_folders | Allowed folders (default) |
| `workflow-wiki` | workflow.wiki | get_wiki_tree, get_wiki_page, propose_wiki_edit, post_wiki_comment, list_wiki_pending, approve_wiki_edit, reject_wiki_edit | Project wiki read/write/discuss (default) |
| `system-delegation` | system.delegation | submit_intent, get_project, get_agent_dashboard | Kampaku project delegation |
| `system-agent-roster` | system.agents | create/update/delete/list sub-agents | Agent hierarchy management |
| `system-skill-admin` | system.skills | list/create/assign/unassign skills | Skill catalog administration |

## Default skills

Skills with `metadata.kampaku-default: "true"` in `SKILL.md` are assigned automatically to every agent (except Kampaku) on `kampaku bootstrap` and `kampaku serve`. They cannot be unassigned or deleted. Their Markdown instructions are also injected into Kampaku chat from the catalog.

| Slug | Purpose |
|------|---------|
| `workflow-questions` | Report and triage missing decisions |
| `workflow-blockers` | Report and triage unsolvable problems |
| `workflow-memory` | Recall and store logs/learnings across sessions |
| `workflow-capacity` | Inspect workload, jobs, complexity, and skill fit before assignment |
| `workflow-handoff` | Transfer work with structured context and explicit acceptance |
| `workflow-execution` | Start work item execution via the worker |
| `workflow-filesystem` | Discover allowed filesystem folders |
| `workflow-wiki` | Read, propose edits, and discuss project wiki pages |

## System skills (Kampaku orchestrator)

Skills with the `system-*` prefix are catalog-only orchestration capabilities. They are not assigned to sub-agents; Kampaku loads their Markdown instructions at chat runtime.

| Slug | Purpose |
|------|---------|
| `system-delegation` | Project governance and status for project leads |
| `system-agent-roster` | Govern the agent tree and role boundaries |
| `system-skill-admin` | Assign optional skills to sub-agents |
| `system-intake` | Software-scope check and intake classification before planning |

This table is not yet an exhaustive list of the `system-*` catalog; completing it is part of the
[engineering skills phase](../roadmap/07-engineering-skills.md).

## Platform team assignments

| Agent | Skills |
|-------|--------|
| kampaku-manager | system-architect, github-admin |
| kampaku-ux-ui | nextjs-dev |
| kampaku-security | security-review |
| kampaku-fullstack | kampaku-platform-dev |
| kampaku-qa | qa-testing |
| kampaku-documenter | docs-writer |
| kampaku-skillmaster | skill-builder |

## Management

### Web UI

- **Agents → Skills** (`/agents/skills`) — list, search, create, edit, delete skills
- Skill detail shows assigned agents and all catalog fields

### CLI

```bash
kampaku skills list
kampaku skills show <slug>
kampaku skills create --slug <s> --name <n> --description <text> --instructions <markdown> [--capabilities a,b] [--tools a,b]
kampaku skills update <slug> [--name ...] [--description ...] ...
kampaku skills delete <slug> -y
```

### API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/skills` | List skills with assigned agent slugs |
| GET | `/api/v1/skills/:slug` | Skill detail |
| POST | `/api/v1/skills` | Create skill (writes catalog + DB) |
| PATCH | `/api/v1/skills/:slug` | Update skill |
| DELETE | `/api/v1/skills/:slug` | Delete skill (fails if assigned) |

## Assignment

- Kampaku tools: `list_skills`, `assign_skill`, `unassign_skill`
- Stored in `agent_skills` join table
- Exposed on agent API responses as `skills: string[]`
- Bootstrap syncs platform team assignments on `kampaku bootstrap` and `kampaku serve`

## Contracts

Skill definitions live in [packages/contracts/skills/](../../packages/contracts/skills/) and are validated by `npm run contracts:check`. The [skill.schema.json](../../packages/contracts/schemas/skill.schema.json) contract documents the parsed internal record used by the API and database; authored skills use `SKILL.md`.

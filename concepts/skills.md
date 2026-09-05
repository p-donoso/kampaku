# Skills

Skills are modular capabilities assignable to sub-agents. They define worker capabilities, tool access, and prompt fragments.

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
| `workflow-filesystem` | workflow.filesystem | list_allowed_folders | Allowed folders (default) |
| `workflow-wiki` | workflow.wiki | get_wiki_tree, get_wiki_page, propose_wiki_edit, post_wiki_comment, list_wiki_pending, approve_wiki_edit, reject_wiki_edit | Project wiki read/write/discuss (default) |
| `system-delegation` | system.delegation | submit_intent, get_project, get_agent_dashboard | Kampaku project delegation |
| `system-agent-roster` | system.agents | create/update/delete/list sub-agents | Agent hierarchy management |
| `system-skill-admin` | system.skills | list/create/assign/unassign skills | Skill catalog administration |

## Default skills

Skills with `"default": true` in the catalog are assigned automatically to every agent (except Kampaku) on `kampaku bootstrap` and `kampaku serve`. They cannot be unassigned or deleted. Their prompt fragments are also injected into Kampaku chat from the catalog.

| Slug | Purpose |
|------|---------|
| `workflow-questions` | Report and triage missing decisions |
| `workflow-blockers` | Report and triage unsolvable problems |
| `workflow-memory` | Recall and store logs/learnings across sessions |
| `workflow-execution` | Start work item execution via the worker |
| `workflow-filesystem` | Discover allowed filesystem folders |
| `workflow-wiki` | Read, propose edits, and discuss project wiki pages |

## System skills (Kampaku advisor)

Skills with the `system-*` prefix are catalog-only advisor capabilities. They are not assigned to sub-agents; Kampaku loads their prompt fragments at chat runtime.

| Slug | Purpose |
|------|---------|
| `system-delegation` | Project planning and status via submit_intent |
| `system-agent-roster` | Create and manage the agent tree |
| `system-skill-admin` | Assign optional skills to sub-agents |

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

- **Agentes → Skills** (`/agents/skills`) — list, search, create, edit, delete skills
- Skill detail shows assigned agents and all catalog fields

### CLI

```bash
kampaku skills list
kampaku skills show <slug>
kampaku skills create --slug <s> --name <n> [--description ...] [--capabilities a,b] [--tools a,b] [--prompt-fragment ...]
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

Skill definitions live in [kampaku-contracts/skills/](../../kampaku-contracts/skills/) and are validated by [skill.schema.json](../../kampaku-contracts/schemas/skill.schema.json).

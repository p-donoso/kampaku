# Skills

Skills are modular capabilities assignable to sub-agents. They define worker capabilities, tool access, and reusable Markdown instructions.

## Skills follow the aspects on disk

The catalog is the **platform's own** station vocabulary, used by the default self-improvement team.
It is not a roster the factory imposes on other projects. It is a reference for what this platform's
own team does, not a taxonomy any project must adopt.

A project's stations come from the aspects that actually exist in it
([eval 03](../eval/03-stations-and-staffing.md)): a schema, a pipeline, a platform, a compatibility
surface, an embedded target. Two consequences follow, and both are tracked obligations rather than
done work:

- **A specialist the emperor names must receive skills**, whatever its suffix. A specialist with zero
  skills is a defect, not a missing feature.
- **Aspect coverage is incomplete today.** The catalog is web-application-shaped: it has no station for
  data and pipelines, IaC, mobile, embedded, or a compatibility-bound library, while the factory
  promises those project types by invariant
  ([agnosticism invariants §2](../concepts/agnosticism-invariants.md)).

## This catalog is a seed, not a taxonomy

The skills that ship here are a **starting set of suggestions**, not an enumeration of the roles that
exist. Two consequences follow, and they are what keep the three invariants true rather than nominal:

- **A project is staffed from its own evidence.** It is never staffed by matching its aspects against
  this list. A repository containing prompts, a schema, a pipeline, an embedded target, or a
  compatibility surface gets a station for that aspect whether or not a skill already exists for it.
- **When nothing here fits, the factory authors what it needs** — a new skill or a new station. That
  path is [self-extension](../roadmap/18-self-extension.md), and it is why an incomplete catalog is not
  itself the defect: a catalog that *cannot grow* would be, because it would be an implicit taxonomy and
  would fail the second project that does not resemble the first. The operation is `create_skill`, and
  what it authors is **scoped** (see below): a capability one project needs does not become a role
  every project is staffed with.

The seed set is therefore measured on two things only: whether it covers the platform's own work, and
whether the path that grows it actually works.

Skills must never bake a scenario into a product default: no demo project name, stack, entrypoint, or
vendor in a skill's instructions or tool description. Scenario copy belongs in eval prompts and stubs
([BOARD F-003](../eval/results/BOARD.md)).

## Seed skills and project skills

A skill is one of two things, and every read surface says which:

- a **seed skill** — shipped in `packages/contracts/skills`. Its record's `projectId` is null and any
  project's seats may be given it.
- a **project skill** — authored through the runtime for one project, by `create_skill`, by
  `POST /api/v1/skills` with `project`, or by `kampaku skills create --project`. It is a row in the
  instance's catalog and **not** a `SKILL.md`: the seed catalog is the platform's own vocabulary, and a
  file there is both a shell into the platform's repository and — because the next boot re-seeds it for
  every project — a capability published to all of them. It can never be a `default`, and
  `SkillStore.assignSkill` refuses it for a seat that works for another project, so the scope is a
  boundary and not a filter.

A project-scoped skill's slug is catalog-wide, exactly like a seed skill's: `agent_skills.skill_slug` is
one string on every surface, and identity stays one string. A second project wanting the same capability
names its own.

The roster says which a seat holds. `GET /api/v1/agents` carries `skills`, `projectSkills` and a
`capability` block — `{ covered, seed, project, note }` — where `covered: false` means the seat holds
nothing beyond the default set and the note names what would close the gap. That is the difference
between *thirteen skills* and *a capability*: suite 03's [F-022](../eval/results/BOARD.md) is the row
that had to be opened because a station for a Terraform module's network aspect held thirteen defaults
and nothing about networks.

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

## Where the catalog lives

**`packages/contracts/skills/<slug>/SKILL.md` is the source of truth, and this page does not
duplicate it.** Every column a catalog table would carry — slug, purpose, capabilities, allowed
tools, and whether the skill is assigned by default — is machine-readable frontmatter inside each
`SKILL.md`, validated by `npm run contracts:check`.

This page previously carried four hand-maintained copies of that metadata: a catalog table, a default-
skills table, a `system-*` table, and a platform-team table. They had already drifted — ten of the
thirty-five skills were absent from the catalog table, and the `system-*` table admitted in prose that
it was incomplete. A duplicate that has drifted is worse than no duplicate, because it is believed.
Four tables were removed rather than regenerated, and `eval-docs-coherence.test.ts` now fails if a
skill table is reintroduced here.

To read the catalog:

```bash
kampaku skills list          # slug, name, and assigned agents
kampaku skills show <slug>   # the full record, including instructions
```

Or read the files. To find what is assigned by default:

```bash
grep -l 'kampaku-default: "true"' packages/contracts/skills/*/SKILL.md
```

Platform team assignments are declared in
[`apps/core/src/application/bootstrap/kampaku-platform-team.ts`](../../apps/core/src/application/bootstrap/kampaku-platform-team.ts)
and synced on `kampaku bootstrap` and `kampaku serve`.

## Default skills

Skills whose frontmatter sets `metadata.kampaku-default: "true"` are assigned automatically to every
agent except Kampaku, on `kampaku bootstrap` and `kampaku serve`. They cannot be unassigned or deleted,
and their instructions are also injected into Kampaku chat from the catalog.

## System skills

Skills whose slug begins with `system-` are catalog-only orchestration capabilities. They are not
assigned to sub-agents; Kampaku loads their instructions at chat runtime. Which skills those are is
readable from the directory listing rather than restated here.
## Management

### Web UI

- **Agents → Skills** (`/agents/skills`) — list, search, create, edit, delete skills
- Skill detail shows assigned agents and all catalog fields

### CLI

```bash
kampaku skills list
kampaku skills show <slug>
kampaku skills create --slug <s> --name <n> --description <text> --instructions <markdown> [--capabilities a,b] [--tools a,b] [--project <slug>]
kampaku skills update <slug> [--name ...] [--description ...] ...
kampaku skills delete <slug> -y
```

### API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/skills` | List skills with assigned agent slugs |
| GET | `/api/v1/skills/:slug` | Skill detail |
| GET | `/api/v1/skills?project=<slug>` | That project's catalog: seed skills, plus the ones it authored |
| POST | `/api/v1/skills` | Create a seed skill (writes catalog + DB), or with `project` a skill scoped to that project (DB only) |
| PATCH | `/api/v1/skills/:slug` | Update skill |
| DELETE | `/api/v1/skills/:slug` | Delete skill (fails if assigned) |

## Assignment

- Kampaku tools: `list_skills`, `get_skill`, `create_skill`, `assign_skill`, `unassign_skill`
- A project-scoped skill is assignable only inside the project that authored it; the refusal is made in
  `SkillStore.assignSkill`, where the grant is made, not on the read side
- Stored in `agent_skills` join table
- Exposed on agent API responses as `skills: string[]`
- Bootstrap syncs platform team assignments on `kampaku bootstrap` and `kampaku serve`

## Contracts

Skill definitions live in [packages/contracts/skills/](../../packages/contracts/skills/) and are validated by `npm run contracts:check`. The [skill.schema.json](../../packages/contracts/schemas/skill.schema.json) contract documents the parsed internal record used by the API and database; authored skills use `SKILL.md`.

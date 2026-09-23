# 8. Project agent roster

## Two different things

### Skill catalog

A reusable catalog of capabilities and instructions: programming, testing, UX/UI, security, data,
operations, legal and compliance, and other project-relevant expertise. A skill has no project
memory and does not own work by itself.

### Project agent roster

The instantiated team for one project. Each agent uses one or more skills, has a responsibility,
reports to a parent, receives project and module context, and owns private memory for its work.

The same skill may be used by multiple agents. Those agents are not interchangeable: their memory,
scope, decisions, and context remain separate.

## Authority flow

1. Kampaku receives and accepts the work order, identifies the responsible project lead, and
   delegates the project session.
2. The project lead reads the project context and proposes the roster required by the repository,
   objective, modules, and risks.
3. The lead creates or requests agents and sub-agents with bounded responsibilities and reporting
   lines.
4. Agents plan and execute within their project, parent work item, skill, and sandbox boundaries.
5. The lead coordinates the team and escalates decisions, blockers, and staffing changes.

Kampaku is the front office and does not directly design every project team. The lead owns team
formation because the lead has the project context needed to decide which responsibilities exist.

## Example

A project with two independent modules may instantiate:

- `ux-ui-module-a`, using the UX/UI skill and module A context;
- `ux-ui-module-b`, using the UX/UI skill and module B context.

They share capability definitions but not private memory or ownership. A lead may add a shared
reviewer when the modules need a cross-module consistency check.

## Required agent metadata

Each instantiated agent should expose:

- stable id and role name;
- parent and project id;
- assigned skill ids;
- repository, module, and work-item scope;
- responsibility and non-goals;
- private-memory boundary;
- reporting and escalation path;
- lifecycle state and availability;
- creation reason and provenance.

## Invariants

- No agent is created merely because a skill exists.
- No skill grants authority by itself.
- No private memory crosses project or agent boundaries without an explicit, auditable projection.
- Staffing follows discovered project aspects and approved scope.
- The roster remains durable across chat closure, process restart, and model changes.

## Implementation checklist

- [ ] Define one canonical `Agent` entity with role and relationship metadata.
- [ ] Define parent, child, lead, and specialist relationships without duplicate classes.
- [ ] Let the project lead propose staffing from project context.
- [ ] Support multiple instances of one skill with separate scope and memory.
- [ ] Enforce project, module, task, skill, and sandbox boundaries.
- [ ] Persist reporting lines, delegation, lifecycle, and availability.
- [ ] Prevent private memory from crossing agent or project boundaries.
- [ ] Show the roster consistently in chat, CLI, REST, and web.

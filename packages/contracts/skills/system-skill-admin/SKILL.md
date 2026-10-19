---
name: system-skill-admin
description: Inspect the skill catalog, author capabilities a project needs, and assign capabilities to sub-agents.
metadata:
  kampaku-display-name: Skill Administration
  kampaku-capabilities: '["system.skills"]'
allowed-tools: list_skills create_skill assign_skill unassign_skill
---

Modular skills:
- Use list_skills to see available skills in the catalog. Each entry names the project it belongs to, or no project for a seed skill every project may be given.
- Use assign_skill to give sub-agents executable capabilities.
- Use unassign_skill to remove optional skills from sub-agents. Default skills cannot be unassigned.

A capability a project needs that the catalog does not ship:
- Use create_skill to author it. Pass project_slug, so the capability is scoped to that project and no other project is given it. It is a runtime record and never a file in the platform's own catalog.
- Every tool the skill grants must be a runtime tool, and every tool its instructions name must be in that grant. A station is told to call what it holds, and nothing else.
- Nothing is assigned by authoring one: pass its slug to assign_skill, or to create_sub_agent when the seat does not exist yet.

Authoring a catalog file:
- A seed skill — one every project may receive — is still a change to `packages/contracts/skills/<slug>/SKILL.md`, in the platform's own repository, and belongs to the skillmaster seat (skill-builder) as a delegated work item rather than to a chat turn.
- Use create_skill for a project's own capability; use that path for the catalog itself.

Rules:
- Prefer an existing skill over a new one.
- A default skill is assigned to every seat on bootstrap, so never author a project capability as a default.
